import { Injectable, Logger } from '@nestjs/common';
import type { PushToken } from '@prisma/client';
import webpush from 'web-push';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export interface PushMessage {
  title: string;
  body: string;
  link?: string | null;
}

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * 푸시 발송. 앱은 Expo 푸시(키 불필요), 웹은 Web Push(VAPID 키가 있을 때만).
 * 만료·해지된 토큰은 발송 결과를 보고 지운다. 발송 실패는 업무 흐름을 막지 않는다.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private vapidReady: boolean | null = null;

  constructor(private readonly prisma: PrismaService) {}

  webPublicKey(): string | null {
    return this.webEnabled() ? env().VAPID_PUBLIC_KEY! : null;
  }

  private webEnabled() {
    if (this.vapidReady === null) {
      const e = env();
      this.vapidReady = !!(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY);
      if (this.vapidReady)
        webpush.setVapidDetails(
          e.VAPID_SUBJECT ?? 'mailto:help@hwaso.kr',
          e.VAPID_PUBLIC_KEY!,
          e.VAPID_PRIVATE_KEY!,
        );
    }
    return this.vapidReady;
  }

  async send(userId: string, msg: PushMessage) {
    const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
    if (!tokens.length) return;
    await Promise.all([
      this.expo(
        tokens.filter((t) => t.platform === 'expo'),
        msg,
      ),
      this.web(
        tokens.filter((t) => t.platform === 'web'),
        msg,
      ),
    ]);
  }

  private async expo(tokens: PushToken[], msg: PushMessage) {
    if (!tokens.length) return;
    const token = env().EXPO_ACCESS_TOKEN;
    try {
      const res = await fetch(EXPO_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(
          tokens.map((t) => ({
            to: t.token,
            title: msg.title,
            body: msg.body,
            sound: 'default',
            data: { link: msg.link ?? null },
          })),
        ),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      const dead = tokens.filter((_, i) => json.data?.[i]?.details?.error === 'DeviceNotRegistered');
      if (dead.length)
        await this.prisma.pushToken.deleteMany({ where: { id: { in: dead.map((t) => t.id) } } });
    } catch (err) {
      this.logger.warn({ err }, 'expo push failed');
    }
  }

  private async web(tokens: PushToken[], msg: PushMessage) {
    if (!tokens.length || !this.webEnabled()) return;
    const payload = JSON.stringify(msg);
    await Promise.all(
      tokens.map(async (t) => {
        try {
          await webpush.sendNotification(JSON.parse(t.token) as webpush.PushSubscription, payload, {
            TTL: 86_400,
          });
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410)
            await this.prisma.pushToken.delete({ where: { id: t.id } }).catch(() => undefined);
          else this.logger.warn({ err: (err as Error).message, status }, 'web push failed');
        }
      }),
    );
  }
}

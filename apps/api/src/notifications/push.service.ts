import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { PushToken } from '@prisma/client';
import webpush from 'web-push';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { ApnsClient, apnsTokenIsDead, type ApnsEnvironment } from './apns';
import { FcmClient, fcmTokenIsDead } from './fcm';

/** 알림을 보낸 사람 — iOS 는 알림에 이름과 프로필 사진을 크게 보여준다 (커뮤니케이션 알림) */
export interface PushSender {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface PushMessage {
  title: string;
  body: string;
  link?: string | null;
  sender?: PushSender | null;
  /** 같은 대화·대상 알림을 묶는 키 (iOS 알림 그룹) */
  threadId?: string | null;
}

/**
 * 토큰 플랫폼
 * - apns: iOS 기기 토큰 (운영/샌드박스 모름 → 운영 먼저, BadDeviceToken 이면 샌드박스로 다시)
 * - apns-sandbox: 샌드박스로 확인된 iOS 토큰 (개발 서명 빌드)
 * - fcm: Android 기기 토큰
 * - expo: Expo 푸시 토큰 (예전 앱 호환)
 * - web: Web Push 구독 JSON
 */
type Platform = 'apns' | 'apns-sandbox' | 'fcm' | 'expo' | 'web';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

/** iOS 페이로드. expo-notifications 는 원격 알림의 data 를 body 키에서 읽는다 */
export function apnsPayload(msg: PushMessage) {
  return {
    aps: {
      alert: { title: msg.title, body: msg.body },
      sound: 'default',
      // 알림 서비스 확장이 보낸 사람 사진을 붙일 수 있게
      'mutable-content': 1,
      ...(msg.threadId ? { 'thread-id': msg.threadId } : {}),
    },
    body: { link: msg.link ?? null, ...(msg.sender ? { sender: msg.sender } : {}) },
  };
}

/** Android(FCM) data 메시지 — Expo 푸시와 같은 키라 앱(expo-notifications)이 그대로 알림을 그린다 */
export function fcmData(msg: PushMessage): Record<string, string> {
  return {
    title: msg.title,
    message: msg.body,
    body: JSON.stringify({ link: msg.link ?? null, ...(msg.sender ? { sender: msg.sender } : {}) }),
    channelId: 'default',
    sound: 'default',
  };
}

/**
 * 푸시 발송. iOS 는 APNs, Android 는 FCM 으로 직접 보내고(키가 있을 때만), 웹은 Web Push(VAPID).
 * 예전에 등록된 Expo 토큰은 Expo 푸시로 보낸다. 만료·해지된 토큰은 발송 결과를 보고 지운다.
 * 발송 실패는 업무 흐름을 막지 않는다.
 */
@Injectable()
export class PushService implements OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private vapidReady: boolean | null = null;
  private apnsClient: ApnsClient | null | undefined;
  private fcmClient: FcmClient | null | undefined;

  constructor(private readonly prisma: PrismaService) {}

  onModuleDestroy() {
    this.apnsClient?.close();
  }

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

  private apns() {
    if (this.apnsClient === undefined) {
      const e = env();
      const topic = e.APNS_BUNDLE_ID ?? e.APPLE_BUNDLE_ID;
      this.apnsClient =
        e.APNS_KEY_ID && e.APNS_TEAM_ID && e.APNS_PRIVATE_KEY && topic
          ? new ApnsClient({
              keyId: e.APNS_KEY_ID,
              teamId: e.APNS_TEAM_ID,
              privateKey: e.APNS_PRIVATE_KEY.replace(/\\n/g, '\n'),
              topic,
            })
          : null;
    }
    return this.apnsClient;
  }

  private fcm() {
    if (this.fcmClient === undefined) {
      const json = env().FCM_SERVICE_ACCOUNT;
      try {
        this.fcmClient = json ? new FcmClient(json) : null;
      } catch (err) {
        this.logger.error({ err }, 'FCM_SERVICE_ACCOUNT 를 읽지 못했어요');
        this.fcmClient = null;
      }
    }
    return this.fcmClient;
  }

  async send(userId: string, msg: PushMessage) {
    const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
    if (!tokens.length) return;
    const by = (...p: Platform[]) => tokens.filter((t) => p.includes(t.platform as Platform));
    await Promise.all([
      this.ios(by('apns', 'apns-sandbox'), msg),
      this.android(by('fcm'), msg),
      this.expo(by('expo'), msg),
      this.web(by('web'), msg),
    ]);
  }

  private async ios(tokens: PushToken[], msg: PushMessage) {
    const client = this.apns();
    if (!tokens.length || !client) return;
    const payload = apnsPayload(msg);
    await Promise.all(
      tokens.map(async (t) => {
        try {
          const first: ApnsEnvironment = t.platform === 'apns-sandbox' ? 'sandbox' : 'production';
          let r = await client.send(t.token, payload, first);
          // 개발 서명 빌드의 토큰은 샌드박스에서만 통한다 — 한 번 확인되면 기억해 둔다
          if (first === 'production' && r.reason === 'BadDeviceToken') {
            r = await client.send(t.token, payload, 'sandbox');
            if (r.status === 200)
              await this.prisma.pushToken.update({ where: { id: t.id }, data: { platform: 'apns-sandbox' } });
          }
          if (r.status === 200) return;
          if (apnsTokenIsDead(r))
            await this.prisma.pushToken.delete({ where: { id: t.id } }).catch(() => undefined);
          else this.logger.warn({ status: r.status, reason: r.reason }, 'apns push failed');
        } catch (err) {
          this.logger.warn({ err: (err as Error).message }, 'apns push failed');
        }
      }),
    );
  }

  private async android(tokens: PushToken[], msg: PushMessage) {
    const client = this.fcm();
    if (!tokens.length || !client) return;
    const data = fcmData(msg);
    await Promise.all(
      tokens.map(async (t) => {
        try {
          const r = await client.send(t.token, data);
          if (r.ok) return;
          if (fcmTokenIsDead(r))
            await this.prisma.pushToken.delete({ where: { id: t.id } }).catch(() => undefined);
          else this.logger.warn({ status: r.status, code: r.code }, 'fcm push failed');
        } catch (err) {
          this.logger.warn({ err: (err as Error).message }, 'fcm push failed');
        }
      }),
    );
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
            data: { link: msg.link ?? null, ...(msg.sender ? { sender: msg.sender } : {}) },
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

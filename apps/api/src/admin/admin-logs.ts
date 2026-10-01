import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  LOG_NAMESPACE,
  SERVER_LOG_FILTER_LEVELS,
  type LogClientToServerEvents,
  type LogServerToClientEvents,
  type ServerLogEntry,
  type ServerLogTail,
} from '@shop/shared';
import { decodeJwt } from 'jose';
import type { Namespace, Socket } from 'socket.io';
import { z } from 'zod';
import { type AuthUser, isFamilyRevoked, verifyAccessToken } from '../common/auth';
import { logBuffer, matchesLog, type LogFilter } from '../common/log-buffer';
import { RateLimitService } from '../common/rate-limit';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from './audit.service';

/** 동시 구독 상한 (사용자당 · 전체) */
const MAX_PER_USER = 3;
const MAX_TOTAL = 20;
/** 연결 시도: 사용자당 분당 20회 */
const CONNECT_LIMIT = 20;
/** 0.5초마다 모아 보내고, 한 번에 최대 200줄 (넘치면 건너뛴 수만 알린다) */
const FLUSH_MS = 500;
const MAX_BATCH = 200;
/** 권한·세션·토큰 만료를 다시 확인하는 주기 */
const RECHECK_MS = 30_000;
/** 열람 감사 기록은 관리자당 10분에 한 번 */
const AUDIT_DEDUPE_SEC = 600;

/** 실시간 로그는 최고 관리자만 (docs/SECURITY.md "서버 로그 열람") */
export const LOG_VIEWER_ROLE = 'SUPER_ADMIN';

const filterSchema = z.object({
  level: z.enum(SERVER_LOG_FILTER_LEVELS).default('info'),
  q: z.string().trim().max(100).optional(),
});

const toFilter = (raw: unknown): LogFilter | null => {
  const r = filterSchema.safeParse(raw ?? {});
  if (!r.success) return null;
  return { level: r.data.level, q: r.data.q ? r.data.q.toLowerCase() : undefined };
};

/** 로그 조회와 열람 기록 (HTTP·소켓 공용) */
@Injectable()
export class AdminLogsService {
  constructor(
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  tail(q: { level: LogFilter['level']; q?: string; after?: number; limit: number }): ServerLogTail {
    return {
      entries: logBuffer.tail({ level: q.level, q: q.q?.toLowerCase(), after: q.after, limit: q.limit }),
      instance: logBuffer.instance,
      capacity: logBuffer.capacity,
    };
  }

  /** 열람 기록 — 같은 관리자는 10분에 한 번만 남긴다 (재연결·필터 변경마다 쌓이지 않게) */
  async recordAccess(user: AuthUser, ip: string | null, via: 'http' | 'socket') {
    const fresh = await this.redis.set(`audit:logs:${user.id}`, '1', 'EX', AUDIT_DEDUPE_SEC, 'NX');
    if (!fresh) return;
    await this.audit.log({ user, ip }, 'logs.view', 'SERVER_LOG', logBuffer.instance, null, { via });
  }
}

type LogSocket = Socket<
  LogClientToServerEvents,
  LogServerToClientEvents,
  Record<string, never>,
  { user?: AuthUser; exp?: number }
>;

interface Subscriber {
  socket: LogSocket;
  filter: LogFilter;
  pending: ServerLogEntry[];
  dropped: number;
}

const ipOf = (s: Socket) => {
  const fwd = s.handshake.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || s.handshake.address || null;
};

/**
 * 실시간 서버 로그 (namespace /admin-logs). 연결 시 토큰·폐기 여부·DB 의 역할(최고 관리자)과 상태를 확인하고,
 * 이후에도 30초마다 다시 확인해 권한이 바뀌거나 토큰이 만료되면 끊는다. 처음 tail 은 HTTP(GET /admin/logs)로 받는다.
 * 이 프로세스의 로그만 보낸다 — API 를 여러 대 띄우면 연결된 인스턴스의 로그만 보인다.
 */
@WebSocketGateway({ namespace: LOG_NAMESPACE })
export class AdminLogsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly subs = new Map<string, Subscriber>();
  private unsubscribe: (() => void) | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private recheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly limiter: RateLimitService,
    private readonly logs: AdminLogsService,
  ) {}

  afterInit(nsp: Namespace) {
    nsp.use((socket, next) => {
      this.authenticate(socket as LogSocket).then(
        () => next(),
        (e: unknown) => next(new Error(e instanceof Error ? e.message : 'UNAUTHORIZED')),
      );
    });
  }

  /** 거절 사유는 코드만 돌려준다 (connect_error.message) */
  private async authenticate(socket: LogSocket) {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    const user = typeof token === 'string' ? await verifyAccessToken(token) : null;
    if (!user || (await isFamilyRevoked(this.redis, user.familyId))) throw new Error('UNAUTHORIZED');
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, status: true },
    });
    if (row?.status !== 'ACTIVE' || row.role !== LOG_VIEWER_ROLE) throw new Error('FORBIDDEN');
    if (await this.limiter.exceeded(`logs-connect:u:${user.id}`, CONNECT_LIMIT, 60))
      throw new Error('RATE_LIMITED');
    const mine = [...this.subs.values()].filter((s) => s.socket.data.user?.id === user.id).length;
    if (mine >= MAX_PER_USER || this.subs.size >= MAX_TOTAL) throw new Error('TOO_MANY_SUBSCRIBERS');
    socket.data.user = { ...user, role: row.role };
    socket.data.exp = decodeJwt(token as string).exp;
  }

  async handleConnection(socket: LogSocket) {
    const user = socket.data.user;
    if (!user) return void socket.disconnect(true);
    this.subs.set(socket.id, { socket, filter: { level: 'info' }, pending: [], dropped: 0 });
    this.start();
    await this.logs.recordAccess(user, ipOf(socket), 'socket').catch(() => undefined);
  }

  handleDisconnect(socket: LogSocket) {
    this.subs.delete(socket.id);
    if (!this.subs.size) this.stop();
  }

  @SubscribeMessage('logs:filter')
  setFilter(@ConnectedSocket() socket: LogSocket, @MessageBody() body: unknown) {
    const sub = this.subs.get(socket.id);
    const filter = toFilter(body);
    if (!sub || !filter) return { ok: false, code: 'VALIDATION_FAILED' };
    sub.filter = filter;
    sub.pending = [];
    sub.dropped = 0;
    return { ok: true };
  }

  /** 첫 구독자가 생기면 버퍼를 듣고 타이머를 켠다 */
  private start() {
    if (this.unsubscribe) return;
    this.unsubscribe = logBuffer.subscribe((e) => {
      for (const s of this.subs.values()) {
        if (!matchesLog(e, s.filter)) continue;
        if (s.pending.length >= MAX_BATCH) s.dropped++;
        else s.pending.push(e);
      }
    });
    this.flushTimer = setInterval(() => this.flush(), FLUSH_MS);
    this.flushTimer.unref();
    this.recheckTimer = setInterval(() => void this.recheck().catch(() => undefined), RECHECK_MS);
    this.recheckTimer.unref();
  }

  private stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.recheckTimer) clearInterval(this.recheckTimer);
    this.flushTimer = this.recheckTimer = null;
  }

  /** 테스트에서 바로 보내게 열어 둔다 */
  flush() {
    for (const s of this.subs.values()) {
      if (!s.pending.length && !s.dropped) continue;
      s.socket.emit('SERVER_LOG', { entries: s.pending, dropped: s.dropped });
      s.pending = [];
      s.dropped = 0;
    }
  }

  /** 토큰 만료·세션 폐기·역할 변경·정지를 확인해 끊는다. 클라이언트는 새 토큰으로 다시 연결한다 */
  async recheck() {
    const subs = [...this.subs.values()];
    if (!subs.length) return;
    const ids = [...new Set(subs.map((s) => s.socket.data.user!.id))];
    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, role: true, status: true },
    });
    const ok = new Set(
      rows.filter((r) => r.status === 'ACTIVE' && r.role === LOG_VIEWER_ROLE).map((r) => r.id),
    );
    const now = Date.now() / 1000;
    for (const s of subs) {
      const { user, exp } = s.socket.data;
      const expired = exp !== undefined && exp <= now;
      if (!user || expired || !ok.has(user.id) || (await isFamilyRevoked(this.redis, user.familyId)))
        s.socket.disconnect(true);
    }
  }

  onModuleDestroy() {
    this.stop();
  }
}

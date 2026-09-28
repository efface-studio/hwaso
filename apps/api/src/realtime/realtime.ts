import type { INestApplicationContext } from '@nestjs/common';
import { Global, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Emitter } from '@socket.io/redis-emitter';
import { rooms, RT_NAMESPACE, type ClientToServerEvents, type ServerToClientEvents } from '@shop/shared';
import Redis from 'ioredis';
import type { Namespace, ServerOptions, Socket } from 'socket.io';
import { verifyAccessToken } from '../common/auth';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from './presence';

type EventName = keyof ServerToClientEvents;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

/**
 * 모든 실시간 이벤트는 Redis emitter 로 보낸다 — API 인스턴스 여러 개와 워커 어디서 발행해도
 * 모든 인스턴스의 소켓에 전달된다 (docs/ARCHITECTURE.md §3). 반드시 DB 커밋 이후에 호출한다.
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly redis = new Redis(env().REDIS_URL, { maxRetriesPerRequest: 3 });
  /**
   * emitter 는 publish 프로미스를 버린다 — Redis 가 끊기거나 종료 중이면 처리 안 된 거부로 프로세스가 죽을 수 있어
   * 실패는 여기서 기록만 한다 (실시간 알림은 재조회로 복구되는 부가 기능)
   */
  private readonly emitter = new Emitter({
    publish: (channel: string, msg: string | Buffer) =>
      this.redis.publish(channel, msg).catch((err: unknown) => {
        this.logger.warn({ err, channel }, 'realtime publish failed');
        return 0;
      }),
  } as unknown as Redis).of(RT_NAMESPACE);

  emit<E extends EventName>(room: string, event: E, payload: Payload<E>) {
    // redis-emitter 의 타입은 이벤트 맵을 모르므로 여기서만 좁혀서 보낸다
    (this.emitter.to(room) as unknown as { emit: (e: string, p: unknown) => void }).emit(event, payload);
  }

  toAuction<E extends EventName>(auctionId: string, event: E, payload: Payload<E>) {
    this.emit(rooms.auction(auctionId), event, payload);
  }

  toUser<E extends EventName>(userId: string, event: E, payload: Payload<E>) {
    this.emit(rooms.user(userId), event, payload);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}

type RtSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  { userId?: string; typingAt?: Record<string, number> }
>;

/** 인스턴스 간 브로드캐스트를 위한 Socket.IO Redis adapter */
export class RedisIoAdapter extends IoAdapter {
  private pub?: Redis;
  private sub?: Redis;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const origins = env()
      .WEB_ORIGIN.split(',')
      .map((s) => s.trim());
    const server = super.createIOServer(port, { ...options, cors: { origin: origins, credentials: true } });
    this.pub = new Redis(env().REDIS_URL);
    this.sub = this.pub.duplicate();
    server.adapter(createAdapter(this.pub, this.sub));
    return server;
  }

  override async close(server: unknown) {
    await super.close(server as never);
    await Promise.all([this.pub?.quit(), this.sub?.quit()]);
  }
}

@WebSocketGateway({ namespace: RT_NAMESPACE })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() private readonly nsp!: Namespace<ClientToServerEvents, ServerToClientEvents>;
  private readonly watcherTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  /** 토큰이 없거나 틀려도 연결은 허용한다 (경매 관전). 로그인 사용자는 개인 룸에 들어간다 */
  async handleConnection(socket: RtSocket) {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    const user = typeof token === 'string' ? await verifyAccessToken(token) : null;
    if (user) {
      socket.data.userId = user.id;
      await socket.join(rooms.user(user.id));
      await this.presence.connect(user.id, socket.id);
    }
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) if (room.startsWith('auction:')) this.scheduleWatchers(room);
      const userId = socket.data.userId;
      if (!userId) return;
      const chatRooms = [...socket.rooms].filter((r) => r.startsWith('chat:')).map((r) => r.slice(5));
      void this.presence
        .disconnect(userId, socket.id, chatRooms)
        .catch((err: unknown) => this.logger.warn({ err }, 'presence disconnect failed'));
    });
  }

  @SubscribeMessage('auction:join')
  async joinAuction(@ConnectedSocket() socket: RtSocket, @MessageBody() body: { auctionId?: unknown }) {
    const auctionId = typeof body?.auctionId === 'string' ? body.auctionId.slice(0, 40) : '';
    const exists =
      auctionId && (await this.prisma.auction.count({ where: { id: auctionId, status: { not: 'DRAFT' } } }));
    // Nest 는 핸들러 반환값을 ack 로 보낸다
    if (!exists) return { ok: false, code: 'NOT_FOUND' };
    const room = rooms.auction(auctionId);
    await socket.join(room);
    this.scheduleWatchers(room);
    return { ok: true, data: { serverTime: new Date().toISOString() } };
  }

  @SubscribeMessage('auction:leave')
  async leaveAuction(@ConnectedSocket() socket: RtSocket, @MessageBody() body: { auctionId?: unknown }) {
    if (typeof body?.auctionId !== 'string') return;
    const room = rooms.auction(body.auctionId);
    await socket.leave(room);
    this.scheduleWatchers(room);
  }

  /** 채팅방 입장: 참여자만. 입력 중 표시를 주고받는 용도 (메시지는 개인 룸으로 온다) */
  @SubscribeMessage('chat:join')
  async joinChat(@ConnectedSocket() socket: RtSocket, @MessageBody() body: { roomId?: unknown }) {
    const roomId = typeof body?.roomId === 'string' ? body.roomId.slice(0, 40) : '';
    const userId = socket.data.userId;
    const member =
      userId &&
      roomId &&
      (await this.prisma.chatRoom.count({
        where: { id: roomId, OR: [{ buyerId: userId }, { sellerId: userId }] },
      }));
    if (!member) return { ok: false, code: 'NOT_FOUND' };
    await socket.join(rooms.chat(roomId));
    // 보고 있는 방에는 푸시를 보내지 않는다
    await this.presence.enterRoom(roomId, userId, socket.id);
    return { ok: true, data: null };
  }

  @SubscribeMessage('chat:leave')
  async leaveChat(@ConnectedSocket() socket: RtSocket, @MessageBody() body: { roomId?: unknown }) {
    if (typeof body?.roomId !== 'string') return;
    await socket.leave(rooms.chat(body.roomId));
    if (socket.data.userId) await this.presence.leaveRoom(body.roomId, socket.data.userId, socket.id);
  }

  /** 입력 중: 입장한 방에만, 소켓당 방별 1초에 한 번 */
  @SubscribeMessage('chat:typing')
  typing(@ConnectedSocket() socket: RtSocket, @MessageBody() body: { roomId?: unknown }) {
    const userId = socket.data.userId;
    if (!userId || typeof body?.roomId !== 'string') return;
    const room = rooms.chat(body.roomId);
    if (!socket.rooms.has(room)) return;
    const typingAt = (socket.data.typingAt ??= {});
    if (Date.now() - (typingAt[room] ?? 0) < 1000) return;
    typingAt[room] = Date.now();
    socket.to(room).emit('CHAT_TYPING', { roomId: body.roomId, userId });
  }

  @SubscribeMessage('time:sync')
  timeSync() {
    return { ok: true, data: { serverTime: new Date().toISOString() } };
  }

  /** 참여자 수는 입·퇴장이 몰릴 때를 대비해 1초에 한 번만 방송한다 */
  private scheduleWatchers(room: string) {
    if (this.watcherTimers.has(room)) return;
    this.watcherTimers.set(
      room,
      setTimeout(async () => {
        this.watcherTimers.delete(room);
        try {
          const sockets = await this.nsp.in(room).fetchSockets();
          this.nsp
            .to(room)
            .emit('AUCTION_WATCHERS', { auctionId: room.slice('auction:'.length), watchers: sockets.length });
        } catch (err) {
          this.logger.warn({ err }, 'watchers broadcast failed');
        }
      }, 1000),
    );
  }

  /** 스냅샷 조회용 현재 참여자 수 */
  async watchers(auctionId: string): Promise<number> {
    try {
      return (await this.nsp.in(rooms.auction(auctionId)).fetchSockets()).length;
    } catch {
      return 0;
    }
  }
}

@Global()
@Module({ providers: [RealtimeService, PresenceService], exports: [RealtimeService, PresenceService] })
export class RealtimeEmitterModule {}

@Module({ providers: [RealtimeGateway], exports: [RealtimeGateway] })
export class RealtimeGatewayModule {}

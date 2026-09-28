import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const DAY = 86_400;
const key = {
  sockets: (userId: string) => `presence:${userId}`,
  lastSeen: (userId: string) => `lastseen:${userId}`,
  viewing: (roomId: string, userId: string) => `chat:view:${roomId}:${userId}`,
};

/**
 * 접속 상태와 "대화방을 보고 있음"을 Redis 에 소켓 id 집합으로 기록한다 (인스턴스 여러 개여도 공유).
 * 집합이 비면 오프라인 / 보고 있지 않음. 서버가 비정상 종료해 남은 기록은 하루 뒤 만료된다.
 * ponytail: 만료 전까지 남은 소켓이 "접속 중"으로 보일 수 있다 — 정확해야 하면 소켓별 하트비트 키로
 */
@Injectable()
export class PresenceService {
  constructor(private readonly redis: RedisService) {}

  async connect(userId: string, socketId: string) {
    await this.redis.multi().sadd(key.sockets(userId), socketId).expire(key.sockets(userId), DAY).exec();
  }

  /** 소켓이 끊기면 들어가 있던 대화방에서도 나간다. 마지막 소켓이면 마지막 접속 시각을 남긴다 */
  async disconnect(userId: string, socketId: string, chatRoomIds: string[]) {
    await Promise.all(chatRoomIds.map((roomId) => this.leaveRoom(roomId, userId, socketId)));
    await this.redis.srem(key.sockets(userId), socketId);
    if (!(await this.redis.scard(key.sockets(userId))))
      await this.redis.set(key.lastSeen(userId), new Date().toISOString(), 'EX', 30 * DAY);
  }

  async enterRoom(roomId: string, userId: string, socketId: string) {
    const k = key.viewing(roomId, userId);
    await this.redis.multi().sadd(k, socketId).expire(k, DAY).exec();
  }

  async leaveRoom(roomId: string, userId: string, socketId: string) {
    await this.redis.srem(key.viewing(roomId, userId), socketId);
  }

  async isViewing(roomId: string, userId: string) {
    return (await this.redis.scard(key.viewing(roomId, userId))) > 0;
  }

  /** 여러 사용자의 접속 상태를 한 번에 (채팅 목록용) */
  async of(userIds: string[]): Promise<Map<string, { online: boolean; lastSeenAt: string | null }>> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return new Map();
    const p = this.redis.pipeline();
    for (const id of ids) p.scard(key.sockets(id)).get(key.lastSeen(id));
    const res = (await p.exec()) ?? [];
    return new Map(
      ids.map((id, i) => [
        id,
        {
          online: Number(res[i * 2]?.[1] ?? 0) > 0,
          lastSeenAt: (res[i * 2 + 1]?.[1] as string | null) ?? null,
        },
      ]),
    );
  }
}

import type { AuctionPolicy } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

const TTL_MS = 60_000;
let cached: { value: AuctionPolicy; at: number } | null = null;

/**
 * 경매 정책 싱글톤. 자주 읽고 거의 바뀌지 않으므로 프로세스 메모리에 60초 캐시한다.
 * 행이 없을 때만 기본값으로 만든다. 관리자 변경은 같은 프로세스에선 즉시, 다른 인스턴스·Worker 에선 60초 안에 반영된다.
 */
export async function readAuctionPolicy(prisma: PrismaService): Promise<AuctionPolicy> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value =
    (await prisma.auctionPolicy.findUnique({ where: { id: 'default' } })) ??
    (await prisma.auctionPolicy.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} }));
  cached = { value, at: Date.now() };
  return value;
}

/** 관리자가 정책을 바꾸면 호출한다 */
export function invalidateAuctionPolicy() {
  cached = null;
}

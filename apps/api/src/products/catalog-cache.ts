import { createHash } from 'node:crypto';
import type Redis from 'ioredis';

/** 홈 섹션 캐시 키 — 상품·경매가 바뀌면 지운다 */
export const HOME_CACHE_KEY = 'home:v3';
/**
 * 공개 카탈로그 집계(목록 개수·필터 선택지·검색 후보) 캐시의 세대 번호.
 * 올리면 이전 세대 키는 더 읽히지 않고 TTL 로 사라진다 (키를 찾아 지우지 않는다)
 */
export const CATALOG_VERSION_KEY = 'catalog:ver';

/** 상품·경매의 공개 여부·내용이 바뀌면 호출: 홈 캐시를 지우고 집계 캐시 세대를 올린다 */
export async function invalidateCatalog(redis: Redis): Promise<void> {
  await redis.multi().incr(CATALOG_VERSION_KEY).del(HOME_CACHE_KEY).exec();
}

const json = (v: unknown) => JSON.stringify(v, (_, x: unknown) => (typeof x === 'bigint' ? `${x}n` : x));

/**
 * 공개 집계를 현재 세대 키로 ttlSec 동안 캐시한다. 계산 중 세대가 바뀌면 이전 세대 키에 써서
 * 새 세대에서는 읽히지 않는다. parts 는 결과를 결정하는 입력 전부 (where 객체 등)
 */
export async function catalogCached<T>(
  redis: Redis,
  name: string,
  parts: unknown,
  ttlSec: number,
  build: () => Promise<T>,
): Promise<T> {
  const ver = (await redis.get(CATALOG_VERSION_KEY)) ?? '0';
  const key = `catalog:${ver}:${name}:${createHash('sha1').update(json(parts)).digest('base64url')}`;
  const hit = await redis.get(key);
  if (hit != null) return JSON.parse(hit) as T;
  const value = await build();
  await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
  return value;
}

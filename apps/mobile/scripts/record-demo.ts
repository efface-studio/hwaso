/**
 * 시연 모드 데이터 기록.
 * 서버가 켜져 있을 때 관리자 계정으로 로그인해 앱이 쓰는 GET 응답과 이미지(w800)를 앱에 담는다
 * (src/demo/data — snapshot.ts · media.ts · media/). 서버가 꺼져 있을 때 같은 계정으로 로그인하면 이 데이터로 앱이 돌아간다.
 *
 *   DEMO_EMAIL=... DEMO_PASSWORD=... pnpm --filter @shop/mobile demo:record
 *
 * 비밀번호는 저장하지 않고 이메일과 함께 만든 SHA-256 해시만 남긴다.
 * 선택: DEMO_API_URL (기본 http://localhost:4000/api/v1), DEMO_MEDIA_URL (기본 http://localhost:9000/shop-media/public)
 */
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApiClient, type Query } from '@shop/api-client';
import {
  AUCTION_STATUSES,
  ORDER_LIST_FILTERS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PRODUCT_SORTS,
  PRODUCT_STATUSES,
  REPORT_STATUSES,
  REPORT_TARGETS,
  ROLES,
  SETTLEMENT_STATUSES,
  USER_STATUSES,
  VERIFICATION_STATUSES,
  type Paged,
} from '@shop/shared';
import { demoCredential } from '../src/demo/credential';

const API = process.env.DEMO_API_URL ?? 'http://localhost:4000/api/v1';
const MEDIA = process.env.DEMO_MEDIA_URL ?? 'http://localhost:9000/shop-media/public';
const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;
const OUT = path.join(import.meta.dirname, '../src/demo/data');
/** 번들에 담을 이미지 폭 — 목록·상세 모두 무난한 크기 */
const MEDIA_WIDTH = 800;
/** 커서 목록을 따라가는 최대 페이지 */
const MAX_PAGES = 6;
/** 관리자 목록 한 페이지 (앱 AdminList 와 같게) */
const ADMIN_PAGE = 20;

if (!EMAIL || !PASSWORD) {
  console.error('DEMO_EMAIL, DEMO_PASSWORD 환경 변수가 필요해요.');
  process.exit(1);
}

const log = (msg: string) => process.stdout.write(`${msg}\n`);

const entries: Record<string, unknown> = {};
let token: string | null = null;

/** 서버 전역 제한(IP 당 분당 300회)을 넘지 않게 요청 간격을 둔다 — 같은 PC 의 앱 요청 몫도 남긴다 */
const MIN_INTERVAL_MS = 250;
let lastAt = 0;
let queue: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function paced<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

/** GET 성공 응답을 경로+쿼리 그대로(앱이 보내는 모양) 기록한다. 429 면 창이 풀릴 때까지 기다렸다 다시 */
const recordingFetch: typeof fetch = async (input, init) => {
  let res = await paced(() => fetch(input, init));
  for (let i = 0; res.status === 429 && i < 6; i++) {
    log('요청 제한 — 15초 기다렸다 다시 시도해요');
    await sleep(15_000);
    res = await paced(() => fetch(input, init));
  }
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method === 'GET' && res.ok && res.status !== 204) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    entries[url.slice(API.length)] = await res.clone().json();
  }
  return res;
};

const api = createApiClient({ baseUrl: API, getAccessToken: () => token, fetch: recordingFetch });

/** 없는 자원·권한 없는 요청은 건너뛴다 */
async function safe<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

/** 커서 목록을 끝까지(최대 MAX_PAGES) 따라간다 */
async function cursorPages<T extends { nextCursor?: string | null }>(
  fetchPage: (cursor?: string) => Promise<T>,
): Promise<T[]> {
  const pages: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await safe(() => fetchPage(cursor));
    if (!page) break;
    pages.push(page);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return pages;
}

/** 관리자 페이지 목록: 전체 페이지를 앱과 같은 쿼리 모양으로 */
async function adminPages<T>(fetchPage: (q: Query) => Promise<Paged<T>>, filter: Query = {}): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await safe(() => fetchPage({ ...filter, page, size: ADMIN_PAGE }));
    if (!res) break;
    items.push(...res.items);
    if (res.page * res.size >= res.total) break;
  }
  return items;
}

/** 필터 하나씩 값마다 기록 (두 개 이상 겹친 조합은 앱에서 가까운 기록으로 대신한다) */
async function adminFiltered<T>(
  fetchPage: (q: Query) => Promise<Paged<T>>,
  filters: Record<string, readonly string[]>,
): Promise<T[]> {
  const all = await adminPages(fetchPage);
  for (const [key, values] of Object.entries(filters))
    for (const value of values) await adminPages(fetchPage, { [key]: value });
  return all;
}

const ids = <T extends { id: string }>(rows: (T | undefined)[]) => [
  ...new Set(rows.flatMap((r) => (r ? [r.id] : []))),
];

async function main() {
  const tokens = await api.auth.login({
    email: EMAIL!,
    password: PASSWORD!,
    device: { name: '시연 데이터 기록', platform: 'ios' },
  });
  token = tokens.accessToken;
  const me = tokens.user;
  log(`로그인: ${me.email}`);

  // 계정·공통
  await Promise.all([
    safe(api.auth.me),
    safe(api.auth.providers),
    safe(api.auth.sessions),
    safe(api.auth.seller),
    safe(api.auth.identity),
    safe(api.market.home),
    safe(api.market.categories),
    safe(api.market.popularArtists),
    safe(() => api.market.facets()),
    safe(() => api.notices.list({ page: 1, size: 20 })),
    safe(api.notifications.unreadCount),
    safe(api.notifications.prefs),
    safe(api.notifications.pushConfig),
    safe(api.chat.unreadCount),
    safe(api.chat.phrases),
    safe(api.safety.blocks),
    safe(api.orders.addresses),
    safe(api.orders.cart),
    safe(api.orders.summary),
    safe(api.orders.sellerSummary),
    safe(api.orders.settlements),
    safe(api.market.favorites),
    safe(api.market.recent),
    safe(api.market.sellerStats),
    safe(() => api.market.sellerProducts()),
    safe(api.auctions.mine),
    safe(api.auctions.myBids),
    safe(api.auctions.myWins),
  ]);
  await cursorPages((c) => api.notifications.list(c));
  await cursorPages((c) => api.community.feed(c));

  // 카테고리별 작품 목록 (정렬 없이 기록 → 앱의 어떤 정렬 요청에도 쓰인다) + 전체 목록 정렬별
  const categories = (await safe(api.market.categories)) ?? [];
  const slugs = categories.flatMap((c) => [c.slug, ...(c.children ?? []).map((x) => x.slug)]);
  const productIds = new Set<string>();
  const collect = (pages: { items: { id: string }[] }[]) =>
    pages.forEach((p) => p.items.forEach((i) => productIds.add(i.id)));
  collect(await cursorPages((cursor) => api.market.products({ cursor, limit: 24 })));
  for (const sort of PRODUCT_SORTS)
    collect(await cursorPages((cursor) => api.market.products({ sort, cursor, limit: 24 })));
  for (const category of slugs) {
    collect(await cursorPages((cursor) => api.market.products({ category, cursor, limit: 24 })));
    await safe(() => api.market.facets(category));
  }

  // 경매 탭
  for (const status of ['live', 'scheduled', 'ended'] as const)
    collect(await cursorPages((cursor) => api.auctions.list({ status, cursor, limit: 24 })));

  // 홈 레일의 작품도 모은다
  const home = await safe(api.market.home);
  if (home)
    for (const rail of [
      home.liveAuctions,
      home.endingSoon,
      home.upcomingAuctions,
      home.newArrivals,
      home.popular,
      ...home.collections.map((c) => c.items),
    ])
      rail.forEach((p) => productIds.add(p.id));

  // 작품 상세 → 판매자·작가·경매
  const userIds = new Set<string>([me.id]);
  const artistIds = new Set<string>((home?.popularArtists ?? []).map((a) => a.id));
  const auctionIds = new Set<string>();
  for (const id of productIds) {
    const p = await safe(() => api.market.product(id));
    await Promise.all([safe(() => api.market.related(id)), safe(() => api.market.inquiries(id))]);
    if (!p) continue;
    userIds.add(p.seller.id);
    if (p.artist) artistIds.add(p.artist.id);
    if (p.auction) auctionIds.add(p.auction.id);
  }
  for (const id of auctionIds)
    await Promise.all([safe(() => api.auctions.snapshot(id)), safe(() => api.auctions.bids(id))]);
  for (const id of artistIds) {
    await safe(() => api.market.artist(id));
    collect(
      await cursorPages((cursor) => api.market.products({ artist: id, sort: 'latest', cursor, limit: 24 })),
    );
  }

  // 주문
  for (const filter of ORDER_LIST_FILTERS) {
    const pages = await cursorPages((cursor) => api.orders.list({ filter, cursor, limit: 20 }));
    await cursorPages((cursor) => api.orders.sellerOrders({ filter, cursor, limit: 20 }));
    for (const o of pages.flatMap((p) => p.items)) {
      await Promise.all([safe(() => api.orders.detail(o.id)), safe(() => api.community.myReview(o.id))]);
    }
  }

  // 채팅
  const rooms = (await safe(api.chat.rooms)) ?? [];
  for (const r of rooms) {
    await safe(() => api.chat.room(r.id));
    await cursorPages((before) => api.chat.messages(r.id, before) as Promise<{ nextCursor?: string | null }>);
  }

  // 관리자
  await Promise.all([
    safe(api.admin.dashboard),
    safe(api.admin.categories),
    safe(api.admin.policy),
    safe(api.admin.banners),
  ]);
  const users = await adminFiltered(api.admin.users, { role: ROLES, status: USER_STATUSES });
  await adminFiltered(api.admin.sellers, { verified: ['pending', 'verified'] });
  await adminFiltered(api.admin.products, { status: PRODUCT_STATUSES, verification: VERIFICATION_STATUSES });
  await adminFiltered(api.admin.auctions, { status: AUCTION_STATUSES });
  const orders = await adminFiltered(api.admin.orders, { status: ORDER_STATUSES });
  await adminFiltered(api.admin.payments, { status: PAYMENT_STATUSES, method: PAYMENT_METHODS });
  await adminFiltered(api.admin.settlements, { status: SETTLEMENT_STATUSES });
  await adminFiltered(api.admin.coupons, {});
  await adminFiltered(api.admin.reports, { status: REPORT_STATUSES, targetType: REPORT_TARGETS });
  await adminFiltered(api.admin.notices, {});
  await adminFiltered(api.admin.auditLogs, {});
  for (const id of ids(users)) {
    userIds.add(id);
    await safe(() => api.admin.user(id));
  }
  for (const id of ids(orders)) await safe(() => api.admin.order(id));

  // 공개 프로필 (판매자·관리자·회원)
  for (const id of userIds) {
    await Promise.all([
      safe(() => api.market.user(id)),
      safe(() => api.market.userProducts(id, 'selling')),
      safe(() => api.market.userProducts(id, 'sold')),
      safe(() => api.community.reviewSummary(id)),
    ]);
    await cursorPages((c) => api.community.reviews(id, c));
    await cursorPages((c) => api.community.followers(id, c));
    await cursorPages((c) => api.community.following(id, c));
  }

  // 이미지: 응답 안의 이미지 키(key·imageKey·avatarKey 등)를 모아 받는다
  const keys = new Set<string>();
  const walk = (v: unknown, prop?: string) => {
    if (typeof v === 'string') {
      if (prop && /(^key$|Key$)/.test(prop) && v.includes('/')) keys.add(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k));
  };
  walk(entries);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, 'media'), { recursive: true });
  const files: [string, string][] = [];
  let bytes = 0;
  for (const key of keys) {
    const res = await fetch(`${MEDIA}/${key}/w${MEDIA_WIDTH}.webp`).catch(() => null);
    if (!res?.ok) continue;
    const file = `${key.replace(/[^\w-]/g, '_')}.webp`;
    const buf = Buffer.from(await res.arrayBuffer());
    bytes += buf.length;
    await writeFile(path.join(OUT, 'media', file), buf);
    files.push([key, file]);
  }

  const snapshot = {
    takenAt: new Date().toISOString(),
    credential: demoCredential(EMAIL!, PASSWORD!, (s) => createHash('sha256').update(s).digest('hex')),
    entries,
  };
  // 큰 JSON 을 타입 추론하지 않게 문자열로 담아 런타임에 파싱한다 (타입 검사 속도)
  await writeFile(
    path.join(OUT, 'snapshot.ts'),
    [
      '// 자동 생성 — scripts/record-demo.ts. 직접 고치지 말 것',
      "import type { DemoSnapshot } from '../types';",
      '',
      `export const SNAPSHOT: DemoSnapshot = JSON.parse(${JSON.stringify(JSON.stringify(snapshot))});`,
      '',
    ].join('\n'),
  );
  const lines = files.map(([, file], i) => `import m${i} from './media/${file}';`);
  await writeFile(
    path.join(OUT, 'media.ts'),
    [
      '// 자동 생성 — scripts/record-demo.ts. 직접 고치지 말 것',
      "import type { ImageSourcePropType } from 'react-native';",
      ...lines,
      '',
      '/** 이미지 키 → 번들 이미지 */',
      'export const DEMO_MEDIA: Record<string, ImageSourcePropType> = {',
      ...files.map(([key], i) => `  '${key}': m${i},`),
      '};',
      '',
    ].join('\n'),
  );
  log(
    `응답 ${Object.keys(entries).length}개 · 이미지 ${files.length}/${keys.size}개 (${(bytes / 1024 / 1024).toFixed(1)}MB) 기록`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

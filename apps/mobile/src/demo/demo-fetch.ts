import { Image, type ImageSourcePropType } from 'react-native';
import { env } from '@/lib/env';
import { demoCredential } from './credential';
import { sha256 } from './sha256';
import type { DemoSnapshot } from './types';

/**
 * 시연 모드 — 서버가 꺼져 있어도 기록해 둔 데이터(src/demo/data)로 앱을 돌린다.
 *
 * - 서버에 닿지 않을 때 기록한 관리자 계정으로 로그인하면 시연 모드로 들어간다 (비밀번호는 해시로만 비교).
 * - 시연 중에는 모든 API 요청을 기록한 응답으로 답한다. 같은 쿼리가 없으면 가장 가까운 기록을 쓰고,
 *   검색어(q)는 기록 안에서 거른다. 날짜는 기록한 시각 기준으로 지금에 맞춰 옮긴다.
 * - 쓰기 요청은 저장하지 않고 "시연 모드" 오류로 답한다 (조회 기록·푸시 등록처럼 조용한 요청은 성공 처리).
 * - 시연 토큰으로 refresh 하면 다시 시연 모드로 이어진다 (앱을 다시 켜도 유지). 로그아웃하면 끝난다.
 * - 둘러보기(로그인 전)에서도 서버에 닿지 않는 조회는 기록한 응답으로 답한다. 서버가 다시 답하면 실제 응답으로 돌아간다.
 * - "서버에 닿지 않음"은 연결 실패와 게이트웨이 오류(서버가 꺼졌을 때 프록시가 주는 5xx) 모두다.
 * - 개발 빌드와 EXPO_PUBLIC_DEMO=1 빌드에서만 켜진다.
 */
export const demoEnabled = __DEV__ || process.env.EXPO_PUBLIC_DEMO === '1';

const DEMO_ACCESS = 'demo.access-token';
const DEMO_REFRESH = 'demo.refresh-token';
const DAY_MS = 86_400_000;

/** 저장하지 않고 조용히 성공 처리하는 쓰기 요청 */
const SILENT_WRITES = [
  /^\/products\/[^/]+\/view$/,
  /^\/me\/push-tokens$/,
  /^\/notifications\/read$/,
  /^\/chat\/rooms\/[^/]+\/read$/,
];

type Entry = { params: Record<string, string>; body: unknown };

let snapshot: DemoSnapshot | null = null;
let index = new Map<string, Entry[]>();
let media: Record<string, ImageSourcePropType> = {};
let active = false;
/** 둘러보기 중 서버에 닿지 않아 조회를 기록으로 답하고 있다 (이미지도 기록한 것을 쓴다) */
let offline = false;

export const isDemoActive = () => active;

/** 서버가 꺼졌을 때 앞단 프록시(Cloudflare 등)가 돌려주는 상태 */
const UNREACHABLE_STATUS = new Set([502, 503, 504, 520, 521, 522, 523, 524]);

function parseQuery(qs: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of qs.split('&')) {
    if (!part) continue;
    const [k = '', v = ''] = part.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return params;
}

function splitUrl(rel: string) {
  const i = rel.indexOf('?');
  return i === -1
    ? { path: rel, params: {} }
    : { path: rel.slice(0, i), params: parseQuery(rel.slice(i + 1)) };
}

/** 기록 데이터는 시연을 처음 시작할 때만 불러온다 (평소 앱 시작 비용 없음) */
async function load(): Promise<DemoSnapshot> {
  if (snapshot) return snapshot;
  const [data, images] = await Promise.all([import('./data/snapshot'), import('./data/media')]);
  const loaded = data.SNAPSHOT;
  const next = new Map<string, Entry[]>();
  for (const [key, body] of Object.entries(loaded.entries)) {
    const { path, params } = splitUrl(key);
    const list = next.get(path) ?? [];
    list.push({ params, body });
    next.set(path, list);
  }
  index = next;
  media = images.DEMO_MEDIA;
  snapshot = loaded;
  return loaded;
}

/** 기록한 날짜·시각을 지금 기준으로 옮긴다 (경매 마감·"오늘 가입" 등이 자연스럽게 보이게) */
function shiftDates<T>(value: T, takenAt: number): T {
  const delta = Date.now() - takenAt;
  const days = Math.round(delta / DAY_MS);
  const text = JSON.stringify(value)
    .replace(/"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)"/g, (_m, iso: string) =>
      JSON.stringify(new Date(Date.parse(iso) + delta).toISOString()),
    )
    .replace(
      /"(\d{4}-\d{2}-\d{2})"/g,
      (_m, d: string) =>
        `"${new Date(Date.parse(`${d}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)}"`,
    );
  return JSON.parse(text) as T;
}

type Listish = { items?: unknown[]; total?: number; nextCursor?: string | null };

/** 기록에 없는 다음 페이지는 빈 페이지로 끝낸다 */
function emptyPage(body: unknown): unknown {
  if (Array.isArray(body)) return [];
  if (body && typeof body === 'object' && Array.isArray((body as Listish).items))
    return { ...(body as object), items: [], nextCursor: null };
  return body;
}

/** 검색어는 기록 안에서 거른다 (항목 전체 글자에 포함되면 남긴다) */
function filterByQuery(body: unknown, q: string): unknown {
  const needle = q.trim().toLowerCase();
  if (!needle) return body;
  const hit = (item: unknown) => JSON.stringify(item).toLowerCase().includes(needle);
  if (Array.isArray(body)) return body.filter(hit);
  if (body && typeof body === 'object' && Array.isArray((body as Listish).items)) {
    const items = (body as Listish).items!.filter(hit);
    const out: Listish = { ...(body as Listish), items };
    if (typeof out.total === 'number') out.total = items.length;
    return out;
  }
  return body;
}

/** 같은 경로의 기록 중 요청 쿼리와 가장 잘 맞는 응답 */
function lookup(path: string, params: Record<string, string>): unknown {
  const list = index.get(path);
  if (!list) return undefined;
  const same = (a: Record<string, string>, b: Record<string, string>) =>
    Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
  const exact = list.find((e) => same(e.params, params));
  if (exact) return exact.body;

  const { q, ...rest } = params;
  // 기록의 쿼리가 모두 요청에 들어 있는 것 중 가장 구체적인 것
  let best: Entry | undefined;
  for (const e of list) {
    if (Object.entries(e.params).some(([k, v]) => rest[k] !== v)) continue;
    if (!best || Object.keys(e.params).length > Object.keys(best.params).length) best = e;
  }
  if (!best) return undefined;
  const nextPage =
    (rest.cursor && !best.params.cursor) ||
    (rest.before && !best.params.before) ||
    (rest.page && rest.page !== '1' && best.params.page !== rest.page);
  if (nextPage) return emptyPage(best.body);
  return q ? filterByQuery(best.body, q) : best.body;
}

/** 검색 자동완성: 기록한 작품·카테고리 이름에서 찾는다 */
function suggest(q: string) {
  const needle = q.trim().toLowerCase();
  const products = (lookup('/products', { limit: '24' }) as Listish | undefined)?.items ?? [];
  const categories =
    (lookup('/categories', {}) as {
      slug: string;
      name: string;
      children?: { slug: string; name: string }[];
    }[]) ?? [];
  return {
    products: (products as { id: string; title: string; image: unknown }[])
      .filter((p) => p.title.toLowerCase().includes(needle))
      .slice(0, 5)
      .map(({ id, title, image }) => ({ id, title, image })),
    artists: [],
    categories: categories
      .flatMap((c) => [c, ...(c.children ?? [])])
      .filter((c) => c.name.toLowerCase().includes(needle))
      .slice(0, 5)
      .map(({ slug, name }) => ({ slug, name })),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const error = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

async function enter() {
  await load();
  active = true;
}

function tokens() {
  const s = snapshot!;
  return json({
    accessToken: DEMO_ACCESS,
    refreshToken: DEMO_REFRESH,
    expiresIn: DAY_MS / 1000,
    user: shiftDates(lookup('/auth/me', {}), Date.parse(s.takenAt)),
  });
}

async function isDemoLogin(body: unknown): Promise<boolean> {
  if (!body || typeof body !== 'object') return false;
  const { email, password } = body as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || typeof password !== 'string') return false;
  const s = await load().catch(() => null);
  return !!s && demoCredential(email, password, sha256) === s.credential;
}

function respond(method: string, rel: string): Response {
  const { path, params } = splitUrl(rel);
  if (path === '/auth/logout') {
    active = false;
    return json(undefined, 204);
  }
  if (path === '/auth/refresh') return tokens();
  if (path === '/time') return json({ serverTime: new Date().toISOString() });

  if (method !== 'GET') {
    if (SILENT_WRITES.some((r) => r.test(path))) return json(undefined, 204);
    return error(403, 'DEMO_DISABLED', '시연 모드에서는 변경 내용이 저장되지 않아요.');
  }
  const takenAt = Date.parse(snapshot!.takenAt);
  if (path === '/products/suggest') return json(shiftDates(suggest(params.q ?? ''), takenAt));
  const found = lookup(path, params);
  if (found === undefined) return error(404, 'NOT_FOUND', '시연 데이터에 없는 화면이에요.');
  return json(shiftDates(found, takenAt));
}

function readBody(body: RequestInit['body']): unknown {
  if (typeof body !== 'string') return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** api 클라이언트의 fetch 를 감싼다. 시연 모드가 꺼진 빌드에서는 그대로 돌려준다 */
export function withDemo(base: typeof fetch): typeof fetch {
  if (!demoEnabled) return base;
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(env.apiUrl)) return base(input, init);
    const rel = url.slice(env.apiUrl.length);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = readBody(init?.body);

    // 앱을 다시 켜면 저장된 시연 토큰으로 이어간다
    if (
      rel === '/auth/refresh' &&
      (body as { refreshToken?: string } | undefined)?.refreshToken === DEMO_REFRESH
    ) {
      await enter();
      return tokens();
    }
    if (active) return respond(method, rel);

    // 서버에 닿지 않을 때만 기록으로 답한다: 기록한 관리자 계정 로그인은 시연 모드로, 둘러보기 조회는 기록 응답으로
    const fallback = async (): Promise<Response | null> => {
      if (method === 'POST' && rel === '/auth/login' && (await isDemoLogin(body))) {
        await enter();
        return tokens();
      }
      if (method === 'GET' && !new Headers(init?.headers).has('Authorization')) {
        await load();
        offline = true;
        return respond(method, rel);
      }
      return null;
    };

    let res: Response;
    try {
      res = await base(input, init);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      const out = await fallback();
      if (out) return out;
      throw e;
    }
    if (UNREACHABLE_STATUS.has(res.status)) return (await fallback()) ?? res;
    offline = false;
    return res;
  };
}

/** 시연 중(둘러보기 기록 응답 포함)이면 이미지 키를 앱에 담긴 이미지 주소로 바꾼다 */
export function demoMediaUri(key: string): string | undefined {
  if (!active && !offline) return undefined;
  const src = media[key];
  return src ? Image.resolveAssetSource(src).uri : undefined;
}

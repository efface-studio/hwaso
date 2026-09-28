import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** 시드 테스트 계정 (apps/api/prisma/seed.ts — 로컬·CI 전용) */
export const PASSWORD = process.env.SEED_PASSWORD ?? 'shop1234!';
export const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@shop.local';
const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';

/** 화면으로 로그인하고 로그인 화면을 벗어날 때까지 기다린다 */
export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** 준비 데이터용 API 로그인 (앱 방식 — 토큰을 본문으로 받는다) */
export async function apiLogin(request: APIRequestContext, email: string, password = PASSWORD) {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password, device: { name: 'e2e', platform: 'android' } },
  });
  expect(res.ok(), `로그인 실패 ${email}`).toBeTruthy();
  return ((await res.json()) as { accessToken: string }).accessToken;
}

export async function ensureAddress(request: APIRequestContext, token: string) {
  const headers = { authorization: `Bearer ${token}` };
  const list = (await (await request.get(`${API}/me/addresses`, { headers })).json()) as unknown[];
  if (list.length) return;
  const res = await request.post(`${API}/me/addresses`, {
    headers,
    data: {
      recipient: '이투이',
      phone: '01012345678',
      zipCode: '03145',
      address1: '서울 종로구 인사동길 12',
      address2: '3층',
      memo: '',
      isDefault: true,
    },
  });
  expect(res.ok()).toBeTruthy();
}

type Card = {
  id: string;
  title: string;
  saleType: string;
  price: number | null;
  auction: { id: string } | null;
};

export async function firstProduct(request: APIRequestContext, query: string) {
  const res = await request.get(`${API}/${query}`);
  expect(res.ok()).toBeTruthy();
  const { items } = (await res.json()) as { items: Card[] };
  expect(items.length, `조건에 맞는 작품이 없어요: ${query}`).toBeGreaterThan(0);
  return items[0]!;
}

/** 진행 중인 경매 중 이 사용자가 최고 입찰자가 아닌 것 (입찰 버튼이 켜져 있는 경매) */
export async function biddableAuction(request: APIRequestContext, token: string) {
  const headers = { authorization: `Bearer ${token}` };
  const me = (await (await request.get(`${API}/auth/me`, { headers })).json()) as { id: string };
  const { items } = (await (await request.get(`${API}/auctions?status=live&limit=50`)).json()) as {
    items: Card[];
  };
  for (const c of items) {
    const snap = (await (await request.get(`${API}/auctions/${c.auction!.id}`, { headers })).json()) as {
      auction: { id: string; highestBidderId: string | null };
    };
    if (snap.auction.highestBidderId !== me.id) return snap.auction.id;
  }
  throw new Error('입찰할 수 있는 진행 중 경매가 없어요');
}

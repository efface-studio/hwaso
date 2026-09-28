import { expect, test } from '@playwright/test';

test('홈에서 작품을 열어 상세 정보를 본다', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('main a[href^="/products/"]').first();
  await expect(card).toBeVisible();
  const href = await card.getAttribute('href');
  await card.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /상품 문의/ })).toBeVisible();
});

test('검색 결과에서 작품을 찾는다', async ({ page }) => {
  await page.goto('/search?q=%EB%B0%B1%EC%9E%90');
  await expect(page.locator('main a[href^="/products/"]').first()).toBeVisible();
});

test('화면마다 고유한 제목을 가진다 (WCAG 2.4.2)', async ({ request }) => {
  const titles = {
    '/login': '로그인 | 화소',
    '/auctions': '경매 | 화소',
    '/cart': '장바구니 | 화소',
    '/my/bids': '입찰 내역 | 화소',
    '/admin': '관리자 대시보드 | 화소',
    '/admin/orders': '주문 | 화소 관리자',
  };
  for (const [path, title] of Object.entries(titles)) {
    const html = await (await request.get(path)).text();
    expect(html, path).toContain(`<title>${title}</title>`);
  }
});

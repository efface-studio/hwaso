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

test('폰 폭에서 가로로 넘치지 않는다 (하단 탭바가 밀리지 않게)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/auctions', '/search?q=%EB%B0%B1%EC%9E%90', '/notices']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('상단 카테고리 시트에서 분류를 골라 이동한다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '카테고리' }).click();
  const sheet = page.getByRole('dialog', { name: '카테고리' });
  const tile = sheet.locator('a[href^="/category/"]').nth(1);
  const href = await tile.getAttribute('href');
  await tile.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(sheet).toBeHidden();
});

test.describe('터치 폰', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('입력창 글자가 16px 이상이라 iOS 가 포커스 때 확대하지 않는다', async ({ page }) => {
    for (const path of ['/login', '/search']) {
      await page.goto(path);
      const sizes = await page
        .locator('input:visible, textarea:visible, select:visible')
        .evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
      expect(sizes.length, path).toBeGreaterThan(0);
      for (const s of sizes) expect(s, path).toBeGreaterThanOrEqual(16);
    }
  });
});

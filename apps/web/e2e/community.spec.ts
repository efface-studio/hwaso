import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, firstProduct, login } from './fixtures';

test('작품에서 판매자와 채팅을 시작하고 메시지를 보낸다', async ({ page, request }) => {
  const product = await firstProduct(request, 'products?saleType=FIXED&limit=20');
  await login(page, 'buyer4@shop.local');
  await page.goto(`/products/${product.id}`);
  await page.getByRole('button', { name: '판매자에게 문의하기' }).click();
  await page.waitForURL(/\/chat\/[^/?]+/);

  const text = `작품 상태가 궁금해요 ${Date.now()}`;
  await page.getByLabel('메시지 입력').fill(text);
  await page.getByRole('button', { name: '보내기' }).click();
  await expect(page.getByText(text)).toBeVisible();
});

test('관리자 콘솔 대시보드가 열린다', async ({ page }) => {
  await login(page, ADMIN_EMAIL);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();
});

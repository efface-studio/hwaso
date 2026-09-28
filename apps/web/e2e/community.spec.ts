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

  // 거래 약속: 모달 안에서 커스텀 날짜 피커(브라우저 기본 UI 아님)로 날짜를 고른다
  await page.getByRole('button', { name: '첨부' }).click();
  await page.getByRole('menuitem', { name: '거래 약속' }).click();
  const dialog = page.getByRole('dialog', { name: '거래 약속 잡기' });
  await dialog.getByRole('button', { name: /날짜와 시간/ }).click();
  await page.getByRole('button', { name: /다음/ }).first().click();
  await page.getByRole('button', { name: /15일/ }).click();
  await expect(dialog.getByRole('button', { name: /날짜와 시간/ })).toContainText('15일');
  await expect(dialog.locator('input[type="datetime-local"]')).toHaveCount(0);
});

test('관리자 콘솔 대시보드가 열린다', async ({ page }) => {
  await login(page, ADMIN_EMAIL);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();
});

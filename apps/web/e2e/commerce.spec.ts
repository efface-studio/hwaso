import { expect, test } from '@playwright/test';
import { apiLogin, biddableAuction, ensureAddress, firstProduct, login } from './fixtures';

test('즉시 구매 → 모의 결제 → 결제 완료된 주문', async ({ page, request }) => {
  const email = 'buyer2@shop.local';
  await ensureAddress(request, await apiLogin(request, email));
  const product = await firstProduct(request, 'products?saleType=FIXED&limit=20');

  await login(page, email);
  await page.goto(`/checkout?productId=${product.id}`);
  await page.getByRole('checkbox', { name: /결제에 동의/ }).click();
  await page.getByRole('button', { name: /결제하기$/ }).click();

  // 모의 결제 → /checkout/success 에서 서버가 금액을 대조해 승인 → 주문 상세
  await page.waitForURL(/\/orders\/[^/?]+/, { timeout: 30_000 });
  await expect(page.getByText('결제 완료').first()).toBeVisible();
});

test('진행 중인 경매에 입찰하면 최고 입찰자가 된다', async ({ page, request }) => {
  const email = 'buyer3@shop.local';
  const auctionId = await biddableAuction(request, await apiLogin(request, email));
  await login(page, email);
  await page.goto(`/auctions/${auctionId}`);
  await page.getByRole('button', { name: /입찰하기$/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /입찰$/ }).click();
  await expect(page.getByText('현재 최고 입찰자입니다')).toBeVisible();
});

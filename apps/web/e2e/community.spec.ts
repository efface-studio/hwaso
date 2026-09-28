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

  // 답장: 메시지 메뉴 → 답장 → 입력창 위 대상 표시 → 보내면 말풍선에 인용
  await page
    .locator('[id^="msg-"]')
    .filter({ hasText: text })
    .getByRole('button', { name: '메시지 메뉴' })
    .click();
  await page.getByRole('menuitem', { name: '답장' }).click();
  await expect(page.getByRole('button', { name: '답장 취소' })).toBeVisible();
  const reply = `추가로 액자도 포함인가요? ${Date.now()}`;
  await page.getByLabel('메시지 입력').fill(reply);
  await page.getByRole('button', { name: '보내기' }).click();
  const replied = page.locator('[id^="msg-"]').filter({ hasText: reply });
  await expect(replied.getByRole('button', { name: /나에게 답장/ })).toContainText(text);
  await expect(page.getByRole('button', { name: '답장 취소' })).toHaveCount(0);

  // 자주 쓰는 문구: 첨부 → 자주 쓰는 문구 → 누르면 입력창에 들어간다 (처음엔 기본 문구)
  await page.getByRole('button', { name: '첨부' }).click();
  await page.getByRole('menuitem', { name: '자주 쓰는 문구' }).click();
  const phrase = '작품 상태와 뒷면 사진을 더 볼 수 있을까요?';
  await page.getByRole('dialog', { name: '자주 쓰는 문구' }).getByRole('button', { name: phrase }).click();
  await expect(page.getByLabel('메시지 입력')).toHaveValue(phrase);
  await page.getByLabel('메시지 입력').fill('');

  // 거래 약속: 모달 안에서 커스텀 날짜 피커(브라우저 기본 UI 아님)로 날짜를 고른다
  await page.getByRole('button', { name: '첨부' }).click();
  await page.getByRole('menuitem', { name: '거래 약속' }).click();
  const dialog = page.getByRole('dialog', { name: '거래 약속 잡기' });
  await dialog.getByRole('button', { name: /날짜와 시간/ }).click();
  await page.getByRole('button', { name: /다음/ }).first().click();
  await page.getByRole('button', { name: /15일/ }).click();
  await expect(dialog.getByRole('button', { name: /날짜와 시간/ })).toContainText('15일');
  await expect(dialog.locator('input[type="datetime-local"]')).toHaveCount(0);
  await page.keyboard.press('Escape'); // 날짜 팝오버 닫기
  await dialog.getByRole('button', { name: '닫기' }).click();
  await expect(dialog).toBeHidden();

  // 사진 여러 장을 한 메시지로 — 캔버스로 만든 PNG 2장
  const png = (color: string) =>
    page.evaluate((c) => {
      const cv = document.createElement('canvas');
      cv.width = 480;
      cv.height = 360;
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 480, 360);
      return cv.toDataURL('image/png').split(',')[1]!;
    }, color);
  const files = await Promise.all(
    ['#c0392b', '#2980b9'].map(async (c, i) => ({
      name: `photo-${i}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(await png(c), 'base64'),
    })),
  );
  await page.getByRole('button', { name: '첨부' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: '사진' }).click();
  await (await chooser).setFiles(files);
  await expect(page.getByRole('link', { name: '보낸 사진 2/2' })).toBeVisible({ timeout: 15_000 });
});

test('관리자 콘솔 대시보드가 열린다', async ({ page }) => {
  await login(page, ADMIN_EMAIL);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();
});

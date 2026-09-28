import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

/**
 * 핵심 흐름 E2E. 로컬은 이미 떠 있는 API(4000)·웹(3000)을 쓰고,
 * CI 는 빌드한 API·웹을 여기서 띄운다 (시드는 워크플로가 SEED_OFFLINE=1 로 넣는다).
 * 시드 데이터를 공유하므로 순서대로 한 개씩 실행한다.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: CI
    ? [
        {
          command: 'node --enable-source-maps dist/main.js',
          cwd: '../api',
          url: 'http://localhost:4000/api/v1/health',
          timeout: 60_000,
          stdout: 'pipe',
        },
        { command: 'pnpm start', url: 'http://localhost:3000', timeout: 60_000 },
      ]
    : undefined,
});

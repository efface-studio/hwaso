import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    include: ['test/**/*.spec.ts', 'src/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-env.ts'],
    // 통합 테스트는 같은 DB 를 쓰므로 파일 단위 병렬 실행을 끈다
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

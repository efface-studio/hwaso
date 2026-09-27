import { defineConfig } from 'tsup';

// emitDecoratorMetadata 가 켜져 있으면 tsup 은 swc 로 데코레이터 메타데이터를 생성한다 (Nest DI 필요)
export default defineConfig({
  entry: { main: 'src/main.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // 워크스페이스 패키지(TS 소스)는 번들에 포함, 나머지 의존성은 외부로 둔다
  noExternal: [/^@shop\//],
});

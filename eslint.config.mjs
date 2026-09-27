import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.expo/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'apps/mobile/babel.config.js',
      'apps/mobile/metro.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-properties': [
        'error',
        { property: '$queryRawUnsafe', message: 'SQL injection 위험 — $queryRaw 템플릿을 사용하세요.' },
        { property: '$executeRawUnsafe', message: 'SQL injection 위험 — $executeRaw 템플릿을 사용하세요.' },
      ],
    },
  },
  {
    // Nest DI 는 생성자 파라미터 타입의 런타임 참조(emitDecoratorMetadata)가 필요하다 — type-only import 로 바꾸면 주입이 깨진다
    files: ['apps/api/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  {
    // CLI 스크립트(시드·수집기)는 진행 상황을 콘솔로 출력한다
    files: ['apps/api/prisma/**/*.{ts,mjs}', 'packages/*/scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);

import { execSync } from 'node:child_process';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * 테스트 DB 를 최신 마이그레이션으로 맞추고 데이터를 비운다 (docs/TESTING.md).
 * 안전장치: DB 이름이 _test 로 끝나지 않으면 실행하지 않는다.
 */
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST ?? 'postgresql://shop:shop@localhost:5433/shop_test';
  if (!/\/\w+_test(\?|$)/.test(url)) throw new Error(`테스트 DB 가 아닙니다: ${url}`);
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });

  const prisma = new PrismaClient({ datasourceUrl: url });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    // 테이블 이름은 pg_tables 에서 온 값이라 사용자 입력이 섞이지 않는다
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRaw`${Prisma.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)}`;
  }
  await prisma.$disconnect();
}

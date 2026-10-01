/**
 * 데이터 암호화 키 교체 후 재암호화 (docs/SECURITY.md §비밀값 교체).
 *
 *   1) env 에 DATA_ENCRYPTION_KEY=<새 키>, DATA_ENCRYPTION_KEY_PREVIOUS=<이전 키> 를 넣고 API 를 재시작
 *   2) 같은 env 로 실행: pnpm exec tsx --env-file=<env> prisma/reencrypt-data-key.ts (apps/api 에서)
 *   3) 결과의 updated 가 끝나면 DATA_ENCRYPTION_KEY_PREVIOUS 를 지우고 다시 재시작
 *
 * 키·평문은 출력하지 않는다.
 */
import { PrismaClient } from '@prisma/client';
import { reencryptStoredSecrets } from '../src/common/key-rotation';
import { env } from '../src/config/env';

async function main() {
  if (!env().DATA_ENCRYPTION_KEY_PREVIOUS) throw new Error('DATA_ENCRYPTION_KEY_PREVIOUS 가 비어 있습니다.');
  const prisma = new PrismaClient();
  try {
    const r = await reencryptStoredSecrets(prisma);
    console.log(`재암호화 ${r.updated}건 · 이미 현재 키 ${r.current}건 · 읽을 수 없음 ${r.unreadable}건`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});

import type { PrismaClient } from '@prisma/client';
import { decrypt, encrypt, isCurrentKey } from './crypto';

export interface ReencryptResult {
  /** 이전 키 → 현재 키로 다시 암호화한 행 */
  updated: number;
  /** 이미 현재 키인 행 */
  current: number;
  /** 어느 키로도 열리지 않는 값 (시드 자리표시자 등) — 건드리지 않는다 */
  unreadable: number;
}

/**
 * 데이터 암호화 키 교체 (docs/SECURITY.md §비밀값 교체).
 * DATA_ENCRYPTION_KEY = 새 키, DATA_ENCRYPTION_KEY_PREVIOUS = 이전 키로 실행하면
 * 이전 키로 암호화된 정산 계좌·Apple refresh 토큰을 새 키로 다시 암호화한다. 여러 번 실행해도 안전하다.
 */
export async function reencryptStoredSecrets(prisma: PrismaClient): Promise<ReencryptResult> {
  const r: ReencryptResult = { updated: 0, current: 0, unreadable: 0 };
  const rotate = (value: string): string | null => {
    if (isCurrentKey(value)) {
      r.current++;
      return null;
    }
    try {
      return encrypt(decrypt(value));
    } catch {
      r.unreadable++;
      return null;
    }
  };

  const sellers = await prisma.seller.findMany({ select: { userId: true, bankAccountEnc: true } });
  for (const s of sellers) {
    const next = rotate(s.bankAccountEnc);
    if (!next) continue;
    await prisma.seller.update({ where: { userId: s.userId }, data: { bankAccountEnc: next } });
    r.updated++;
  }

  const socials = await prisma.socialAccount.findMany({
    where: { refreshTokenEnc: { not: null } },
    select: { id: true, refreshTokenEnc: true },
  });
  for (const s of socials) {
    const next = rotate(s.refreshTokenEnc!);
    if (!next) continue;
    await prisma.socialAccount.update({ where: { id: s.id }, data: { refreshTokenEnc: next } });
    r.updated++;
  }
  return r;
}

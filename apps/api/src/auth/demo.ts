import { type CanActivate, Injectable, Logger, type OnApplicationBootstrap, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AppException } from '../common/app-exception';
import { encrypt } from '../common/crypto';
import { env, isDemo } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

/**
 * 공개 데모 모드 (DEMO_ACCOUNTS). 지정 계정만 로그인하고, 공유 계정을 망가뜨리는 기능(가입·비밀번호·탈퇴·
 * 소셜·판매자 정보)은 막는다. 계정 정보는 서버 환경 변수로만 받는다 — 깃에 두지 않는다.
 */
const accountsSchema = z.array(
  z.object({
    login: z.string().trim().toLowerCase().min(1),
    password: z.string().min(1),
    role: z.enum(['USER', 'SELLER', 'VERIFIED_SELLER', 'ADMIN', 'SUPER_ADMIN']),
    nickname: z.string().trim().min(2).max(20).optional(),
  }),
);
export type DemoAccount = z.infer<typeof accountsSchema>[number];

export function demoAccounts(): DemoAccount[] {
  const raw = env().DEMO_ACCOUNTS;
  return raw ? accountsSchema.parse(JSON.parse(raw)) : [];
}

export const isDemoLogin = (login: string) => demoAccounts().some((a) => a.login === login);

@Injectable()
export class DemoGuard implements CanActivate {
  canActivate() {
    if (isDemo()) throw new AppException('DEMO_DISABLED');
    return true;
  }
}

/** 데모에서 막을 핸들러에 붙인다 */
export const DemoBlocked = () => UseGuards(DemoGuard);

/** 부팅 시 지정 계정을 만들거나 비밀번호·역할을 맞춘다 */
@Injectable()
export class DemoAccountsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoAccountsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    if (!isDemo()) return;
    for (const a of demoAccounts()) await this.sync(a);
    this.logger.log(`demo mode: ${demoAccounts().length} accounts`);
  }

  private async sync(a: DemoAccount) {
    const passwordHash = await AuthService.hashPassword(a.password);
    const nickname =
      a.nickname ??
      a.login
        .split('@')[0]!
        .replace(/[^가-힣A-Za-z0-9_.]/g, '_')
        .slice(0, 20);
    const user = await this.prisma.user.upsert({
      where: { email: a.login },
      update: { passwordHash, role: a.role, status: 'ACTIVE' },
      create: {
        email: a.login,
        passwordHash,
        role: a.role,
        emailVerifiedAt: new Date(),
        termsAgreedAt: new Date(),
        privacyAgreedAt: new Date(),
        ageConfirmedAt: new Date(),
        profile: { create: { nickname } },
      },
    });
    if (a.role !== 'SELLER' && a.role !== 'VERIFIED_SELLER') return;
    // 판매자는 정산 계좌(Seller)가 있어야 판매자 화면이 열린다. 데모용 가짜 계좌
    await this.prisma.seller.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        businessName: nickname,
        bankName: '데모은행',
        bankAccountMasked: '****-**-0000',
        bankAccountEnc: encrypt('000000000000'),
        accountHolder: nickname,
        verifiedAt: a.role === 'VERIFIED_SELLER' ? new Date() : null,
      },
    });
  }
}

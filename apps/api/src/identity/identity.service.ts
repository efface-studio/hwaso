import { Injectable, Logger } from '@nestjs/common';
import type { IdentityStatusDto } from '@shop/shared';
import { AppException } from '../common/app-exception';
import { hmac, maskName, maskPhone, randomToken } from '../common/crypto';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** PortOne V2 본인인증 조회 응답 중 사용하는 필드 */
export interface PortOneIdentity {
  status: 'READY' | 'VERIFIED' | 'FAILED';
  verifiedCustomer?: {
    name?: string;
    phoneNumber?: string;
    birthDate?: string; // YYYY-MM-DD
    ci?: string;
  };
}

/** 외부 호출을 교체할 수 있게 분리 (테스트에서 더블로 바꾼다) */
@Injectable()
export class PortOneClient {
  async getIdentityVerification(id: string): Promise<PortOneIdentity> {
    const res = await fetch(`https://api.portone.io/identity-verifications/${encodeURIComponent(id)}`, {
      headers: { Authorization: `PortOne ${env().PORTONE_API_SECRET}` },
    });
    if (!res.ok) throw new AppException('IDENTITY_FAILED', undefined, undefined, 400);
    return (await res.json()) as PortOneIdentity;
  }
}

const ADULT_AGE = 19;
const PENDING_TTL_SEC = 30 * 60;

export function ageOn(birthDate: string, today = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

/**
 * PASS 본인인증 (PortOne V2). 키(PORTONE_*)만 넣으면 동작한다.
 * 1) prepare: 서버가 인증 ID 를 만들고 사용자와 묶는다  2) 클라이언트 SDK 로 PASS 인증
 * 3) complete: 서버가 PortOne 에서 결과를 직접 조회해 검증 (클라이언트 결과를 믿지 않는다)
 */
@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly portone: PortOneClient,
  ) {}

  enabled(): boolean {
    const e = env();
    return !!(e.PORTONE_API_SECRET && e.PORTONE_STORE_ID && e.PORTONE_IDENTITY_CHANNEL_KEY);
  }

  clientConfig() {
    return this.enabled()
      ? { storeId: env().PORTONE_STORE_ID!, channelKey: env().PORTONE_IDENTITY_CHANNEL_KEY! }
      : null;
  }

  async status(userId: string): Promise<IdentityStatusDto> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      verified: !!u.identityVerifiedAt,
      verifiedAt: u.identityVerifiedAt?.toISOString() ?? null,
      nameMasked: u.verifiedNameMasked,
      phoneMasked: u.phoneMasked,
      isAdult: u.isAdult,
    };
  }

  async prepare(userId: string) {
    if (!this.enabled())
      throw new AppException('PROVIDER_NOT_CONFIGURED', '본인인증을 사용할 수 없습니다.', undefined, 400);
    const identityVerificationId = `idv_${randomToken(18)}`;
    await this.redis.set(`idv:${identityVerificationId}`, userId, 'EX', PENDING_TTL_SEC);
    return { identityVerificationId, ...this.clientConfig()! };
  }

  async complete(userId: string, identityVerificationId: string): Promise<IdentityStatusDto> {
    const owner = await this.redis.getdel(`idv:${identityVerificationId}`);
    if (owner !== userId)
      throw new AppException(
        'IDENTITY_FAILED',
        '본인인증 요청이 만료되었습니다. 다시 시도해주세요.',
        undefined,
        400,
      );

    const result = await this.portone.getIdentityVerification(identityVerificationId);
    const c = result.verifiedCustomer;
    if (result.status !== 'VERIFIED' || !c?.ci)
      throw new AppException('IDENTITY_FAILED', undefined, undefined, 400);

    // CI 원문은 저장하지 않고 HMAC 만 보관 — 같은 명의의 중복 가입을 막는다
    const ciHash = hmac(env().OTP_SECRET, `ci:${c.ci}`);
    const other = await this.prisma.user.findFirst({
      where: { ciHash, id: { not: userId }, status: { not: 'DELETED' } },
    });
    if (other) throw new AppException('IDENTITY_ALREADY_USED', undefined, undefined, 409);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        identityVerifiedAt: new Date(),
        ciHash,
        isAdult: c.birthDate ? ageOn(c.birthDate) >= ADULT_AGE : false,
        verifiedNameMasked: c.name ? maskName(c.name) : null,
        phoneMasked: c.phoneNumber ? maskPhone(c.phoneNumber) : null,
      },
    });
    this.logger.log(`identity verified user=${userId}`);
    return this.status(userId);
  }

  /** 본인인증이 설정된 환경에서만 요구한다 (개발 환경은 키가 없으면 통과) */
  async assertVerified(userId: string) {
    if (!this.enabled()) return;
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { identityVerifiedAt: true },
    });
    if (!u.identityVerifiedAt) throw new AppException('IDENTITY_REQUIRED', undefined, undefined, 403);
  }
}

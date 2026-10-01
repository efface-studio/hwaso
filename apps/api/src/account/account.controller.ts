import { Body, Controller, Get, HttpCode, Module, Patch, Post, Req } from '@nestjs/common';
import {
  sellerRegisterSchema,
  sellerUpdateSchema,
  updateProfileSchema,
  type SellerInfoDto,
  type SellerRegisterInput,
  type SellerUpdateInput,
  type UpdateProfileInput,
} from '@shop/shared';
import type { Request } from 'express';
import { AppException } from '../common/app-exception';
import { CurrentUser, invalidateUserStatus, type AuthUser } from '../common/auth';
import { encrypt, maskTail } from '../common/crypto';
import { clientIp } from '../common/rate-limit';
import { ZodPipe } from '../common/zod.pipe';
import { IdentityModule } from '../identity/identity.controller';
import { IdentityService } from '../identity/identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthModule } from '../auth/auth.controller';
import { DemoBlocked } from '../auth/demo';
import { SessionService } from '../auth/session.service';
import { RequireReauth } from '../security/reauth.guard';
import { SecurityService } from '../security/security.service';

@Controller()
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
    private readonly security: SecurityService,
  ) {}

  @Patch('users/me/profile')
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    if (body.nickname) {
      const taken = await this.prisma.profile.findFirst({
        where: { nickname: body.nickname, userId: { not: user.id } },
        select: { userId: true },
      });
      if (taken) throw new AppException('NICKNAME_TAKEN');
    }
    if (body.avatarKey) {
      const owner = await this.redis.get(`media:owner:${body.avatarKey}`);
      const current = await this.prisma.profile.findUnique({
        where: { userId: user.id },
        select: { avatarKey: true },
      });
      if (owner !== user.id && current?.avatarKey !== body.avatarKey) {
        throw new AppException('INVALID_IMAGE', '업로드한 이미지만 사용할 수 있습니다.');
      }
    }
    await this.prisma.profile.update({
      where: { userId: user.id },
      data: {
        nickname: body.nickname,
        bio: body.bio,
        avatarKey: body.avatarKey,
        region: body.region,
      },
    });
    return this.sessions.me(user.id);
  }

  // ───── 판매자 등록 ↔ 정보 조회 ↔ 수정 ─────

  @Get('me/seller')
  async seller(@CurrentUser() user: AuthUser): Promise<SellerInfoDto> {
    const s = await this.prisma.seller.findUnique({ where: { userId: user.id } });
    if (!s) throw new AppException('SELLER_REQUIRED', undefined, undefined, 404);
    return {
      businessName: s.businessName,
      bankName: s.bankName,
      bankAccountMasked: s.bankAccountMasked,
      accountHolder: s.accountHolder,
      verified: !!s.verifiedAt,
    };
  }

  @DemoBlocked()
  @Post('me/seller')
  @HttpCode(201)
  async registerSeller(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(sellerRegisterSchema)) body: SellerRegisterInput,
    @Req() req: Request,
  ) {
    // 판매자는 정산을 받으므로 본인인증을 요구한다 (PortOne 키가 설정된 환경)
    await this.identity.assertVerified(user.id);
    const exists = await this.prisma.seller.findUnique({ where: { userId: user.id } });
    if (exists) throw new AppException('CONFLICT', '이미 판매자로 등록되어 있습니다.');
    await this.prisma.$transaction([
      this.prisma.seller.create({
        data: {
          userId: user.id,
          businessName: body.businessName ?? null,
          bankName: body.bankName,
          bankAccountEnc: encrypt(body.bankAccount),
          bankAccountMasked: maskTail(body.bankAccount),
          accountHolder: body.accountHolder,
        },
      }),
      // USER 만 SELLER 로 올린다 (관리자·인증 판매자 역할은 유지)
      this.prisma.user.updateMany({ where: { id: user.id, role: 'USER' }, data: { role: 'SELLER' } }),
    ]);
    await invalidateUserStatus(this.redis, user.id);
    await this.security.record(
      user.id,
      'SETTLEMENT_ACCOUNT_CHANGED',
      await this.security.contextOf(user, clientIp(req)),
      { registered: true, bankName: body.bankName, bankAccountMasked: maskTail(body.bankAccount) },
    );
    return this.sessions.me(user.id);
  }

  /** 정산 정보 수정 — 입금 계좌가 바뀔 수 있으므로 재인증을 요구한다 */
  @RequireReauth()
  @DemoBlocked()
  @Patch('me/seller')
  async updateSeller(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(sellerUpdateSchema)) body: SellerUpdateInput,
    @Req() req: Request,
  ) {
    const exists = await this.prisma.seller.findUnique({ where: { userId: user.id } });
    if (!exists) throw new AppException('SELLER_REQUIRED', undefined, undefined, 404);
    await this.prisma.seller.update({
      where: { userId: user.id },
      data: {
        businessName: body.businessName,
        bankName: body.bankName,
        accountHolder: body.accountHolder,
        ...(body.bankAccount
          ? { bankAccountEnc: encrypt(body.bankAccount), bankAccountMasked: maskTail(body.bankAccount) }
          : {}),
      },
    });
    const changed = (['bankName', 'bankAccount', 'accountHolder'] as const).filter(
      (k) => body[k] !== undefined,
    );
    if (changed.length)
      await this.security.record(
        user.id,
        'SETTLEMENT_ACCOUNT_CHANGED',
        await this.security.contextOf(user, clientIp(req)),
        {
          fields: changed,
          ...(body.bankName ? { bankName: body.bankName } : {}),
          ...(body.bankAccount ? { bankAccountMasked: maskTail(body.bankAccount) } : {}),
        },
      );
    return this.seller(user);
  }
}

@Module({
  imports: [IdentityModule, AuthModule],
  controllers: [AccountController],
})
export class AccountModule {}

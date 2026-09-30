import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REAUTH_TTL_SEC, type Role } from '@shop/shared';
import type { Request } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AppException } from './app-exception';

export interface AuthUser {
  id: string;
  role: Role;
  sessionId: string;
  /** 세션 family (기기 단위). 이 기능 이전에 발급된 토큰에는 없다 */
  familyId?: string;
}

export type AuthedRequest = Request & { user?: AuthUser };

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
const ISSUER = 'efface-shop';
const secret = () => new TextEncoder().encode(env().JWT_SECRET);

export async function signAccessToken(user: AuthUser): Promise<string> {
  const claims = {
    role: user.role,
    sid: user.sessionId,
    typ: 'access',
    ...(user.familyId ? { fam: user.familyId } : {}),
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
    .sign(secret());
}

export async function verifyAccessToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, algorithms: ['HS256'] });
    if (payload.typ !== 'access' || !payload.sub) return null;
    return {
      id: payload.sub,
      role: payload.role as Role,
      sessionId: String(payload.sid),
      ...(typeof payload.fam === 'string' ? { familyId: payload.fam } : {}),
    };
  } catch {
    return null;
  }
}

// ───── 재인증 토큰 (민감 작업 step-up, docs/SECURITY.md §계정 보안) ─────

const REAUTH_AUDIENCE = 'reauth';

export interface ReauthClaims {
  userId: string;
  sessionId: string;
  familyId: string;
}

/** 사용자 + 기기 세션(family)에 묶인 5분짜리 토큰. access 토큰과 typ·aud 가 달라 서로 대신 쓸 수 없다 */
export async function signReauthToken(c: ReauthClaims): Promise<{ reauthToken: string; expiresAt: string }> {
  const exp = Math.floor(Date.now() / 1000) + REAUTH_TTL_SEC;
  const reauthToken = await new SignJWT({ typ: 'reauth', sid: c.sessionId, fam: c.familyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(c.userId)
    .setIssuer(ISSUER)
    .setAudience(REAUTH_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret());
  return { reauthToken, expiresAt: new Date(exp * 1000).toISOString() };
}

export async function verifyReauthToken(token: string): Promise<ReauthClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: REAUTH_AUDIENCE,
      algorithms: ['HS256'],
    });
    if (payload.typ !== 'reauth' || !payload.sub || typeof payload.fam !== 'string') return null;
    return { userId: payload.sub, sessionId: String(payload.sid), familyId: payload.fam };
  } catch {
    return null;
  }
}

// ───── Access 토큰 즉시 폐기 ─────
// 로그아웃·원격 로그아웃·비밀번호 변경으로 폐기된 family 를 access 토큰 수명 동안 Redis 에 표시한다.
// 표시가 사라진 뒤에는 그 family 의 access 토큰도 모두 만료되었다 (폐기된 family 로는 새 토큰이 나오지 않는다).

const revokedKey = (familyId: string) => `auth:revoked:${familyId}`;

export async function markFamiliesRevoked(redis: RedisService, familyIds: readonly string[]) {
  if (!familyIds.length) return;
  const m = redis.multi();
  for (const f of new Set(familyIds)) m.set(revokedKey(f), '1', 'EX', ACCESS_TOKEN_TTL_SEC + 60);
  await m.exec();
}

/** family 가 없는 토큰(이 기능 이전 발급, 최대 15분)은 검사하지 않는다 */
export async function isFamilyRevoked(redis: RedisService, familyId: string | undefined): Promise<boolean> {
  return !!familyId && (await redis.exists(revokedKey(familyId))) > 0;
}

/** 짧은 수명 목적 토큰 (이메일 인증 결과, OAuth state 등) */
export async function signPurposeToken(claims: Record<string, unknown>, ttlSec: number): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .sign(secret());
}

export async function verifyPurposeToken<T extends Record<string, unknown>>(
  token: string,
  typ: string,
): Promise<T> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, algorithms: ['HS256'] });
    if (payload.typ !== typ) throw new Error('typ');
    return payload as T;
  } catch {
    throw new AppException('INVALID_TOKEN', '인증 정보가 만료되었습니다. 처음부터 다시 진행해주세요.');
  }
}

const PUBLIC = 'auth:public';
const OPTIONAL = 'auth:optional';
const ROLES = 'auth:roles';

/** 로그인 없이 접근 가능 */
export const Public = () => SetMetadata(PUBLIC, true);
/** 로그인하지 않아도 되지만, 토큰이 있으면 req.user 를 채운다 (isFavorite 등 개인화) */
export const OptionalAuth = () => SetMetadata(OPTIONAL, true);
/** 허용 역할 (서버에서만 권한 판단 — docs/AUTH.md §8) */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

/**
 * 전역 가드. 기본은 로그인 필요. 계정 정지/탈퇴 여부는 30초 캐시로, 세션 폐기 여부는 Redis 표시로 매 요청 확인한다.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, targets);
    const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL, targets);
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();

    const token = bearer(req);
    const user = token ? await verifyAccessToken(token) : null;
    // Redis 장애 시 요청은 실패한다(fail-closed) — 계정 상태 캐시도 같은 Redis 에 의존한다
    if (user && !(await isFamilyRevoked(this.redis, user.familyId)) && (await this.isActive(user.id)))
      req.user = await this.withFreshRole(user);

    if (isPublic || isOptional) return true;
    if (!req.user) throw new AppException(token ? 'INVALID_TOKEN' : 'UNAUTHORIZED');

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.includes(req.user.role)) throw new AppException('FORBIDDEN');
    return true;
  }

  private async isActive(userId: string): Promise<boolean> {
    const key = `user:status:${userId}`;
    let status = await this.redis.get(key);
    if (!status) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { status: true, role: true },
      });
      status = u ? `${u.status}:${u.role}` : 'DELETED:USER';
      await this.redis.set(key, status, 'EX', 30);
    }
    return status.startsWith('ACTIVE');
  }

  /** 역할 변경이 토큰 재발급 전에도 반영되도록 캐시된 역할을 사용한다 */
  private async withFreshRole(user: AuthUser): Promise<AuthUser> {
    const cached = await this.redis.get(`user:status:${user.id}`);
    const role = cached?.split(':')[1] as Role | undefined;
    return role ? { ...user, role } : user;
  }
}

/** 상태/역할 변경 시 캐시를 즉시 무효화한다 */
export const invalidateUserStatus = (redis: RedisService, userId: string) =>
  redis.del(`user:status:${userId}`);

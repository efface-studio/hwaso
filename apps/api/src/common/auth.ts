import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@shop/shared';
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
}

export type AuthedRequest = Request & { user?: AuthUser };

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
const ISSUER = 'efface-shop';
const secret = () => new TextEncoder().encode(env().JWT_SECRET);

export async function signAccessToken(user: AuthUser): Promise<string> {
  return new SignJWT({ role: user.role, sid: user.sessionId, typ: 'access' })
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
    return { id: payload.sub, role: payload.role as Role, sessionId: String(payload.sid) };
  } catch {
    return null;
  }
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
const CONSENT_EXEMPT = 'auth:consent-exempt';
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 로그인 없이 접근 가능 */
export const Public = () => SetMetadata(PUBLIC, true);
/** 로그인하지 않아도 되지만, 토큰이 있으면 req.user 를 채운다 (isFavorite 등 개인화) */
export const OptionalAuth = () => SetMetadata(OPTIONAL, true);
/** 허용 역할 (서버에서만 권한 판단 — docs/AUTH.md §8) */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
/**
 * 필수 동의 전에도 쓸 수 있는 쓰기 요청 (인증·탈퇴·동의 자체). 나머지 로그인 필요 쓰기 요청은
 * 동의 전이면 403 CONSENT_REQUIRED (docs/AUTH.md §11)
 */
export const ConsentExempt = () => SetMetadata(CONSENT_EXEMPT, true);

interface UserState {
  active: boolean;
  role: Role;
  consented: boolean;
}

/** 캐시 값 "ACTIVE:USER:1" — 상태:역할:필수 동의 여부 */
const parseState = (raw: string | null): UserState | null => {
  const [status, role, consent] = raw?.split(':') ?? [];
  if (!status || !role || (consent !== '0' && consent !== '1')) return null;
  return { active: status === 'ACTIVE', role: role as Role, consented: consent === '1' };
};

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

/**
 * 전역 가드. 기본은 로그인 필요. 계정 정지/탈퇴 여부는 30초 캐시로 매 요청 확인한다.
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
    const state = user ? await this.state(user.id) : null;
    // 역할 변경이 토큰 재발급 전에도 반영되도록 캐시된 역할을 사용한다
    if (user && state?.active) req.user = { ...user, role: state.role };

    if (isPublic || isOptional) return true;
    if (!req.user) throw new AppException(token ? 'INVALID_TOKEN' : 'UNAUTHORIZED');

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.includes(req.user.role)) throw new AppException('FORBIDDEN');

    // 필수 동의 전에는 읽기만 (쓰기는 인증·탈퇴·동의 자체만)
    if (
      !state?.consented &&
      !READ_METHODS.has(req.method) &&
      !this.reflector.getAllAndOverride<boolean>(CONSENT_EXEMPT, targets)
    )
      throw new AppException('CONSENT_REQUIRED');
    return true;
  }

  /** 상태·역할·동의 여부를 30초 캐시로 확인한다 */
  private async state(userId: string): Promise<UserState> {
    const key = `user:status:${userId}`;
    const cached = parseState(await this.redis.get(key));
    if (cached) return cached;
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, role: true, termsAgreedAt: true, privacyAgreedAt: true, ageConfirmedAt: true },
    });
    const raw = u ? `${u.status}:${u.role}:${hasRequiredConsent(u) ? 1 : 0}` : 'DELETED:USER:0';
    await this.redis.set(key, raw, 'EX', 30);
    return parseState(raw)!;
  }
}

/** 필수 동의(약관·개인정보·만 14세)를 모두 받았는지 */
export const hasRequiredConsent = (u: {
  termsAgreedAt: Date | null;
  privacyAgreedAt: Date | null;
  ageConfirmedAt: Date | null;
}) => !!(u.termsAgreedAt && u.privacyAgreedAt && u.ageConfirmedAt);

/** 상태/역할 변경 시 캐시를 즉시 무효화한다 */
export const invalidateUserStatus = (redis: RedisService, userId: string) =>
  redis.del(`user:status:${userId}`);

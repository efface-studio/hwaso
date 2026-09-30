import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REAUTH_HEADER } from '@shop/shared';
import { AppException } from '../common/app-exception';
import { type AuthedRequest, verifyReauthToken } from '../common/auth';
import { safeEqual } from '../common/crypto';
import { SecurityService } from './security.service';

/**
 * 재인증을 요구하는 플랫폼. 웹은 아직 재인증 UI 가 없어 제외한다 (웹 결제·설정이 막히지 않게).
 * 플랫폼은 요청 헤더가 아니라 서버의 Session 행에서 읽으므로 클라이언트가 바꿀 수 없다.
 */
export const REAUTH_ENFORCED_PLATFORMS: readonly string[] = ['ios', 'android'];

interface ReauthOptions {
  /** true 면 웹 세션에도 요구한다 (생체 키 등록처럼 앱 전용 기능) */
  allPlatforms?: boolean;
}

const REAUTH = 'auth:reauth';

/**
 * 민감 작업 step-up 재인증 (docs/SECURITY.md §계정 보안).
 * `x-reauth-token` 이 현재 access 토큰의 사용자·기기 세션(family)에 발급된 5분 이내 토큰이어야 한다.
 * 없거나 맞지 않으면 403 REAUTH_REQUIRED — 401 은 클라이언트가 토큰 갱신으로 처리하므로 쓰지 않는다.
 * 기존 확인(현재 비밀번호 등)은 그대로 두고 추가로 요구한다. 전역 AuthGuard 다음에 실행된다.
 */
export const RequireReauth = (opts: ReauthOptions = {}) =>
  applyDecorators(SetMetadata(REAUTH, opts), UseGuards(ReauthGuard));

@Injectable()
export class ReauthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly security: SecurityService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.get<ReauthOptions | undefined>(REAUTH, ctx.getHandler()) ?? {};
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) throw new AppException('UNAUTHORIZED');
    // 폐기된 기기의 access 토큰은 여기서 DB 로 한 번 더 거른다 (Redis 표시의 보조 수단)
    const session = await this.security.liveSession(user);
    if (!session) throw new AppException('INVALID_TOKEN');
    if (!opts.allPlatforms && !REAUTH_ENFORCED_PLATFORMS.includes(session.platform)) return true;

    const header = req.headers[REAUTH_HEADER];
    const token = typeof header === 'string' ? header : null;
    const claims = token ? await verifyReauthToken(token) : null;
    if (!claims || claims.userId !== user.id || !safeEqual(claims.familyId, session.familyId))
      throw new AppException('REAUTH_REQUIRED');
    return true;
  }
}

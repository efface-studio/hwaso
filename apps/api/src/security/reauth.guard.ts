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
  /**
   * true 면 본문의 소셜 재인증(`provider` + OAuth 결과·Apple identityToken)을 재인증으로 인정한다 (탈퇴).
   * provider 로 방금 다시 로그인한 결과이고, 핸들러가 그 계정이 이 회원에게 연결돼 있는지 확인한 뒤에만 진행한다.
   * 비밀번호도 실제 이메일도 없는 소셜 가입자는 재인증 토큰을 받을 방법이 없어 이 경로로만 탈퇴할 수 있다.
   */
  socialProof?: boolean;
}

const REAUTH = 'auth:reauth';

/** 비밀번호·이메일 인증 없이 소셜 재인증만 담긴 본문 — 핸들러가 이 증명으로만 본인을 확인한다 */
const isSocialProofOnly = (body: unknown) => {
  const b = (body ?? {}) as { provider?: unknown; password?: unknown; verificationToken?: unknown };
  return typeof b.provider === 'string' && !b.password && !b.verificationToken;
};

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
    if (opts.socialProof && isSocialProofOnly(req.body)) return true;

    const header = req.headers[REAUTH_HEADER];
    const token = typeof header === 'string' ? header : null;
    const claims = token ? await verifyReauthToken(token) : null;
    if (!claims || claims.userId !== user.id || !safeEqual(claims.familyId, session.familyId))
      throw new AppException('REAUTH_REQUIRED');
    return true;
  }
}

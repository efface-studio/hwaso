import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AuthProvider, DeviceInput } from '@shop/shared';
import { AppException } from '../common/app-exception';
import { randomToken } from '../common/crypto';
import { env, isProd } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { type OAuthProfile, PROVIDERS, verifyAppleIdToken } from './oauth.providers';
import { type ClientInfo, SessionService } from './session.service';

const STATE_TTL_SEC = 600;
const EXPO_GO_BUNDLE_ID = 'host.exp.Exponent';

interface StoredState {
  provider: AuthProvider;
  redirectUri: string;
  codeVerifier: string;
  /** 모바일: API 중계 후 돌아갈 앱 딥링크 */
  appRedirect?: string;
}

export const providerFromParam = (p: string): AuthProvider => {
  const up = p.toUpperCase();
  if (up === 'GOOGLE' || up === 'APPLE' || up === 'KAKAO' || up === 'NAVER') return up;
  throw new AppException('NOT_FOUND', '지원하지 않는 로그인 방식입니다.');
};

/** API 가 받아서 앱으로 넘겨주는 모바일용 redirect_uri */
export const mobileRelayUri = (provider: AuthProvider) =>
  `${env().API_PUBLIC_URL}/api/v1/auth/oauth/${provider.toLowerCase()}/redirect`;

@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sessions: SessionService,
  ) {}

  configured(): AuthProvider[] {
    return (Object.keys(PROVIDERS) as AuthProvider[]).filter((p) => PROVIDERS[p].configured());
  }

  /** iOS 네이티브 Sign in with Apple 사용 가능 여부 (웹 OAuth 키 없이 번들 ID 만으로 동작) */
  appleNativeConfigured(): boolean {
    return !!env().APPLE_BUNDLE_ID;
  }

  private assertConfigured(provider: AuthProvider) {
    if (!PROVIDERS[provider].configured())
      throw new AppException('PROVIDER_NOT_CONFIGURED', undefined, undefined, 400);
  }

  /** 오픈 리다이렉트 방지: 허용 목록의 주소로 시작하는 redirectUri 만 */
  private assertRedirect(redirectUri: string, provider: AuthProvider) {
    const allowed = [...env().OAUTH_REDIRECT_ALLOWLIST, mobileRelayUri(provider)];
    if (!allowed.some((a) => redirectUri === a || redirectUri.startsWith(`${a}/`))) {
      throw new AppException('VALIDATION_FAILED', '허용되지 않은 리다이렉트 주소입니다.');
    }
  }

  async authorizeUrl(provider: AuthProvider, redirectUri: string, appRedirect?: string) {
    this.assertConfigured(provider);
    // 모바일 앱은 API 중계 주소로 provider 에 등록하고, 인증 후 앱 딥링크로 넘긴다
    const effective = appRedirect ? mobileRelayUri(provider) : redirectUri;
    this.assertRedirect(effective, provider);
    if (appRedirect && !appRedirect.startsWith(`${env().APP_SCHEME}://`)) {
      throw new AppException('VALIDATION_FAILED', '허용되지 않은 앱 주소입니다.');
    }
    const state = randomToken(24);
    const codeVerifier = randomToken(48);
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const stored: StoredState = { provider, redirectUri: effective, codeVerifier, appRedirect };
    await this.redis.set(`oauth:state:${state}`, JSON.stringify(stored), 'EX', STATE_TTL_SEC);
    return { url: PROVIDERS[provider].authorizeUrl({ redirectUri: effective, state, codeChallenge }), state };
  }

  /** state 는 1회용 (GETDEL) — CSRF·재사용 방지 */
  private async consumeState(state: string, provider: AuthProvider): Promise<StoredState> {
    const raw = await this.redis.getdel(`oauth:state:${state}`);
    if (!raw) throw new AppException('INVALID_TOKEN', '로그인 요청이 만료되었습니다. 다시 시도해주세요.');
    const s = JSON.parse(raw) as StoredState;
    if (s.provider !== provider) throw new AppException('INVALID_TOKEN');
    return s;
  }

  /** 모바일 중계: provider → API → 앱 딥링크 (state 는 소비하지 않고 앱이 callback 에서 소비) */
  async relayTarget(state: string): Promise<string | null> {
    const raw = await this.redis.get(`oauth:state:${state}`);
    return raw ? ((JSON.parse(raw) as StoredState).appRedirect ?? null) : null;
  }

  async profileFor(
    provider: AuthProvider,
    code: string,
    state: string,
    redirectUri: string,
  ): Promise<OAuthProfile> {
    this.assertConfigured(provider);
    const s = await this.consumeState(state, provider);
    if (s.redirectUri !== redirectUri) throw new AppException('INVALID_TOKEN');
    return PROVIDERS[provider].exchange({ code, redirectUri, codeVerifier: s.codeVerifier, state });
  }

  /**
   * 소셜 로그인/가입. 이미 연결된 계정 → 로그인. 새 소셜 계정인데 같은 인증 이메일의 계정이 있으면
   * 자동 연결하지 않는다 (이메일만으로 남의 계정에 들어가는 것 방지 — docs/AUTH.md §5).
   */
  async signIn(
    provider: AuthProvider,
    profile: OAuthProfile,
    device: DeviceInput,
    client: ClientInfo,
    name?: string,
  ) {
    const linked = await this.prisma.socialAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } },
      include: { user: true },
    });
    if (linked) {
      if (linked.user.status === 'SUSPENDED')
        throw new AppException(
          'ACCOUNT_RESTRICTED',
          linked.user.statusReason
            ? `이용이 제한된 계정입니다. 사유: ${linked.user.statusReason}`
            : undefined,
        );
      if (linked.user.status === 'DELETED') throw new AppException('INVALID_CREDENTIALS');
      const issued = await this.sessions.issue(linked.user, device, client);
      return { user: linked.user, issued, isNew: false };
    }

    if (profile.email) {
      const sameEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (sameEmail && sameEmail.status !== 'DELETED') throw new AppException('ACCOUNT_EXISTS');
    }

    const nickname = await this.uniqueNickname(name ?? profile.name);
    const user = await this.prisma.user.create({
      data: {
        // 이메일을 주지 않는 provider(카카오 동의 미선택 등)는 내부용 주소를 쓴다
        email: profile.email ?? `${provider.toLowerCase()}+${profile.providerUserId}@social.invalid`,
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
        termsAgreedAt: new Date(),
        profile: { create: { nickname } },
        socialAccounts: { create: { provider, providerUserId: profile.providerUserId } },
      },
    });
    const issued = await this.sessions.issue(user, device, client);
    return { user, issued, isNew: true };
  }

  async appleNative(
    identityToken: string,
    name: string | undefined,
    device: DeviceInput,
    client: ClientInfo,
  ) {
    const bundle = env().APPLE_BUNDLE_ID;
    if (!bundle) throw new AppException('PROVIDER_NOT_CONFIGURED', undefined, undefined, 400);
    const profile = await verifyAppleIdToken(identityToken, [
      bundle,
      ...(env().APPLE_CLIENT_ID ? [env().APPLE_CLIENT_ID!] : []),
      // 개발 중 Expo Go 로 실행하면 토큰 대상(aud)이 Expo Go 번들 ID 다
      ...(isProd() ? [] : [EXPO_GO_BUNDLE_ID]),
    ]);
    return this.signIn('APPLE', profile, device, client, name);
  }

  /** 로그인한 사용자가 소셜 계정 연결 ↔ 해제 */
  async link(userId: string, provider: AuthProvider, profile: OAuthProfile) {
    const exists = await this.prisma.socialAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } },
    });
    if (exists && exists.userId !== userId)
      throw new AppException('SOCIAL_ALREADY_LINKED', undefined, undefined, 409);
    if (exists) return;
    await this.prisma.socialAccount.create({
      data: { userId, provider, providerUserId: profile.providerUserId },
    });
  }

  async unlink(userId: string, provider: AuthProvider) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { socialAccounts: true },
    });
    const others = user.socialAccounts.filter((s) => s.provider !== provider);
    // 로그인 수단이 하나도 남지 않으면 해제할 수 없다
    if (!user.passwordHash && others.length === 0)
      throw new AppException('LAST_LOGIN_METHOD', undefined, undefined, 409);
    await this.prisma.socialAccount.deleteMany({ where: { userId, provider } });
  }

  private async uniqueNickname(base: string | null): Promise<string> {
    const clean = (base ?? '').replace(/[^가-힣A-Za-z0-9_.]/g, '').slice(0, 12);
    const stem = clean.length >= 2 ? clean : '컬렉터';
    for (let i = 0; i < 20; i++) {
      const candidate =
        i === 0 && clean.length >= 2 ? stem : `${stem}${Math.floor(1000 + Math.random() * 9000)}`;
      const taken = await this.prisma.profile.findUnique({
        where: { nickname: candidate },
        select: { userId: true },
      });
      if (!taken) return candidate;
    }
    return `컬렉터${randomToken(4)}`;
  }
}

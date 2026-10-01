import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  containsProhibited,
  SOCIAL_PLACEHOLDER_EMAIL_DOMAIN,
  type AuthProvider,
  type DeviceInput,
} from '@shop/shared';
import { AppException } from '../common/app-exception';
import { decrypt, encrypt, randomToken } from '../common/crypto';
import { env, isProd } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AppleAuthClient } from './apple.client';
import { type OAuthProfile, PROVIDERS } from './oauth.providers';
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
/** 탈퇴 본인 확인용 소셜 재인증 (DeleteAccountInput 의 소셜 필드) */
export interface SocialProof {
  provider: string;
  code?: string;
  state?: string;
  redirectUri?: string;
  identityToken?: string;
  authorizationCode?: string;
}

type RevokeTarget = { token: string; clientId: string };

/** 암호화된 revoke 토큰 컬럼 값 */
const tokenColumns = (t: OAuthProfile['revokeToken']) =>
  t ? { refreshTokenEnc: encrypt(t.token), tokenClientId: t.clientId } : {};

export const mobileRelayUri = (provider: AuthProvider) =>
  `${env().API_PUBLIC_URL}/api/v1/auth/oauth/${provider.toLowerCase()}/redirect`;

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sessions: SessionService,
    private readonly apple: AppleAuthClient,
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
      // 다시 로그인하며 새 refresh 토큰을 받았으면 갱신한다 (탈퇴 시 폐기용)
      if (profile.revokeToken)
        await this.prisma.socialAccount.update({
          where: { id: linked.id },
          data: tokenColumns(profile.revokeToken),
        });
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
        // 이메일을 주지 않는 provider(카카오 동의 미선택 등)는 내부용 주소를 쓴다 — 가입 마무리에서 실제 이메일을 받는다
        email:
          profile.email ??
          `${provider.toLowerCase()}+${profile.providerUserId}@${SOCIAL_PLACEHOLDER_EMAIL_DOMAIN}`,
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
        // 동의는 자동으로 기록하지 않는다 — consentRequired 로 동의 화면을 거친다 (docs/AUTH.md §11)
        profile: { create: { nickname } },
        socialAccounts: {
          create: {
            provider,
            providerUserId: profile.providerUserId,
            ...tokenColumns(profile.revokeToken),
          },
        },
      },
    });
    const issued = await this.sessions.issue(user, device, client);
    return { user, issued, isNew: true };
  }

  /** iOS 네이티브 identityToken 이 받아들일 대상(aud) */
  private appleAudiences(): string[] {
    const bundle = env().APPLE_BUNDLE_ID;
    if (!bundle) throw new AppException('PROVIDER_NOT_CONFIGURED', undefined, undefined, 400);
    return [
      bundle,
      ...(env().APPLE_CLIENT_ID ? [env().APPLE_CLIENT_ID!] : []),
      // 개발 중 Expo Go 로 실행하면 토큰 대상(aud)이 Expo Go 번들 ID 다
      ...(isProd() ? [] : [EXPO_GO_BUNDLE_ID]),
    ];
  }

  /**
   * iOS 네이티브 Apple: identityToken 검증 + (있으면) authorization code 를 refresh 토큰으로 교환.
   * 교환 실패는 로그인·연결을 막지 않는다 — 탈퇴 시 폐기만 건너뛴다.
   */
  async appleNativeProfile(identityToken: string, authorizationCode?: string): Promise<OAuthProfile> {
    const profile = await this.apple.verifyIdToken(identityToken, this.appleAudiences());
    if (!authorizationCode) return profile;
    const clientId = env().APPLE_BUNDLE_ID!;
    const token = await this.apple.exchangeCode(authorizationCode, clientId);
    return { ...profile, revokeToken: token ? { token, clientId } : null };
  }

  async appleNative(
    identityToken: string,
    authorizationCode: string | undefined,
    name: string | undefined,
    device: DeviceInput,
    client: ClientInfo,
  ) {
    const profile = await this.appleNativeProfile(identityToken, authorizationCode);
    return this.signIn('APPLE', profile, device, client, name);
  }

  /** 로그인한 사용자가 소셜 계정 연결 ↔ 해제 */
  async link(userId: string, provider: AuthProvider, profile: OAuthProfile) {
    const exists = await this.prisma.socialAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } },
    });
    if (exists && exists.userId !== userId)
      throw new AppException('SOCIAL_ALREADY_LINKED', undefined, undefined, 409);
    if (exists) {
      if (profile.revokeToken)
        await this.prisma.socialAccount.update({
          where: { id: exists.id },
          data: tokenColumns(profile.revokeToken),
        });
      return;
    }
    await this.prisma.socialAccount.create({
      data: {
        userId,
        provider,
        providerUserId: profile.providerUserId,
        ...tokenColumns(profile.revokeToken),
      },
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
    const targets = this.revokeTargets(user.socialAccounts.filter((s) => s.provider === provider));
    await this.prisma.socialAccount.deleteMany({ where: { userId, provider } });
    await this.revoke(targets);
  }

  // ───── 탈퇴: 소셜 재인증 · Apple 토큰 폐기 ─────

  /**
   * 탈퇴 본인 확인 — OAuth 결과 계정이 이 회원에게 연결돼 있어야 한다.
   * Apple 은 이때 받은 refresh 토큰을 저장해 두어 탈퇴 직후 폐기한다.
   */
  async assertOwnership(userId: string, proof: SocialProof) {
    const provider = providerFromParam(proof.provider);
    let profile: OAuthProfile;
    if (proof.identityToken) {
      if (provider !== 'APPLE') throw new AppException('VALIDATION_FAILED');
      profile = await this.appleNativeProfile(proof.identityToken, proof.authorizationCode);
    } else {
      if (!proof.code || !proof.state || !proof.redirectUri) throw new AppException('VALIDATION_FAILED');
      profile = await this.profileFor(provider, proof.code, proof.state, proof.redirectUri);
    }
    const linked = await this.prisma.socialAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } },
    });
    if (!linked || linked.userId !== userId)
      throw new AppException(
        'INVALID_CREDENTIALS',
        '이 계정에 연결된 소셜 계정으로 확인해주세요.',
        undefined,
        400,
      );
    if (profile.revokeToken)
      await this.prisma.socialAccount.update({
        where: { id: linked.id },
        data: tokenColumns(profile.revokeToken),
      });
  }

  /** 폐기할 Apple 토큰 (연결 행을 지우기 전에 읽어 둔다) */
  async appleTokensOf(userId: string): Promise<RevokeTarget[]> {
    const rows = await this.prisma.socialAccount.findMany({ where: { userId, provider: 'APPLE' } });
    return this.revokeTargets(rows);
  }

  private revokeTargets(
    rows: { provider: AuthProvider; refreshTokenEnc: string | null; tokenClientId: string | null }[],
  ): RevokeTarget[] {
    const out: RevokeTarget[] = [];
    for (const r of rows) {
      if (r.provider !== 'APPLE') continue;
      if (!r.refreshTokenEnc || !r.tokenClientId) {
        // 토큰을 받기 전(authorizationCode 도입 전)에 연결된 계정 — 폐기할 토큰이 없다
        this.logger.warn('apple revoke skipped: no stored refresh token');
        continue;
      }
      try {
        out.push({ token: decrypt(r.refreshTokenEnc), clientId: r.tokenClientId });
      } catch {
        this.logger.warn('apple revoke skipped: token decrypt failed');
      }
    }
    return out;
  }

  /** Apple 토큰 폐기 — 실패해도 탈퇴·해제는 계속한다 */
  async revoke(targets: RevokeTarget[]) {
    await Promise.all(targets.map((t) => this.apple.revoke(t.token, t.clientId).catch(() => false)));
  }

  private async uniqueNickname(base: string | null): Promise<string> {
    const cleaned = (base ?? '').replace(/[^가-힣A-Za-z0-9_.]/g, '').slice(0, 12);
    // provider 이름에 금칙어가 있으면 기본 닉네임을 쓴다
    const clean = containsProhibited(cleaned) ? '' : cleaned;
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

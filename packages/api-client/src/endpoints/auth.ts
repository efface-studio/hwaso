import type {
  AppleLinkInput,
  AppleNativeInput,
  AuthProvider,
  AuthProvidersDto,
  IdentityStatusDto,
  OAuthLinkInput,
  SellerInfoDto,
  SellerRegisterInput,
  SellerUpdateInput,
  UpdateProfileInput,
  AuthTokens,
  BiometricKeyResult,
  BiometricRegisterInput,
  ChangePasswordInput,
  ConsentBody,
  DeleteAccountInput,
  LoginInput,
  MeDto,
  OAuthCallbackInput,
  ReauthInput,
  ReauthResult,
  ResetPasswordInput,
  SendCodeInput,
  SessionDto,
  SignupInput,
  VerifyCodeInput,
} from '@shop/shared';
import type { Http } from '../http';

const p = (provider: AuthProvider) => provider.toLowerCase();

export const authApi = (http: Http) => ({
  sendCode: (body: SendCodeInput) => http.post<{ retryAfterSec: number }>('/auth/email/send-code', body),
  verifyCode: (body: VerifyCodeInput) =>
    http.post<{ verificationToken: string }>('/auth/email/verify-code', body),
  signup: (body: SignupInput) => http.post<AuthTokens>('/auth/signup', body),
  login: (body: LoginInput) => http.post<AuthTokens>('/auth/login', body),
  /** Web 은 쿠키, Mobile 은 refreshToken 본문. signal 로 오래 걸리면 끊을 수 있다 */
  refresh: (refreshToken?: string, signal?: AbortSignal) =>
    http.post<AuthTokens>('/auth/refresh', refreshToken ? { refreshToken } : {}, {
      retryOnUnauthorized: false,
      signal,
    }),
  logout: (refreshToken?: string) =>
    http.post<void>('/auth/logout', refreshToken ? { refreshToken } : {}, { retryOnUnauthorized: false }),
  resetPassword: (body: ResetPasswordInput) => http.post<void>('/auth/password/reset', body),
  changePassword: (body: ChangePasswordInput) => http.post<void>('/auth/password/change', body),
  providers: () => http.get<AuthProvidersDto>('/auth/providers'),
  /** 웹: redirectUri, 앱: appRedirect(딥링크) — 앱은 API 가 중계한다 */
  oauthUrl: (provider: AuthProvider, target: { redirectUri?: string; appRedirect?: string }) =>
    http.get<{ url: string; state: string }>(`/auth/oauth/${p(provider)}/url`, target),
  oauthCallback: (provider: AuthProvider, body: OAuthCallbackInput) =>
    http.post<AuthTokens & { isNewUser: boolean }>(`/auth/oauth/${p(provider)}/callback`, body),
  appleNative: (body: AppleNativeInput) =>
    http.post<AuthTokens & { isNewUser: boolean }>('/auth/oauth/apple/native', body),
  linkSocial: (provider: AuthProvider, body: OAuthLinkInput) =>
    http.post<void>(`/auth/social/${p(provider)}`, body),
  linkAppleNative: (body: AppleLinkInput) => http.post<void>('/auth/social/apple/native', body),
  unlinkSocial: (provider: AuthProvider) => http.delete<void>(`/auth/social/${p(provider)}`),
  me: () => http.get<MeDto>('/auth/me'),
  sessions: () => http.get<SessionDto[]>('/auth/sessions'),
  revokeSession: (id: string) => http.delete<void>(`/auth/sessions/${encodeURIComponent(id)}`),
  revokeOtherSessions: () => http.delete<void>('/auth/sessions'),
  /** 비밀번호 · 이메일 인증 토큰 · 소셜 재인증({ provider, code, state, redirectUri } 또는 Apple { provider: 'apple', identityToken, authorizationCode }) 중 하나 */
  deleteAccount: (body: DeleteAccountInput) => http.delete<void>('/auth/account', body),
  /**
   * 필수 동의(약관·개인정보·만 14세) + 선택 마케팅. MeDto.consentRequired 가 true 인 동안 쓰기 요청은 403 CONSENT_REQUIRED.
   * 가입 마무리에서는 emailVerificationToken(SIGNUP)·nickname 도 함께 보낸다 (MeDto.emailMissing 이면 이메일 인증 필수)
   */
  consent: (body: ConsentBody) => http.post<MeDto>('/me/consent', body),

  // ───── 민감 작업 재인증 (결과 토큰은 http.setReauthToken 으로 저장하면 이후 요청에 자동으로 붙는다) ─────
  reauth: (body: ReauthInput) => http.post<ReauthResult>('/auth/reauth', body),
  /** 로그인한 계정 이메일로 재인증 인증번호 발송 */
  sendReauthCode: () => http.post<{ retryAfterSec: number }>('/auth/reauth/code'),
  /** 이 기기에 생체 재인증 키 발급 — secret 은 이 응답에서 한 번만 받는다. 재인증 토큰 필요 */
  registerBiometric: (body: BiometricRegisterInput, reauthToken?: string) =>
    http.post<BiometricKeyResult>('/auth/reauth/biometric', body, reauthToken ? { reauthToken } : undefined),
  removeBiometric: () => http.delete<void>('/auth/reauth/biometric'),

  updateProfile: (body: UpdateProfileInput) => http.patch<MeDto>('/users/me/profile', body),
  seller: () => http.get<SellerInfoDto>('/me/seller'),
  registerSeller: (body: SellerRegisterInput) => http.post<MeDto>('/me/seller', body),
  updateSeller: (body: SellerUpdateInput) => http.patch<SellerInfoDto>('/me/seller', body),

  identity: () => http.get<IdentityStatusDto>('/identity'),
  prepareIdentity: () =>
    http.post<{ identityVerificationId: string; storeId: string; channelKey: string }>('/identity/prepare'),
  completeIdentity: (identityVerificationId: string) =>
    http.post<IdentityStatusDto>('/identity/complete', { identityVerificationId }),
});

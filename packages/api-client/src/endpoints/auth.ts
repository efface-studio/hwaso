import type {
  AuthProvider,
  AuthTokens,
  ChangePasswordInput,
  DeleteAccountInput,
  LoginInput,
  MeDto,
  OAuthCallbackInput,
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
  /** Web 은 쿠키, Mobile 은 refreshToken 본문 */
  refresh: (refreshToken?: string) =>
    http.post<AuthTokens>('/auth/refresh', refreshToken ? { refreshToken } : {}, {
      retryOnUnauthorized: false,
    }),
  logout: (refreshToken?: string) =>
    http.post<void>('/auth/logout', refreshToken ? { refreshToken } : {}, { retryOnUnauthorized: false }),
  resetPassword: (body: ResetPasswordInput) => http.post<void>('/auth/password/reset', body),
  changePassword: (body: ChangePasswordInput) => http.post<void>('/auth/password/change', body),
  providers: () => http.get<{ providers: AuthProvider[] }>('/auth/providers'),
  oauthUrl: (provider: AuthProvider, redirectUri: string) =>
    http.get<{ url: string; state: string }>(`/auth/oauth/${p(provider)}/url`, { redirectUri }),
  oauthCallback: (provider: AuthProvider, body: OAuthCallbackInput) =>
    http.post<AuthTokens>(`/auth/oauth/${p(provider)}/callback`, body),
  me: () => http.get<MeDto>('/auth/me'),
  sessions: () => http.get<SessionDto[]>('/auth/sessions'),
  revokeSession: (id: string) => http.delete<void>(`/auth/sessions/${encodeURIComponent(id)}`),
  revokeOtherSessions: () => http.delete<void>('/auth/sessions'),
  deleteAccount: (body: DeleteAccountInput) => http.delete<void>('/auth/account', body),
});

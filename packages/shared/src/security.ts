import { z } from 'zod';
import type { AuthTokens } from './dto';
import { deviceSchema } from './schemas/auth';

// 계정 보안 (docs/SECURITY.md §계정 보안): 민감 작업 재인증 · 생체 키 · 보안 이벤트 · 기기 무결성 신고

export const REAUTH_METHODS = ['password', 'otp', 'biometric'] as const;
export type ReauthMethod = (typeof REAUTH_METHODS)[number];

export const reauthSchema = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('password'), password: z.string().min(1).max(200) }),
  z.strictObject({
    method: z.literal('otp'),
    code: z.string().regex(/^\d{6}$/, '6자리 숫자를 입력해주세요.'),
  }),
  z.strictObject({
    method: z.literal('biometric'),
    keyId: z.string().uuid(),
    secret: z.string().min(40).max(100),
  }),
]);
export type ReauthInput = z.infer<typeof reauthSchema>;

/** 재인증 결과. 사용자와 현재 기기 세션(family)에 묶이고 5분 동안 유효하다 */
export interface ReauthResult {
  reauthToken: string;
  expiresAt: string;
}

export const biometricRegisterSchema = z.strictObject({
  deviceName: z.string().trim().min(1).max(60),
});
export type BiometricRegisterInput = z.infer<typeof biometricRegisterSchema>;

/** secret 은 32바이트 난수(base64url)로 발급 시 한 번만 내려준다. 서버에는 SHA-256 만 저장 */
export interface BiometricKeyResult {
  keyId: string;
  secret: string;
}

// ───── 빠른 로그인 (Face ID·지문, docs/AUTH.md §9) ─────

/** 빠른 로그인 자격 수명 (일). 쓸 때마다 새 자격으로 바꾸며 다시 늘어난다 */
export const QUICK_LOGIN_TTL_DAYS = 90;

/** 앱 설치마다 만드는 기기 ID (UUID). 비밀이 아니라 자격을 이 설치에 묶는 데 쓴다 */
const installIdSchema = z.string().min(16).max(64);

export const quickLoginRegisterSchema = z.strictObject({
  deviceId: installIdSchema,
  deviceName: z.string().trim().min(1).max(80),
});
export type QuickLoginRegisterInput = z.infer<typeof quickLoginRegisterSchema>;

/** 이 기기의 자격 상태 조회·해제·현재 세션에 다시 묶기 */
export const quickLoginDeviceSchema = z.strictObject({ deviceId: installIdSchema });
export type QuickLoginDeviceInput = z.infer<typeof quickLoginDeviceSchema>;

/** 빠른 로그인: 생체 인증으로 꺼낸 secret 으로 로그인한다. 성공하면 자격을 새것으로 바꿔 준다 (1회용) */
export const quickLoginSchema = z.strictObject({
  credentialId: z.string().uuid(),
  secret: z.string().min(40).max(100),
  deviceId: installIdSchema,
  device: deviceSchema,
});
export type QuickLoginInput = z.infer<typeof quickLoginSchema>;

/** secret 은 32바이트 난수(base64url)로 발급 응답에서 한 번만 내려준다. 서버에는 SHA-256 만 저장 */
export interface QuickLoginCredentialResult {
  credentialId: string;
  secret: string;
  expiresAt: string;
}

export interface QuickLoginStatusDto {
  enabled: boolean;
  expiresAt: string | null;
}

/** 빠른 로그인 응답 = 일반 로그인 토큰 + 새 자격 */
export type QuickLoginTokens = AuthTokens & { quickLogin: QuickLoginCredentialResult };

export const SECURITY_EVENT_TYPES = [
  'LOGIN',
  'LOGIN_FAILED',
  'NEW_DEVICE',
  'LOGOUT',
  'SESSION_REVOKED',
  'PASSWORD_CHANGED',
  'SETTLEMENT_ACCOUNT_CHANGED',
  'REAUTH',
  'REAUTH_FAILED',
  'BIOMETRIC_REGISTERED',
  'BIOMETRIC_REMOVED',
  'INTEGRITY_WARNING',
  'ACCOUNT_LINKED',
  'ACCOUNT_UNLINKED',
  'QUICK_LOGIN_REGISTERED',
  'QUICK_LOGIN_REMOVED',
  'QUICK_LOGIN_FAILED',
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export const SECURITY_EVENT_LABEL: Record<SecurityEventType, string> = {
  LOGIN: '로그인',
  LOGIN_FAILED: '로그인 실패',
  NEW_DEVICE: '새 기기 로그인',
  LOGOUT: '로그아웃',
  SESSION_REVOKED: '기기 로그아웃',
  PASSWORD_CHANGED: '비밀번호 변경',
  SETTLEMENT_ACCOUNT_CHANGED: '정산 계좌 변경',
  REAUTH: '본인 재확인',
  REAUTH_FAILED: '본인 재확인 실패',
  BIOMETRIC_REGISTERED: '생체 인증 등록',
  BIOMETRIC_REMOVED: '생체 인증 해제',
  INTEGRITY_WARNING: '기기 보안 경고',
  ACCOUNT_LINKED: '소셜 계정 연결',
  ACCOUNT_UNLINKED: '소셜 계정 해제',
  QUICK_LOGIN_REGISTERED: '빠른 로그인 켜기',
  QUICK_LOGIN_REMOVED: '빠른 로그인 끄기',
  QUICK_LOGIN_FAILED: '빠른 로그인 실패',
};

export interface SecurityEventDto {
  id: string;
  type: SecurityEventType;
  /** 마지막 옥텟 마스킹 */
  ip: string | null;
  device: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export const INTEGRITY_FLAGS = ['jailbroken', 'debugger', 'hooked', 'emulator', 'tampered'] as const;
export type IntegrityFlag = (typeof INTEGRITY_FLAGS)[number];

export const integrityReportSchema = z.strictObject({
  platform: z.enum(['ios', 'android']),
  flags: z.array(z.enum(INTEGRITY_FLAGS)).max(5),
  appVersion: z.string().max(40),
});
export type IntegrityReportInput = z.infer<typeof integrityReportSchema>;

import { z } from 'zod';
import { AUTH_PROVIDERS, PLATFORMS, VERIFICATION_PURPOSES } from '../enums';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: '올바른 이메일 주소를 입력해주세요.' }).max(254));

export const passwordSchema = z
  .string()
  .min(8, '비밀번호는 8자 이상이어야 합니다.')
  .max(72, '비밀번호는 72자 이하여야 합니다.')
  .regex(/[A-Za-z]/, '영문을 포함해주세요.')
  .regex(/\d/, '숫자를 포함해주세요.');

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, '닉네임은 2자 이상이어야 합니다.')
  .max(20, '닉네임은 20자 이하여야 합니다.')
  .regex(/^[가-힣A-Za-z0-9_.]+$/, '한글, 영문, 숫자, _ . 만 사용할 수 있습니다.');

export const otpCodeSchema = z.string().regex(/^\d{6}$/, '6자리 숫자를 입력해주세요.');

export const deviceSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  platform: z.enum(PLATFORMS),
});
export type DeviceInput = z.infer<typeof deviceSchema>;

export const sendCodeSchema = z.strictObject({
  email: emailSchema,
  purpose: z.enum(VERIFICATION_PURPOSES),
});
export type SendCodeInput = z.infer<typeof sendCodeSchema>;

export const verifyCodeSchema = sendCodeSchema.extend({ code: otpCodeSchema });
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;

export const signupSchema = z.strictObject({
  verificationToken: z.string().min(10),
  password: passwordSchema,
  nickname: nicknameSchema,
  agreeTerms: z.literal(true, { message: '약관에 동의해주세요.' }),
  agreePrivacy: z.literal(true, { message: '개인정보 수집·이용에 동의해주세요.' }),
  ageOver14: z.literal(true, { message: '만 14세 이상만 가입할 수 있습니다.' }),
  agreeMarketing: z.boolean().default(false),
  device: deviceSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

/**
 * 필수 동의(약관·개인정보·만 14세) + 선택 마케팅. 소셜 첫 로그인 뒤 또는 약관 개정 후 받는다 (POST /me/consent).
 * 이미 동의한 사용자가 다시 보내면 마케팅 수신 여부만 바꾸는 용도로도 쓴다.
 */
export const consentSchema = z.strictObject({
  terms: z.literal(true, { message: '이용약관에 동의해주세요.' }),
  privacy: z.literal(true, { message: '개인정보 수집·이용에 동의해주세요.' }),
  ageOver14: z.literal(true, { message: '만 14세 이상만 이용할 수 있습니다.' }),
  marketing: z.boolean().default(false),
});
export type ConsentInput = z.infer<typeof consentSchema>;
export type ConsentBody = z.input<typeof consentSchema>;

/** 로그인 아이디: 가입은 이메일이지만 데모 지정 계정(test1 등)은 이메일 형식이 아니다 */
export const loginIdSchema = z.string().trim().toLowerCase().min(1, '이메일을 입력해주세요.').max(254);

export const loginSchema = z.strictObject({
  email: loginIdSchema,
  password: z.string().min(1, '비밀번호를 입력해주세요.').max(72),
  device: deviceSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.strictObject({
  refreshToken: z.string().min(10).optional(),
});

export const resetPasswordSchema = z.strictObject({
  verificationToken: z.string().min(10),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(72),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const oauthCallbackSchema = z.strictObject({
  code: z.string().min(1).max(2048),
  state: z.string().min(10).max(200),
  redirectUri: z.url(),
  device: deviceSchema,
  /** Apple 최초 로그인 시에만 전달되는 이름 */
  name: z.string().max(80).optional(),
});
export type OAuthCallbackInput = z.infer<typeof oauthCallbackSchema>;

const identityToken = z.string().min(20).max(4096);
/** iOS 네이티브 Apple 로그인의 1회용 authorization code — 서버가 refresh 토큰으로 교환해 탈퇴·연결 해제 때 폐기(revoke)한다 */
const authorizationCode = z.string().min(1).max(2048);

/** 소셜 provider — URL 과 같은 소문자, MeDto.socialProviders 와 같은 대문자 모두 받는다 */
export const SOCIAL_PROOF_PROVIDERS = ['kakao', 'naver', 'google', 'apple', ...AUTH_PROVIDERS] as const;

/**
 * 탈퇴 본인 확인. 셋 중 하나:
 * 1) password  2) verificationToken (이메일 인증, purpose=DELETE_ACCOUNT)
 * 3) 소셜 재인증 — 로그인·연결과 같은 OAuth 결과 { provider, code, state, redirectUri } 또는
 *    Apple 네이티브 { provider: 'apple', identityToken, authorizationCode? }. 서버는 결과 계정이 이 회원에게 연결돼 있는지 확인한다.
 */
export const deleteAccountSchema = z
  .strictObject({
    password: z.string().max(72).optional(),
    verificationToken: z.string().min(10).optional(),
    provider: z.enum(SOCIAL_PROOF_PROVIDERS).optional(),
    code: z.string().min(1).max(2048).optional(),
    state: z.string().min(10).max(200).optional(),
    redirectUri: z.url().optional(),
    identityToken: identityToken.optional(),
    authorizationCode: authorizationCode.optional(),
  })
  .refine(
    (v) =>
      !!v.password ||
      !!v.verificationToken ||
      (!!v.provider &&
        ((!!v.code && !!v.state && !!v.redirectUri) ||
          (v.provider.toUpperCase() === 'APPLE' && !!v.identityToken))),
    { message: '비밀번호, 이메일 인증 또는 소셜 계정 확인이 필요합니다.' },
  );
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/** 로그인한 사용자가 소셜 계정을 연결할 때 (device 불필요) */
export const oauthCodeLinkSchema = oauthCallbackSchema.omit({ device: true });
/** iOS 네이티브 Apple 연결 (POST /auth/social/apple) */
export const appleNativeLinkSchema = z.strictObject({
  identityToken,
  authorizationCode: authorizationCode.optional(),
});
export const oauthLinkSchema = z.union([oauthCodeLinkSchema, appleNativeLinkSchema]);
export type OAuthLinkInput = z.infer<typeof oauthLinkSchema>;

/** iOS 네이티브 Sign in with Apple — identityToken 을 서버가 Apple 공개키로 검증 */
export const appleNativeSchema = z.strictObject({
  identityToken,
  authorizationCode: authorizationCode.optional(),
  name: z.string().max(80).optional(),
  device: deviceSchema,
});
export type AppleNativeInput = z.infer<typeof appleNativeSchema>;

export const identityCompleteSchema = z.strictObject({
  identityVerificationId: z.string().min(8).max(100),
});

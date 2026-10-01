import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET 은 32자 이상이어야 합니다.'),
  OTP_SECRET: z.string().min(32),
  DATA_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'DATA_ENCRYPTION_KEY 는 32바이트 hex 여야 합니다.'),
  /** 키 교체 중에만: 이전 키(복호화 전용). 재암호화(scripts/reencrypt-data-key.ts)가 끝나면 지운다 */
  DATA_ENCRYPTION_KEY_PREVIOUS: optional.refine(
    (v) => !v || /^[0-9a-f]{64}$/i.test(v),
    'DATA_ENCRYPTION_KEY_PREVIOUS 는 32바이트 hex 여야 합니다.',
  ),
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('shop-media'),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_FORCE_PATH_STYLE: bool.default(false),
  MEDIA_PUBLIC_URL: z.string().url(),
  SMTP_URL: optional,
  MAIL_FROM: z.string().default('화소 <no-reply@shop.efface.dev>'),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  KAKAO_CLIENT_ID: optional,
  KAKAO_CLIENT_SECRET: optional,
  NAVER_CLIENT_ID: optional,
  NAVER_CLIENT_SECRET: optional,
  APPLE_CLIENT_ID: optional,
  APPLE_TEAM_ID: optional,
  APPLE_KEY_ID: optional,
  APPLE_PRIVATE_KEY: optional,
  /** iOS 네이티브 Sign in with Apple 의 aud (앱 번들 ID). 비우면 앱에 Apple 로그인 버튼이 보이지 않는다 */
  APPLE_BUNDLE_ID: optional,
  /**
   * 네이티브 Apple 로그인 토큰 교환·폐기(revoke)용 키 (.p8, Sign in with Apple 사용 설정).
   * 비우면 APNS_* → APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY 순으로 쓴다. 개인키는 \n 을 줄바꿈으로 바꾼다
   */
  APPLE_SIGNIN_KEY_ID: optional,
  APPLE_SIGNIN_TEAM_ID: optional,
  APPLE_SIGNIN_PRIVATE_KEY: optional,
  // APNS_* 는 아래 푸시 설정에 있다
  /** 모바일 OAuth 가 브라우저에서 돌아올 때 거치는 API 공개 주소 */
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  APP_SCHEME: z.string().default('hwaso'),
  OAUTH_REDIRECT_ALLOWLIST: z
    .string()
    .default('http://localhost:3000/auth/callback')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  PORTONE_API_SECRET: optional,
  PORTONE_STORE_ID: optional,
  PORTONE_IDENTITY_CHANNEL_KEY: optional,
  TOSS_SECRET_KEY: optional,
  TOSS_CLIENT_KEY: optional,
  /** Web Push (npx web-push generate-vapid-keys). 비우면 웹 푸시만 끈다 */
  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: optional,
  /** Expo 푸시 보안 설정을 켠 경우에만 필요 */
  EXPO_ACCESS_TOKEN: optional,
  /** iOS 푸시(APNs) 토큰 인증 키 — Apple Developer › Keys 의 .p8 내용(줄바꿈은 \n), 키 ID, 팀 ID */
  APNS_KEY_ID: optional,
  APNS_TEAM_ID: optional,
  APNS_PRIVATE_KEY: optional,
  /** APNs 토픽(앱 번들 ID). 비우면 APPLE_BUNDLE_ID */
  APNS_BUNDLE_ID: optional,
  /** Android 푸시(FCM HTTP v1) 서비스 계정 JSON 한 줄 — Firebase 콘솔 › 서비스 계정 › 새 비공개 키 */
  FCM_SERVICE_ACCOUNT: optional,
  /** OTA 배포 스크립트 공유 비밀 (x-ota-publish-token). 비우면 OTA 업로드·등록이 막힌다 */
  OTA_PUBLISH_TOKEN: optional.refine(
    (v) => !v || v.length >= 32,
    'OTA_PUBLISH_TOKEN 은 32자 이상이어야 합니다.',
  ),
  /** OTA 매니페스트 서명 키 (RSA 개인 키 PEM). env 한 줄로 넣을 때의 "\n" 은 줄바꿈으로 바꾼다 */
  OTA_SIGNING_KEY: optional.transform((v) => v?.replace(/\\n/g, '\n')),
  OTA_SIGNING_KEY_ID: z.string().min(1).default('main'),
  /** 공개 데모: 이 계정들만 로그인한다. JSON [{login,password,role,nickname?}] — 깃에 두지 않는다 (auth/demo.ts) */
  DEMO_ACCOUNTS: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** 부팅 시 필수 환경 변수를 검증한다. 누락되면 기동하지 않는다 (docs/SECURITY.md). */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`환경 변수 설정 오류:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production') {
    const weak = productionSecretIssues(parsed.data);
    if (weak.length) throw new Error(`운영 환경 비밀값 오류:\n${weak.map((w) => `  - ${w}`).join('\n')}`);
  }
  cached = parsed.data;
  return cached;
}

/** 저장소에 공개된 기본값(.env.example·테스트·CI)의 접두사 */
const DEV_SECRET_PREFIXES = ['dev-only', 'test-', 'e2e-'];

/**
 * 운영에서 저장소에 공개된 개발용 비밀값을 쓰면 기동하지 않는다 (fail-closed, docs/SECURITY.md).
 * 값은 출력하지 않고 이름만 알린다.
 */
export function productionSecretIssues(e: Env): string[] {
  const out: string[] = [];
  const devPrefixed = (v: string) => DEV_SECRET_PREFIXES.some((p) => v.startsWith(p));
  if (devPrefixed(e.JWT_SECRET)) out.push('JWT_SECRET 이 개발용 기본값입니다.');
  if (devPrefixed(e.OTP_SECRET)) out.push('OTP_SECRET 이 개발용 기본값입니다.');
  if (e.JWT_SECRET === e.OTP_SECRET) out.push('JWT_SECRET 과 OTP_SECRET 은 서로 달라야 합니다.');
  // 0000…·1111… 처럼 한 글자만 반복된 키 (.env.example·CI 값)
  if (/^(.)\1*$/.test(e.DATA_ENCRYPTION_KEY)) out.push('DATA_ENCRYPTION_KEY 가 개발용 기본값입니다.');
  return out;
}

export const isProd = () => env().NODE_ENV === 'production';
export const isDemo = () => !!env().DEMO_ACCOUNTS;

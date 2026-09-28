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
  /** iOS 네이티브 Sign in with Apple 의 aud (앱 번들 ID) */
  APPLE_BUNDLE_ID: optional,
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
  if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_SECRET.startsWith('dev-only')) {
    throw new Error('운영 환경에서 개발용 JWT_SECRET 을 사용할 수 없습니다.');
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === 'production';
export const isDemo = () => !!env().DEMO_ACCOUNTS;

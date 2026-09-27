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
  MAIL_FROM: z.string().default('Efface Shop <no-reply@shop.efface.dev>'),
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
  OAUTH_REDIRECT_ALLOWLIST: z
    .string()
    .default('http://localhost:3000/auth/callback')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  TOSS_SECRET_KEY: optional,
  TOSS_CLIENT_KEY: optional,
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

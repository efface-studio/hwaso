// 통합 테스트 환경 변수. 실제 PostgreSQL/Redis 를 쓰고 외부 연동(S3·메일·PG)은 테스트 더블로 교체한다.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL_TEST: 'postgresql://shop:shop@localhost:5433/shop_test',
  REDIS_URL: 'redis://localhost:6380',
  JWT_SECRET: 'test-secret-test-secret-test-secret-00',
  OTP_SECRET: 'test-otp-secret-test-otp-secret-000000',
  DATA_ENCRYPTION_KEY: '1'.repeat(64),
  S3_ACCESS_KEY: 'test',
  S3_SECRET_KEY: 'test',
  MEDIA_PUBLIC_URL: 'http://localhost:9000/shop-media/public',
  WEB_ORIGIN: 'http://localhost:3000',
};
for (const [k, v] of Object.entries(defaults)) process.env[k] ??= v;
process.env.NODE_ENV = 'test';

// 기능 키는 로컬 .env 값과 무관하게 고정한다 (외부 호출은 테스트 더블로 교체)
Object.assign(process.env, {
  PORTONE_API_SECRET: 'test-portone-secret',
  PORTONE_STORE_ID: 'store-test',
  PORTONE_IDENTITY_CHANNEL_KEY: 'channel-test',
  KAKAO_CLIENT_ID: 'kakao-test',
  KAKAO_CLIENT_SECRET: '',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  NAVER_CLIENT_ID: '',
  NAVER_CLIENT_SECRET: '',
  APPLE_CLIENT_ID: '',
  APPLE_BUNDLE_ID: '',
  APNS_KEY_ID: '',
  APNS_TEAM_ID: '',
  APNS_PRIVATE_KEY: '',
  FCM_SERVICE_ACCOUNT: '',
  SMTP_URL: '',
  OAUTH_REDIRECT_ALLOWLIST: 'http://localhost:3000/auth/callback',
});
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

-- 계정 보안 (#200): 보안 이벤트 기록, 생체 재인증 키, 재인증 OTP, 새 기기 로그인 알림
ALTER TYPE "VerificationPurpose" ADD VALUE IF NOT EXISTS 'REAUTH';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SECURITY_NEW_DEVICE';

CREATE TYPE "SecurityEventType" AS ENUM ('LOGIN', 'LOGIN_FAILED', 'NEW_DEVICE', 'LOGOUT', 'SESSION_REVOKED', 'PASSWORD_CHANGED', 'SETTLEMENT_ACCOUNT_CHANGED', 'REAUTH', 'REAUTH_FAILED', 'BIOMETRIC_REGISTERED', 'BIOMETRIC_REMOVED', 'INTEGRITY_WARNING', 'ACCOUNT_LINKED', 'ACCOUNT_UNLINKED');

CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SecurityEventType" NOT NULL,
    "ip" TEXT,
    "device" TEXT,
    "sessionId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt" DESC);
CREATE INDEX "SecurityEvent_sessionId_type_createdAt_idx" ON "SecurityEvent"("sessionId", "type", "createdAt");
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- secret 원문은 저장하지 않는다 (SHA-256 만)
CREATE TABLE "BiometricKey" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ,

    CONSTRAINT "BiometricKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BiometricKey_familyId_key" ON "BiometricKey"("familyId");
CREATE INDEX "BiometricKey_userId_idx" ON "BiometricKey"("userId");
ALTER TABLE "BiometricKey" ADD CONSTRAINT "BiometricKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

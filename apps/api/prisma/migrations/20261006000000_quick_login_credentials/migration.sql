-- Face ID·지문 빠른 로그인 자격 (#249). secret 원문·기기 ID 원문은 저장하지 않는다 (SHA-256 만)
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'QUICK_LOGIN_REGISTERED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'QUICK_LOGIN_REMOVED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'QUICK_LOGIN_FAILED';

CREATE TABLE "QuickLoginCredential" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceIdHash" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "prevSecretHash" TEXT,
    "familyId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ,
    "expiresAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "QuickLoginCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickLoginCredential_userId_deviceIdHash_key" ON "QuickLoginCredential"("userId", "deviceIdHash");
CREATE INDEX "QuickLoginCredential_familyId_idx" ON "QuickLoginCredential"("familyId");
CREATE INDEX "QuickLoginCredential_expiresAt_idx" ON "QuickLoginCredential"("expiresAt");
ALTER TABLE "QuickLoginCredential" ADD CONSTRAINT "QuickLoginCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

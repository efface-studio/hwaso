-- 자체 호스팅 OTA 업데이트 (Expo Updates 프로토콜 v1)
CREATE TABLE "OtaUpdate" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "runtimeVersion" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'production',
    "kind" TEXT NOT NULL DEFAULT 'UPDATE',
    "message" TEXT NOT NULL DEFAULT '',
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "launchAsset" JSONB,
    "assets" JSONB NOT NULL DEFAULT '[]',
    "expoClient" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtaUpdate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OtaUpdate_platform_runtimeVersion_channel_createdAt_idx" ON "OtaUpdate"("platform", "runtimeVersion", "channel", "createdAt" DESC);

ALTER TABLE "User" ADD COLUMN "statusReason" TEXT;
ALTER TABLE "Notice" ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Notice_isPinned_publishedAt_idx" ON "Notice"("isPinned", "publishedAt" DESC);
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

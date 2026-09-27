ALTER TYPE "ChatMessageKind" ADD VALUE IF NOT EXISTS 'APPOINTMENT';
ALTER TYPE "ChatMessageKind" ADD VALUE IF NOT EXISTS 'SYSTEM';

ALTER TABLE "ChatMessage" ADD COLUMN "data" JSONB, ADD COLUMN "clientId" TEXT;
CREATE UNIQUE INDEX "ChatMessage_roomId_senderId_clientId_key" ON "ChatMessage"("roomId", "senderId", "clientId");

ALTER TABLE "ChatReadState" ADD COLUMN "hiddenAt" TIMESTAMPTZ, ADD COLUMN "muted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "UserBlock" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerId","blockedId")
);
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

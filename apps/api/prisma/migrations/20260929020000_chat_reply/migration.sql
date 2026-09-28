-- 채팅 답장(인용)
ALTER TABLE "ChatMessage" ADD COLUMN "replyToId" TEXT;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

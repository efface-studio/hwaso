-- 채팅방 상단 고정
ALTER TABLE "ChatReadState" ADD COLUMN "pinnedAt" TIMESTAMPTZ;

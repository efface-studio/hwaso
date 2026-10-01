-- 성능: 목록·집계 쿼리 패턴에 맞춘 인덱스

-- 채팅 안 읽음 합계 (ChatReadState 는 PK 가 roomId 부터라 userId 조회를 못 탄다)
CREATE INDEX "ChatReadState_userId_idx" ON "ChatReadState"("userId");

-- 팔로워/팔로잉 목록 최신순 (followingId 단일 인덱스는 새 복합 인덱스가 대신한다)
DROP INDEX IF EXISTS "Follow_followingId_idx";
CREATE INDEX "Follow_followingId_createdAt_idx" ON "Follow"("followingId", "createdAt" DESC);
CREATE INDEX "Follow_followerId_createdAt_idx" ON "Follow"("followerId", "createdAt" DESC);

-- 관리자 대시보드 거래액·가입 추이, 회원 목록 가입순
CREATE INDEX "Order_paidAt_idx" ON "Order"("paidAt");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- 공개 상품 최신순 목록 (Prisma 로 표현할 수 없는 부분 인덱스 — schema.prisma Product 주석 참고)
-- status 는 Prisma 가 파라미터로 보내 부분 인덱스 조건으로 증명되지 않으므로 조건에서 뺀다
CREATE INDEX "product_published_idx" ON "Product"("publishedAt" DESC, "id")
  WHERE "deletedAt" IS NULL AND "publishedAt" IS NOT NULL;

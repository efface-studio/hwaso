-- 성능: 목록 개수·경매 목록 (docs/DATABASE.md "인덱스")
-- Prisma 로 표현할 수 없는 부분 인덱스라 schema.prisma 에는 주석으로만 남긴다.
-- migrate deploy 는 트랜잭션 안에서 실행되므로 CONCURRENTLY 를 쓸 수 없다 — 생성 중 해당 표의 쓰기가 잠긴다
-- (Product 수만 건 기준 1초 미만. 표가 커졌다면 배포 전에 같은 이름으로 CONCURRENTLY 생성해 두면 IF NOT EXISTS 로 건너뛴다)

-- 공개 상품 개수(전체·카테고리): status·categoryId 만으로 index-only scan (기존엔 Product 전체 순차 스캔)
CREATE INDEX IF NOT EXISTS "product_public_status_category_idx" ON "Product"("status", "categoryId")
  WHERE "deletedAt" IS NULL AND "publishedAt" IS NOT NULL;

-- 종료된 경매 목록 최근 종료순 (ENDED·SETTLED 는 항상 endedAt 이 있다 — 쿼리도 endedAt IS NOT NULL 을 건다)
CREATE INDEX IF NOT EXISTS "auction_ended_idx" ON "Auction"("endedAt" DESC)
  WHERE "endedAt" IS NOT NULL;

-- 정렬·가격 필터용 표시 가격 (즉시구매/예약 = price, 경매 = 현재가)
ALTER TABLE "Product" ADD COLUMN "listPrice" BIGINT;

DROP INDEX IF EXISTS "Product_price_idx";
CREATE INDEX "Product_listPrice_idx" ON "Product"("listPrice");
CREATE INDEX "Product_favoriteCount_idx" ON "Product"("favoriteCount");

-- 기존 데이터 채우기
UPDATE "Product" p SET "listPrice" = a."currentPrice"
FROM "Auction" a
WHERE a."productId" = p."id";
UPDATE "Product" SET "listPrice" = "price" WHERE "listPrice" IS NULL;

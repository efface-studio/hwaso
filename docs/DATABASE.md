# DATABASE

PostgreSQL 16 · Prisma 6. 스키마 원본은 `apps/api/prisma/schema.prisma` 이며 이 문서는 설계 의도를 설명한다.

## 공통 규칙

- PK: `cuid()` 문자열 `id`. 외부 URL 에도 그대로 사용 (추측 불가).
- 시간: `timestamptz`, 서버/DB 모두 UTC. 표시만 KST.
- **금액: `BigInt` (KRW 원 단위 정수)**. 미술품은 21억 원을 넘을 수 있어 Int 를 쓰지 않는다. JSON 직렬화 시 number 로 변환 (안전 범위 2^53).
- Soft delete: `deletedAt` (User, Product, Review, ChatMessage). 나머지는 상태 컬럼으로 관리.
- 모든 FK 에 인덱스. 목록 쿼리 패턴마다 복합 인덱스.
- 금액·상태 불변식은 가능한 한 DB `CHECK` 제약으로도 건다 (마이그레이션 SQL).

## Enum

| Enum | 값 |
| --- | --- |
| `Role` | USER, SELLER, VERIFIED_SELLER, ADMIN, SUPER_ADMIN |
| `UserStatus` | ACTIVE, SUSPENDED, DELETED |
| `AuthProvider` | GOOGLE, APPLE, KAKAO, NAVER |
| `SaleType` | FIXED (즉시 구매), AUCTION (경매), RESERVATION (예약 판매) |
| `ProductStatus` | DRAFT, PENDING_REVIEW, ACTIVE, RESERVED, SOLD, SUSPENDED, HIDDEN |
| `ItemCondition` | MINT, EXCELLENT, GOOD, FAIR, POOR |
| `VerificationStatus` | UNVERIFIED, PENDING, VERIFIED, REJECTED |
| `AuctionStatus` | DRAFT, SCHEDULED, LIVE, ENDED, SETTLED, CANCELLED |
| `AuctionResult` | NONE, SOLD, NO_BIDS, UNPAID |
| `OrderStatus` | PENDING, PAYMENT_PENDING, PAID, PREPARING, SHIPPED, DELIVERED, COMPLETED, CANCELLED, REFUND_REQUESTED, REFUNDED |
| `OrderSource` | DIRECT, AUCTION |
| `PaymentStatus` | READY, DONE, CANCELLED, PARTIAL_REFUNDED, REFUNDED, FAILED |
| `PaymentMethod` | CARD, EASY_PAY, BANK_TRANSFER |
| `ShipmentStatus` | READY, SHIPPED, IN_TRANSIT, DELIVERED |
| `SettlementStatus` | PENDING, SCHEDULED, PAID, HELD |
| `NotificationType` | BID_PLACED, OUTBID, AUCTION_ENDING, AUCTION_WON, AUCTION_LOST, AUCTION_STARTED, ITEM_SOLD, PAYMENT_DONE, SHIPPED, DELIVERED, INQUIRY_ANSWERED, PRICE_CHANGED, FOLLOWED, FAVORITE_ON_SALE, CHAT_MESSAGE, SYSTEM |
| `ReportTarget` | PRODUCT, USER, REVIEW, MESSAGE |
| `ReportReason` | FRAUD, FAKE_ITEM, COUNTERFEIT, COPYRIGHT, INAPPROPRIATE, OTHER |
| `ReportStatus` | OPEN, IN_REVIEW, RESOLVED, REJECTED |
| `CouponType` | FIXED, PERCENT |

## 엔티티

### 사용자·인증

| 모델 | 주요 필드 | 비고 |
| --- | --- | --- |
| `User` | email(unique, 소문자 정규화), passwordHash?, emailVerifiedAt?, role, status, deletedAt? | 소셜 전용 계정은 passwordHash null |
| `Profile` | userId(PK·FK), nickname(unique), bio, avatarKey, region, ratingAvg, ratingCount, tradeCount | 1:1 |
| `SocialAccount` | provider, providerUserId, userId | unique(provider, providerUserId) |
| `Session` | userId, refreshTokenHash(unique), familyId, deviceName, platform(web/ios/android), ip, userAgent, lastUsedAt, expiresAt, revokedAt? | 기기 관리 = 세션 목록 |
| `VerificationCode` | email, purpose(SIGNUP/RESET_PASSWORD/DELETE_ACCOUNT), codeHash, attempts, expiresAt, consumedAt? | 6자리 OTP, 10분, 5회 |
| `PushToken` | userId, token(unique), platform(expo/web) | |
| `Follow` | followerId, followingId | PK(followerId, followingId) |
| `Seller` | userId(PK), businessName?, bankName, bankAccountMasked, bankAccountEnc, verifiedAt? | 정산 계좌 암호화 저장 |
| `Address` | userId, recipient, phone, zipCode, address1, address2, memo, isDefault | |

### 카탈로그

| 모델 | 주요 필드 | 비고 |
| --- | --- | --- |
| `Category` | slug(unique), name, parentId?, group(ART/HISTORICAL/COLLECTIBLES), sortOrder, isActive | 관리자 편집 |
| `Artist` | name, nameEn?, birthYear?, deathYear?, nationality?, bio | 이름 trigram 인덱스 |
| `Product` | sellerId, categoryId, artistId?, title, description, maker?, brand?, era?, productionYear?, material?, widthCm?, heightCm?, depthCm?, condition, conditionNote?, region?, saleType, status, price?, stock(기본 1), shippingFee, shippingMethod, returnPolicy, availableAt?(예약 판매 시작), viewCount, favoriteCount, verificationStatus, publishedAt?, deletedAt? | FIXED/RESERVATION 은 price 필수 |
| `ProductImage` | productId, key, width, height, dominantColor, sortOrder | 최대 20장 |
| `Certificate` | productId(unique), issuer, number, issuedAt?, imageKey?, authenticityNote, verificationStatus, reviewedById?, reviewedAt? | **판매자 제공 정보**. 플랫폼 검수 여부는 verificationStatus 로 분리 표기 |
| `Provenance` | productId, kind(OWNERSHIP/EXHIBITION/PUBLICATION), period, title, description, sortOrder | 이력 여러 건 |
| `Favorite` | userId, productId | PK(userId, productId) |
| `RecentView` | userId, productId, viewedAt | PK(userId, productId) |
| `Inquiry` | productId, userId, question, answer?, answeredAt?, isPrivate | 상품 문의 |

인덱스: `Product(status, publishedAt desc)`, `Product(categoryId, status)`, `Product(sellerId, status)`, `Product(price)`, `Product.title` GIN trigram.

### 경매

| 모델 | 주요 필드 | 비고 |
| --- | --- | --- |
| `Auction` | productId(unique), sellerId, status, startPrice, bidIncrement, buyNowPrice?, currentPrice, highestBidId?, highestBidderId?, bidCount, bidderCount, startsAt, endsAt, originalEndsAt, autoExtend, extensionWindowSec, extensionSec, maxEndsAt, version, result, endedAt?, winnerId?, endingSoonNotifiedAt? | 행 잠금 대상 |
| `AuctionBid` | auctionId, bidderId, amount, idempotencyKey, isBuyNow, createdAt | unique(auctionId, amount), unique(bidderId, idempotencyKey) |
| `AuctionPolicy` | id='default', extensionWindowSec(30), extensionSec(30), maxExtensionSec(1800), paymentDueHours(72), minDurationMin(10), maxDurationDays(14), endingSoonMin(10) | 관리자 설정 싱글톤 |

CHECK 제약:
- `"currentPrice" >= "startPrice"`, `"bidIncrement" > 0`, `"endsAt" > "startsAt"`, `"buyNowPrice" IS NULL OR "buyNowPrice" > "startPrice"`
- `AuctionBid.amount > 0`

인덱스: `Auction(status, endsAt)`, `Auction(status, startsAt)`, `AuctionBid(auctionId, createdAt desc)`, `AuctionBid(bidderId, createdAt desc)`.

### 주문·결제·배송·정산

| 모델 | 주요 필드 | 비고 |
| --- | --- | --- |
| `CartItem` | userId, productId, quantity | unique(userId, productId). FIXED 상품만 |
| `Order` | orderNumber(unique), buyerId, sellerId, source, auctionId?(unique), status, itemsAmount, shippingFee, discountAmount, totalAmount, couponId?, paymentDueAt?, shippingAddress(json 스냅샷), paidAt?, cancelledAt?, cancelReason?, completedAt? | 판매자별 1주문 |
| `OrderItem` | orderId, productId, titleSnapshot, imageKeySnapshot, unitPrice, quantity | 구매 시점 스냅샷 |
| `OrderStatusLog` | orderId, from, to, actorId?, reason | 상태 변경 이력 |
| `Payment` | orderId, provider, providerPaymentKey?(unique), method, amount, status, approvedAt?, cancelledAmount, failureCode?, raw(json) | 금액은 서버에서 주문 금액과 대조 |
| `Refund` | paymentId, amount, reason, createdAt | |
| `Shipment` | orderId(unique), carrier, trackingNumber?, status, shippedAt?, deliveredAt? | |
| `Settlement` | sellerId, orderId(unique), grossAmount, feeAmount, netAmount, status, scheduledAt, paidAt? | 수수료율 설정값 |
| `Coupon` | code(unique), name, type, value, minOrderAmount, maxDiscount?, startsAt, endsAt, usageLimit?, usedCount, isActive | |
| `CouponRedemption` | couponId, userId, orderId | unique(couponId, userId) |

### 커뮤니티

| 모델 | 주요 필드 | 비고 |
| --- | --- | --- |
| `ChatRoom` | productId?, buyerId, sellerId, lastMessageAt | unique(productId, buyerId, sellerId) |
| `ChatMessage` | roomId, senderId, kind(TEXT/IMAGE/PRODUCT), body?, imageKey?, productId?, createdAt, deletedAt? | |
| `ChatReadState` | roomId, userId, lastReadAt | PK(roomId, userId) |
| `Review` | orderId, authorId, targetUserId, direction(BUYER_TO_SELLER/SELLER_TO_BUYER), rating(1..5), comment, imageKeys[], deletedAt? | unique(orderId, authorId) |
| `Notification` | userId, type, title, body, link, data(json), readAt? | 인덱스(userId, createdAt desc) |

### 운영

| 모델 | 주요 필드 | 비고 |
| --- | --- | --- |
| `Report` | reporterId, targetType, targetId, reason, detail, status, handledById?, resolution? | unique(reporterId, targetType, targetId) |
| `Banner` | title, imageKey, link, placement, sortOrder, startsAt, endsAt, isActive | |
| `Notice` | title, body, isPinned, publishedAt | |
| `AuditLog` | actorId?, action, targetType, targetId, before?, after?, ip, createdAt | append-only |

`Admin` 은 별도 테이블 없이 `User.role ∈ {ADMIN, SUPER_ADMIN}` 으로 표현한다.

## 마이그레이션 정책

- `prisma migrate dev` 로 생성하며, 커밋된 migration SQL 은 이후 수정하지 않는다.
- Prisma 가 표현하지 못하는 것(CHECK, pg_trgm 확장/GIN 인덱스)은 생성된 migration SQL 에 수동 추가.
- 운영 적용은 `prisma migrate deploy`.

## 시드

`pnpm --filter @shop/api db:seed` — 카테고리 전체 트리, 기본 AuctionPolicy, 관리자, 데모 판매자/작가/상품/경매. 시드 계정은 개발 전용이며 `apps/api/prisma/seed.ts` 에 정의.

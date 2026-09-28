# API

NestJS REST API. Base URL `/api/v1`. 모든 요청/응답은 JSON (업로드 제외). 스키마는 `packages/shared` 의 zod 로 정의하고 서버(검증)·클라이언트(타입/폼)가 공유한다.

## 규약

### 응답 포맷

성공: 리소스를 그대로 반환한다. 목록은 커서 페이지네이션.

```json
{ "items": [], "nextCursor": "c_abc" }
```

실패: 항상 아래 형태. `message` 는 사용자에게 그대로 보여줘도 되는 한국어 문장이다.

```json
{
  "error": {
    "code": "BID_TOO_LOW",
    "message": "최소 입찰가는 1,050,000원입니다.",
    "details": { "minAmount": 1050000 }
  }
}
```

- 5xx 는 `code: "INTERNAL"`, `message: "잠시 문제가 발생했습니다. 다시 시도해주세요."` 로 고정. 스택·쿼리·경로는 응답에 넣지 않고 서버 로그(requestId 포함)에만 남긴다.
- 모든 응답에 `x-request-id` 헤더.

### 인증

- `Authorization: Bearer <accessToken>` (JWT, 15분).
- Refresh: Web 은 `httpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` 쿠키 `rt`, Mobile 은 본문 `refreshToken`.
- 쿠키 기반 요청(`/auth/refresh`, `/auth/logout`)은 `Origin` 허용 목록 검사 + `X-Requested-With: shop` 헤더 필수 (CSRF 방어).

### 페이지네이션

`?cursor=&limit=` (기본 24, 최대 60). 커서는 `(sortValue, id)` 를 base64url 로 인코딩한 불투명 문자열.

### 금액

요청/응답 모두 정수(원). 소수·문자열 금액은 400.

### Rate Limit (Redis 고정 창)

| 대상      | 제한                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| 전역 IP   | 300 req / min                                                                                                        |
| 로그인    | IP 20/min, 계정 실패 10회/15분 → 15분 잠금                                                                           |
| OTP 발송  | 이메일당 5/시간, 60초 간격                                                                                           |
| 입찰      | 사용자당 10/10s                                                                                                      |
| 업로드    | 사용자당 60/min                                                                                                      |
| 채팅 전송 | 사용자당 30/10s (요청) · 도배: 8개/10s `CHAT_TOO_FAST`, 같은 글 30s 에 2번 `CHAT_DUPLICATE` (clientId 재시도는 제외) |

초과 시 429 `RATE_LIMITED`.

## 엔드포인트

권한: `-` 공개, `U` 로그인, `S` 판매자(본인 소유), `A` ADMIN 이상, `SA` SUPER_ADMIN.

### Auth

| Method | Path                           | 권한 | 설명                                                             |
| ------ | ------------------------------ | ---- | ---------------------------------------------------------------- |
| POST   | /auth/email/send-code          | -    | {email, purpose} OTP 발송 (SIGNUP/RESET_PASSWORD/DELETE_ACCOUNT) |
| POST   | /auth/email/verify-code        | -    | {email, purpose, code} → {verificationToken} (10분 유효)         |
| POST   | /auth/signup                   | -    | {verificationToken, password, nickname, device} → 토큰 쌍        |
| POST   | /auth/login                    | -    | {email, password, device} → 토큰 쌍                              |
| POST   | /auth/refresh                  | -    | 쿠키 또는 {refreshToken} → 회전된 토큰 쌍                        |
| POST   | /auth/logout                   | -    | 현재 세션 폐기                                                   |
| POST   | /auth/password/reset           | -    | {verificationToken, newPassword} → 전체 세션 폐기                |
| POST   | /auth/password/change          | U    | {currentPassword, newPassword}                                   |
| GET    | /auth/oauth/:provider/url      | -    | ?redirectUri → {url, state} (google/apple/kakao/naver)           |
| POST   | /auth/oauth/:provider/callback | -    | {code, state, redirectUri, device} → 토큰 쌍                     |
| GET    | /auth/sessions                 | U    | 기기(세션) 목록                                                  |
| DELETE | /auth/sessions/:id             | U    | 특정 기기 로그아웃                                               |
| DELETE | /auth/sessions                 | U    | 현재 기기 제외 전체 로그아웃                                     |
| DELETE | /auth/account                  | U    | {password 또는 verificationToken} 탈퇴 (개인정보 익명화)         |
| GET    | /auth/me                       | U    | 내 계정 + 프로필 + 역할                                          |

### Users / Profile

| Method                | Path                                            | 권한 | 설명                                                 |
| --------------------- | ----------------------------------------------- | ---- | ---------------------------------------------------- |
| GET                   | /users/:id                                      | -    | 공개 프로필 (닉네임, 소개, 신뢰도, 팔로워/팔로잉 수) |
| PATCH                 | /users/me/profile                               | U    | 닉네임/소개/아바타/지역                              |
| GET                   | /users/:id/products                             | -    | 판매 상품                                            |
| GET                   | /users/:id/reviews                              | -    | 받은 리뷰                                            |
| POST/DELETE           | /users/:id/follow                               | U    | 팔로우/언팔로우                                      |
| GET                   | /users/:id/followers · /following               | -    |                                                      |
| GET                   | /me/purchases · /me/sales · /me/bids · /me/wins | U    | 구매/판매/입찰/낙찰 기록                             |
| GET/POST/PATCH/DELETE | /me/addresses                                   | U    | 배송지                                               |
| POST                  | /me/seller                                      | U    | 판매자 등록 (정산 계좌) → role SELLER                |
| POST/DELETE           | /me/push-tokens                                 | U    | 푸시 토큰                                            |

### Catalog

| Method | Path             | 권한 | 설명                                                                                    |
| ------ | ---------------- | ---- | --------------------------------------------------------------------------------------- |
| GET    | /categories      | -    | 트리 + 공개 작품 수(`productCount`, 대분류는 합계)·대표 이미지(`coverImage`) (캐시 60s) |
| GET    | /artists?q=      | -    | 작가 검색                                                                               |
| GET    | /artists/popular | -    | 인기 작가                                                                               |
| GET    | /artists/:id     | -    | 작가 + 작품                                                                             |

### Products

| Method      | Path                                     | 권한 | 설명                                                               |
| ----------- | ---------------------------------------- | ---- | ------------------------------------------------------------------ |
| GET         | /home                                    | -    | 홈 섹션 묶음 (배너, 인기, 오늘의 경매, 마감 임박, 신규, 인기 작가) |
| GET         | /products                                | -    | 검색/필터/정렬                                                     |
| GET         | /products/suggest?q=                     | -    | 자동완성 {products, artists, categories}                           |
| GET         | /products/:id                            | -    | 상세 (이미지, 판매자 요약, 인증서, 출처, 경매 요약)                |
| POST        | /products                                | S    | 생성                                                               |
| PATCH       | /products/:id                            | S    | 수정 (판매 완료·경매 진행 중엔 가격/판매방식 변경 불가)            |
| POST        | /products/:id/publish · /pause · /resume | S    | 게시 / 판매 중지 / 재개                                            |
| DELETE      | /products/:id                            | S    | 삭제 (진행 중 주문·경매 있으면 409)                                |
| POST        | /products/:id/view                       | -    | 조회 기록 (로그인 시 최근 본 상품)                                 |
| GET/POST    | /products/:id/inquiries                  | -/U  | 문의 목록/작성                                                     |
| POST        | /inquiries/:id/answer                    | S    | 답변                                                               |
| POST/DELETE | /products/:id/favorite                   | U    | 관심상품                                                           |
| GET         | /me/favorites · /me/recent               | U    | 관심 / 최근 본                                                     |

`GET /products` 쿼리:

| 파라미터                              | 설명                                                                |
| ------------------------------------- | ------------------------------------------------------------------- |
| `q`                                   | 상품명·작가·제작자·브랜드·시대·소재·판매자                          |
| `category`                            | slug (하위 포함)                                                    |
| `minPrice`,`maxPrice`                 | 원 (경매는 currentPrice 기준)                                       |
| `saleType`                            | FIXED,AUCTION,RESERVATION (복수)                                    |
| `artist`                              | artistId                                                            |
| `yearFrom`,`yearTo`                   | 제작연도                                                            |
| `era`,`material`,`condition`,`region` | 복수 가능 (콤마)                                                    |
| `auctionOnly`                         | true                                                                |
| `verifiedOnly`                        | 검수 완료 인증서만                                                  |
| `sort`                                | relevance · latest · price_asc · price_desc · popular · ending_soon |

### Media

| Method | Path          | 권한 | 설명                                                         |
| ------ | ------------- | ---- | ------------------------------------------------------------ |
| POST   | /media/images | U    | multipart `file` → {key, width, height, dominantColor, urls} |

### Auctions

| Method | Path                   | 권한 | 설명                                                                                      |
| ------ | ---------------------- | ---- | ----------------------------------------------------------------------------------------- |
| POST   | /auctions              | S    | {productId, startPrice, bidIncrement, buyNowPrice?, startsAt, endsAt, autoExtend} → DRAFT |
| PATCH  | /auctions/:id          | S    | DRAFT/SCHEDULED 에서만                                                                    |
| POST   | /auctions/:id/schedule | S    | DRAFT → SCHEDULED                                                                         |
| POST   | /auctions/:id/cancel   | S/A  | 판매자: DRAFT/SCHEDULED, 관리자: SETTLED 이전 전부                                        |
| GET    | /auctions              | -    | status, sort(ending_soon/popular/latest)                                                  |
| GET    | /auctions/:id          | -    | 스냅샷 {auction, serverTime, myLastBid?}                                                  |
| GET    | /auctions/:id/bids     | -    | 입찰 기록 (닉네임 마스킹)                                                                 |
| POST   | /auctions/:id/bids     | U    | {amount, idempotencyKey}                                                                  |
| POST   | /auctions/:id/buy-now  | U    | {idempotencyKey}                                                                          |
| GET    | /time                  | -    | {serverTime}                                                                              |

입찰 에러 코드: `AUCTION_NOT_LIVE`, `AUCTION_ENDED`, `BID_TOO_LOW`, `BID_NOT_ALIGNED`, `SELF_BID`, `ALREADY_HIGHEST`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_RESTRICTED`, `BUY_NOW_UNAVAILABLE`. 같은 `idempotencyKey` 재요청은 이전 결과를 그대로 반환한다.

### Addresses / Cart / Orders / Payments / Shipping

| Method       | Path                                | 권한        | 설명                                                                                                 |
| ------------ | ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| GET/POST     | /me/addresses                       | U           | 배송지 (최대 20개, 첫 배송지는 기본)                                                                 |
| PATCH/DELETE | /me/addresses/:id                   | U           | 수정(전체 값) / 삭제 (기본 배송지를 지우면 최근 배송지가 기본)                                       |
| GET          | /cart                               | U           | 장바구니 (+ 지금 주문 가능 여부 `available`)                                                         |
| PUT/DELETE   | /cart/:productId                    | U           | 담기(수량)/빼기 · `DELETE /cart` 비우기                                                              |
| POST         | /orders/quote                       | U           | {items, couponCode?} → 금액 미리보기 (주문 생성 없음)                                                |
| POST         | /orders                             | U           | {items, addressId, couponCode?, fromCart?} → **한 판매자** 주문, 상품 잠금·재고 예약, 결제 기한 30분 |
| GET          | /orders · /orders/summary           | U           | 구매 내역 (`filter` all·pending·progress·done·cancelled) / 상태별 건수                               |
| GET          | /orders/:id                         | U(당사자)/A | 상세 + 결제·배송·상태 로그                                                                           |
| POST         | /orders/:id/payments                | U           | {method, addressId?} → {paymentId, provider(toss·mock), clientKey, amount, orderName, dueAt}         |
| POST         | /payments/confirm                   | U           | {paymentId, paymentKey, amount} → **서버가 주문 금액과 대조 후** PG 승인 (멱등)                      |
| POST         | /payments/webhook/toss              | -           | PG 웹훅 — 본문을 믿지 않고 PG 재조회로 반영 (가상계좌 입금 포함)                                     |
| POST         | /payments/:id/mock-deposit          | U           | 개발 전용 모의 가상계좌 입금 (운영 404)                                                              |
| POST         | /orders/:id/cancel                  | U/S/A       | 결제 전 취소 / 발송 전 취소 → 전액 환불 (낙찰 주문 결제 전 구매자 취소는 미결제로 기록)              |
| POST         | /orders/:id/prepare                 | S/A         | PAID → PREPARING                                                                                     |
| POST · PATCH | /orders/:id/ship · /shipment        | S/A         | {carrier, trackingNumber} → SHIPPED / 송장 정정                                                      |
| POST         | /orders/:id/deliver                 | S/A         | → DELIVERED (발송 14일 후 자동)                                                                      |
| POST         | /orders/:id/confirm                 | U           | 구매 확정 → COMPLETED + 정산 예정 (배송 완료 7일 후 자동)                                            |
| POST         | /orders/:id/refund-request          | U           | {reason} DELIVERED → REFUND_REQUESTED                                                                |
| POST         | /orders/:id/refund · /refund-reject | S/A         | 환불 승인(PG 환불, 작품은 판매 중지) / 거절 {reason} → DELIVERED                                     |

결제 금액은 항상 서버 주문 금액이며 쿠폰 할인은 플랫폼이 부담한다(판매 수수료 8%는 상품 금액 기준). 결제 완료가 주문 취소 뒤에 도착하면 자동 환불한다.
결제 에러 코드: `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_EXPIRED`, `PAYMENT_FAILED`, `PAYMENT_NOT_CONFIGURED`, `REFUND_FAILED`, `OUT_OF_STOCK`, `NOT_FOR_SALE`, `SELF_PURCHASE`, `MULTI_SELLER_ORDER`, `ADDRESS_REQUIRED`, `COUPON_*`.

### Seller

| Method | Path                                                 | 권한 | 설명                                             |
| ------ | ---------------------------------------------------- | ---- | ------------------------------------------------ |
| GET    | /seller/products · /seller/auctions · /seller/orders | S    | 관리 목록 (`/seller/orders/summary` 상태별 건수) |
| GET    | /seller/stats                                        | S    | 기간별 매출·주문 수·조회수·관심 수               |
| GET    | /seller/settlements                                  | S    | 정산 내역                                        |

### Chat · 차단 · 신고

| Method      | Path                                | 권한      | 설명                                                                                                                                                                                                                                                                  |
| ----------- | ----------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST        | /chat/rooms                         | U         | {productId} 방 생성/재사용 (본인 작품·차단 관계 불가)                                                                                                                                                                                                                 |
| GET         | /chat/rooms · /chat/rooms/:id       | U(참여자) | 목록(최근 100, 안 읽은 수·마지막 메시지·상대 읽음 시각·차단 여부) / 단건                                                                                                                                                                                              |
| GET         | /chat/unread-count                  | U         | 전체 안 읽은 수 (알림 끈 방 제외)                                                                                                                                                                                                                                     |
| GET         | /chat/rooms/:id/messages            | U(참여자) | 최신순 50개, `before` 커서. 나간 뒤에는 그 이후 메시지만                                                                                                                                                                                                              |
| POST        | /chat/rooms/:id/messages            | U(참여자) | {kind: TEXT·IMAGE·PRODUCT·APPOINTMENT, body?, imageKeys?(≤10), productId?, appointment?, clientId?, replyToId?} — clientId 재전송은 같은 메시지 반환, 외부 거래 유도 문구는 `warning`, 답장은 같은 방의 지워지지 않은 메시지만 (`replyTo` 요약, 원문 삭제 시 deleted) |
| DELETE      | /chat/rooms/:id/messages/:messageId | U(보낸이) | "삭제된 메시지"로 표시                                                                                                                                                                                                                                                |
| POST        | /chat/rooms/:id/read · /leave       | U(참여자) | 읽음(상대에게 `CHAT_READ`) / 나가기(새 메시지 오면 다시 보임)                                                                                                                                                                                                         |
| PATCH       | /chat/rooms/:id                     | U(참여자) | {muted} 알림 끄기                                                                                                                                                                                                                                                     |
| PATCH       | /chat/rooms/:id/trade               | U(판매자) | {status: ACTIVE·RESERVED·SOLD} 채팅에서 거래 상태 변경 (경매·주문 걸린 작품은 `INVALID_TRANSITION`). 방에 SYSTEM 메시지 `TRADE_*`                                                                                                                                     |
| GET · PUT   | /chat/phrases                       | U         | 자주 쓰는 문구 {phrases: string[]} — 최대 20개·각 100자, 공백·중복 정리. 저장한 적 없으면 기본 문구                                                                                                                                                                   |
| —           | (SYSTEM 메시지)                     | —         | 주문 상태 전환 시 그 작품의 구매자·판매자 방에 `ORDER_PAID`·`ORDER_SHIPPED`·`ORDER_DELIVERED`·`ORDER_COMPLETED`·`ORDER_CANCELLED`·`ORDER_REFUND_REQUESTED`·`ORDER_REFUNDED` (`system {event, orderId}`)                                                               |
| POST/DELETE | /users/:id/block                    | U         | 차단/해제 — 차단 관계에서는 채팅 생성·전송 불가                                                                                                                                                                                                                       |
| GET         | /me/blocks · /me/reports            | U         | 차단 목록 / 내 신고 내역                                                                                                                                                                                                                                              |

### Reviews / Notifications / Reports

| Method      | Path                                | 권한      | 설명                                                                               |
| ----------- | ----------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| POST        | /orders/:id/reviews                 | U         | COMPLETED 주문 당사자, 1회                                                         |
| DELETE      | /reviews/:id                        | U(작성자) |                                                                                    |
| GET         | /notifications                      | U         | 커서 (30개)                                                                        |
| POST        | /notifications/read                 | U         | {ids} 또는 {all:true} → {unreadCount}                                              |
| GET         | /notifications/unread-count         | U         |                                                                                    |
| DELETE      | /notifications/:id · /notifications | U         | 한 건 삭제 / 읽은 알림 모두 삭제                                                   |
| GET/PUT     | /me/notification-settings           | U         | {push:{auction,trade,chat,activity}, quietHours} — 방해 금지 21~8시(KST) 푸시 보류 |
| POST/DELETE | /me/push-tokens                     | U         | {token, platform: expo·web} 등록(기기당 한 계정)·해제                              |
| GET         | /notifications/push-config          | -         | {vapidPublicKey} (웹 푸시 구독용, 미설정 시 null)                                  |
| POST        | /reports                            | U         | {targetType, targetId, reason, detail}                                             |

### Admin (`/admin/*`, ADMIN·SUPER_ADMIN, 모든 변경은 AuditLog 기록)

목록은 `?page=&size=&q=` 페이지 방식 → `{items, total, page, size}`. 조치에는 `{reason}` 이 필요하다.

| 경로                              | 기능                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET /admin/dashboard              | 회원·판매자·작품·경매·주문·거래액(오늘/30일)·처리 대기(환불 요청·신고·미결제)·정산 예정/보류 + 14일 추이                                                           |
| /admin/users · /users/:id         | 검색(이메일·닉네임·ID, 역할·상태), 상세, suspend(모든 기기 로그아웃, 로그인 시 사유 안내)·restore, PATCH role(관리자 부여·관리자 대상 조치는 SA 만), reset-strikes |
| /admin/sellers                    | 인증 대기/완료 필터, verify·unverify (VERIFIED_SELLER)                                                                                                             |
| /admin/products                   | 검색·상태·검수 필터·미처리 신고 수, hide(SUSPENDED)·restore, DELETE(진행 중 주문 있으면 거부), certificate 검수                                                    |
| /admin/categories                 | CRUD (2단계, slug 중복·작품/하위 있으면 삭제 거부)                                                                                                                 |
| /admin/auctions · /auction-policy | 목록·강제 취소 / 연장·결제 기한·기간 정책                                                                                                                          |
| /admin/orders · /orders/:id       | 검색, 상세, refund: 결제 전후 취소·환불 승인, 배송 이후·구매 확정 분쟁은 강제 환불 + 정산 보류                                                                     |
| /admin/payments                   | 결제 내역 (상태·수단 필터)                                                                                                                                         |
| /admin/settlements · /actions     | 목록, 일괄 pay·hold·release                                                                                                                                        |
| /admin/coupons                    | CRUD (사용된 쿠폰은 코드·방식·금액 변경 불가, 삭제 대신 비활성화)                                                                                                  |
| /admin/reports · /:id/resolve     | 대상 미리보기·누적 수, 처리 + 조치(작품 비공개·회원 정지·메시지/후기 삭제), 같은 대상 신고 일괄 종료                                                               |
| /admin/banners · /notices         | CRUD (배너 링크는 사이트 내부 경로만, 공지는 예약 게시)                                                                                                            |
| POST /admin/broadcast             | 전체/판매자/구매자 운영 알림 (알림함 + 푸시)                                                                                                                       |
| GET /admin/audit-logs             | 감사 로그 (대상 유형·관리자 필터)                                                                                                                                  |

공개: `GET /notices` (고정 먼저, 게시일 지난 것만) · `GET /notices/:id`.

## WebSocket (Socket.IO, namespace `/rt`)

연결: `io(API_ORIGIN + "/rt", { auth: { token } })`. 토큰 없이도 연결 가능 (경매 관전). 토큰이 유효하지 않으면 익명으로 취급한다.

| 방향 | 이벤트                           | payload                                                                                                                 |
| ---- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| C→S  | `auction:join` / `auction:leave` | {auctionId} → ack {snapshot, serverTime}                                                                                |
| C→S  | `chat:join`                      | {roomId} (참여자 검증)                                                                                                  |
| C→S  | `time:sync`                      | ack {serverTime}                                                                                                        |
| S→C  | `AUCTION_BID`                    | {auctionId, seq, bid:{id, amount, bidderMasked, createdAt}}                                                             |
| S→C  | `AUCTION_PRICE_UPDATED`          | {auctionId, seq, currentPrice, minNextBid, bidCount, bidderCount, highestBidderId}                                      |
| S→C  | `AUCTION_TIMER_UPDATED`          | {auctionId, seq, endsAt, serverTime}                                                                                    |
| S→C  | `AUCTION_EXTENDED`               | {auctionId, seq, endsAt, extendedBySec}                                                                                 |
| S→C  | `AUCTION_STARTED`                | {auctionId, seq, status}                                                                                                |
| S→C  | `AUCTION_ENDED`                  | {auctionId, seq, result, winnerId, finalPrice}                                                                          |
| S→C  | `CHAT_MESSAGE`                   | {roomId, message}                                                                                                       |
| S→C  | `CHAT_READ`                      | {roomId, userId, lastReadAt}                                                                                            |
| S→C  | `NOTIFICATION`                   | {notification, unreadCount} (room `user:{id}`) — 상위 입찰·종료 임박·낙찰/유찰·경매 시작(관심)·주문 상태·문의·가격 인하 |
| S→C  | `ORDER_STATUS_UPDATED`           | {orderId, status} (room `user:{id}`)                                                                                    |

`seq` = `Auction.version`. 클라이언트는 `seq` 가 건너뛰면 `GET /auctions/:id` 로 재동기화한다. 재연결 시 룸 재가입 + 스냅샷 재조회는 항상 수행한다.

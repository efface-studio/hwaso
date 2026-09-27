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
{ "error": { "code": "BID_TOO_LOW", "message": "최소 입찰가는 1,050,000원입니다.", "details": { "minAmount": 1050000 } } }
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

| 대상 | 제한 |
| --- | --- |
| 전역 IP | 300 req / min |
| 로그인 | IP 20/min, 계정 실패 10회/15분 → 15분 잠금 |
| OTP 발송 | 이메일당 5/시간, 60초 간격 |
| 입찰 | 사용자당 10/10s |
| 업로드 | 사용자당 60/min |
| 채팅 전송 | 사용자당 30/10s |

초과 시 429 `RATE_LIMITED`.

## 엔드포인트

권한: `-` 공개, `U` 로그인, `S` 판매자(본인 소유), `A` ADMIN 이상, `SA` SUPER_ADMIN.

### Auth

| Method | Path | 권한 | 설명 |
| --- | --- | --- | --- |
| POST | /auth/email/send-code | - | {email, purpose} OTP 발송 (SIGNUP/RESET_PASSWORD/DELETE_ACCOUNT) |
| POST | /auth/email/verify-code | - | {email, purpose, code} → {verificationToken} (10분 유효) |
| POST | /auth/signup | - | {verificationToken, password, nickname, device} → 토큰 쌍 |
| POST | /auth/login | - | {email, password, device} → 토큰 쌍 |
| POST | /auth/refresh | - | 쿠키 또는 {refreshToken} → 회전된 토큰 쌍 |
| POST | /auth/logout | - | 현재 세션 폐기 |
| POST | /auth/password/reset | - | {verificationToken, newPassword} → 전체 세션 폐기 |
| POST | /auth/password/change | U | {currentPassword, newPassword} |
| GET | /auth/oauth/:provider/url | - | ?redirectUri → {url, state} (google/apple/kakao/naver) |
| POST | /auth/oauth/:provider/callback | - | {code, state, redirectUri, device} → 토큰 쌍 |
| GET | /auth/sessions | U | 기기(세션) 목록 |
| DELETE | /auth/sessions/:id | U | 특정 기기 로그아웃 |
| DELETE | /auth/sessions | U | 현재 기기 제외 전체 로그아웃 |
| DELETE | /auth/account | U | {password 또는 verificationToken} 탈퇴 (개인정보 익명화) |
| GET | /auth/me | U | 내 계정 + 프로필 + 역할 |

### Users / Profile

| Method | Path | 권한 | 설명 |
| --- | --- | --- | --- |
| GET | /users/:id | - | 공개 프로필 (닉네임, 소개, 신뢰도, 팔로워/팔로잉 수) |
| PATCH | /users/me/profile | U | 닉네임/소개/아바타/지역 |
| GET | /users/:id/products | - | 판매 상품 |
| GET | /users/:id/reviews | - | 받은 리뷰 |
| POST/DELETE | /users/:id/follow | U | 팔로우/언팔로우 |
| GET | /users/:id/followers · /following | - | |
| GET | /me/purchases · /me/sales · /me/bids · /me/wins | U | 구매/판매/입찰/낙찰 기록 |
| GET/POST/PATCH/DELETE | /me/addresses | U | 배송지 |
| POST | /me/seller | U | 판매자 등록 (정산 계좌) → role SELLER |
| POST/DELETE | /me/push-tokens | U | 푸시 토큰 |

### Catalog

| Method | Path | 권한 | 설명 |
| --- | --- | --- | --- |
| GET | /categories | - | 트리 (캐시 60s) |
| GET | /artists?q= | - | 작가 검색 |
| GET | /artists/popular | - | 인기 작가 |
| GET | /artists/:id | - | 작가 + 작품 |

### Products

| Method | Path | 권한 | 설명 |
| --- | --- | --- | --- |
| GET | /home | - | 홈 섹션 묶음 (배너, 인기, 오늘의 경매, 마감 임박, 신규, 인기 작가) |
| GET | /products | - | 검색/필터/정렬 |
| GET | /products/suggest?q= | - | 자동완성 {products, artists, categories} |
| GET | /products/:id | - | 상세 (이미지, 판매자 요약, 인증서, 출처, 경매 요약) |
| POST | /products | S | 생성 |
| PATCH | /products/:id | S | 수정 (판매 완료·경매 진행 중엔 가격/판매방식 변경 불가) |
| POST | /products/:id/publish · /pause · /resume | S | 게시 / 판매 중지 / 재개 |
| DELETE | /products/:id | S | 삭제 (진행 중 주문·경매 있으면 409) |
| POST | /products/:id/view | - | 조회 기록 (로그인 시 최근 본 상품) |
| GET/POST | /products/:id/inquiries | -/U | 문의 목록/작성 |
| POST | /inquiries/:id/answer | S | 답변 |
| POST/DELETE | /products/:id/favorite | U | 관심상품 |
| GET | /me/favorites · /me/recent | U | 관심 / 최근 본 |

`GET /products` 쿼리:

| 파라미터 | 설명 |
| --- | --- |
| `q` | 상품명·작가·제작자·브랜드·시대·소재·판매자 |
| `category` | slug (하위 포함) |
| `minPrice`,`maxPrice` | 원 (경매는 currentPrice 기준) |
| `saleType` | FIXED,AUCTION,RESERVATION (복수) |
| `artist` | artistId |
| `yearFrom`,`yearTo` | 제작연도 |
| `era`,`material`,`condition`,`region` | 복수 가능 (콤마) |
| `auctionOnly` | true |
| `verifiedOnly` | 검수 완료 인증서만 |
| `sort` | relevance · latest · price_asc · price_desc · popular · ending_soon |

### Media

| Method | Path | 권한 | 설명 |
| --- | --- | --- | --- |
| POST | /media/images | U | multipart `file` → {key, width, height, dominantColor, urls} |

### Auctions

| Method | Path | 권한 | 설명 |
| --- | --- | --- | --- |
| POST | /auctions | S | {productId, startPrice, bidIncrement, buyNowPrice?, startsAt, endsAt, autoExtend} → DRAFT |
| PATCH | /auctions/:id | S | DRAFT/SCHEDULED 에서만 |
| POST | /auctions/:id/schedule | S | DRAFT → SCHEDULED |
| POST | /auctions/:id/cancel | S/A | 판매자: DRAFT/SCHEDULED, 관리자: SETTLED 이전 전부 |
| GET | /auctions | - | status, sort(ending_soon/popular/latest) |
| GET | /auctions/:id | - | 스냅샷 {auction, serverTime, myLastBid?} |
| GET | /auctions/:id/bids | - | 입찰 기록 (닉네임 마스킹) |
| POST | /auctions/:id/bids | U | {amount, idempotencyKey} |
| POST | /auctions/:id/buy-now | U | {idempotencyKey} |
| GET | /time | - | {serverTime} |

입찰 에러 코드: `AUCTION_NOT_LIVE`, `AUCTION_ENDED`, `BID_TOO_LOW`, `BID_NOT_ALIGNED`, `SELF_BID`, `ALREADY_HIGHEST`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_RESTRICTED`, `BUY_NOW_UNAVAILABLE`. 같은 `idempotencyKey` 재요청은 이전 결과를 그대로 반환한다.

### Cart / Orders / Payments / Shipping

| Method | Path | 권한 | 설명 |
| --- | --- | --- | --- |
| GET | /cart | U | 장바구니 |
| PUT/DELETE | /cart/:productId | U | 담기(수량)/빼기 |
| POST | /orders | U | {items:[{productId, quantity}], addressId, couponCode?} → 판매자별 주문 (PAYMENT_PENDING, 재고 예약) |
| GET | /orders/:id | U(당사자)/A | 상세 + 상태 로그 |
| POST | /orders/:id/payments | U | {method} → {paymentId, orderNumber, amount, clientKey} |
| POST | /payments/confirm | U | {paymentId, paymentKey, amount} → **서버가 주문 금액과 대조 후** PG 승인 |
| POST | /payments/webhook/:provider | - | PG 웹훅 (PG 재조회로 검증) |
| POST | /orders/:id/cancel | U/S | 결제 전 취소 / 발송 전 취소 → 전액 환불 |
| POST | /orders/:id/refund-request | U | 배송 후 환불 요청 |
| POST | /orders/:id/refund | S/A | 환불 승인 |
| POST | /orders/:id/prepare | S | PAID → PREPARING |
| POST | /orders/:id/ship | S | {carrier, trackingNumber} → SHIPPED |
| POST | /orders/:id/deliver | S/A | → DELIVERED |
| POST | /orders/:id/confirm | U | 구매 확정 → COMPLETED (배송 완료 7일 후 자동) |

### Seller

| Method | Path | 권한 | 설명 |
| --- | --- | --- | --- |
| GET | /seller/products · /seller/auctions · /seller/orders | S | 관리 목록 |
| GET | /seller/stats | S | 기간별 매출·주문 수·조회수·관심 수 |
| GET | /seller/settlements | S | 정산 내역 |

### Chat

| Method | Path | 권한 | 설명 |
| --- | --- | --- | --- |
| POST | /chat/rooms | U | {productId} 방 생성/재사용 |
| GET | /chat/rooms | U | 내 방 목록 (안 읽은 수) |
| GET | /chat/rooms/:id/messages | U(참여자) | 커서 |
| POST | /chat/rooms/:id/messages | U(참여자) | {kind, body?, imageKey?, productId?} |
| POST | /chat/rooms/:id/read | U(참여자) | 읽음 처리 |

### Reviews / Notifications / Reports

| Method | Path | 권한 | 설명 |
| --- | --- | --- | --- |
| POST | /orders/:id/reviews | U | COMPLETED 주문 당사자, 1회 |
| DELETE | /reviews/:id | U(작성자) | |
| GET | /notifications | U | 커서 |
| POST | /notifications/read | U | {ids} 또는 {all:true} |
| GET | /notifications/unread-count | U | |
| POST | /reports | U | {targetType, targetId, reason, detail} |

### Admin (`/admin/*`, 모든 변경은 AuditLog 기록)

| 경로 | 기능 |
| --- | --- |
| /admin/dashboard | 지표 요약 |
| /admin/users | 목록/검색, 정지·해제, 역할 변경 (ADMIN 부여는 SA 만) |
| /admin/sellers | 판매자 인증 (VERIFIED_SELLER) |
| /admin/products | 목록, 숨김/정지, 인증서 검수 |
| /admin/auctions | 목록, 강제 취소 |
| /admin/auction-policy | 연장 정책 조회/수정 |
| /admin/orders | 목록, 상태 변경(사유 필수), 환불 |
| /admin/payments | 결제 내역 |
| /admin/settlements | 정산 목록, 지급 처리 |
| /admin/reports | 신고 목록/처리 |
| /admin/categories | CRUD |
| /admin/banners · /admin/notices · /admin/coupons | CRUD |
| /admin/audit-logs | 조회 |

## WebSocket (Socket.IO, namespace `/rt`)

연결: `io(API_ORIGIN + "/rt", { auth: { token } })`. 토큰 없이도 연결 가능 (경매 관전). 토큰이 유효하지 않으면 익명으로 취급한다.

| 방향 | 이벤트 | payload |
| --- | --- | --- |
| C→S | `auction:join` / `auction:leave` | {auctionId} → ack {snapshot, serverTime} |
| C→S | `chat:join` | {roomId} (참여자 검증) |
| C→S | `time:sync` | ack {serverTime} |
| S→C | `AUCTION_BID` | {auctionId, seq, bid:{id, amount, bidderMasked, createdAt}} |
| S→C | `AUCTION_PRICE_UPDATED` | {auctionId, seq, currentPrice, minNextBid, bidCount, bidderCount, highestBidderId} |
| S→C | `AUCTION_TIMER_UPDATED` | {auctionId, seq, endsAt, serverTime} |
| S→C | `AUCTION_EXTENDED` | {auctionId, seq, endsAt, extendedBySec} |
| S→C | `AUCTION_STARTED` | {auctionId, seq, status} |
| S→C | `AUCTION_ENDED` | {auctionId, seq, result, winnerId, finalPrice} |
| S→C | `CHAT_MESSAGE` | {roomId, message} |
| S→C | `CHAT_READ` | {roomId, userId, lastReadAt} |
| S→C | `NOTIFICATION` | {notification, unreadCount} (room `user:{id}`) |
| S→C | `ORDER_STATUS_UPDATED` | {orderId, status} (room `user:{id}`) |

`seq` = `Auction.version`. 클라이언트는 `seq` 가 건너뛰면 `GET /auctions/:id` 로 재동기화한다. 재연결 시 룸 재가입 + 스냅샷 재조회는 항상 수행한다.

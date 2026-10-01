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
- 로그아웃·원격 로그아웃·비밀번호 변경으로 폐기된 기기의 access 토큰은 만료 전이라도 바로 401 `INVALID_TOKEN`.
- **재인증(step-up)**: 표에 `R` 이 붙은 엔드포인트는 `x-reauth-token: <reauthToken>` 헤더가 추가로 필요하다. `POST /auth/reauth` 로 받은 5분짜리 토큰이며 같은 사용자·같은 기기 세션(family)에서만 유효하다(refresh 회전에도 유지). 없거나 맞지 않으면 **403 `REAUTH_REQUIRED`** — 401 이 아니므로 클라이언트는 토큰 갱신 대신 본인 확인 화면을 띄운다. 기존 확인(현재 비밀번호 등)은 그대로 요구한다. 현재 **앱 세션(ios·android)에만 적용**하고 웹 세션은 제외한다 (docs/SECURITY.md §계정 보안).
- **필수 동의 가드**: `MeDto.consentRequired` 가 true 인 회원(소셜 첫 가입, 약관 동의 기록이 없는 기존 회원)은 로그인이 필요한 쓰기 요청(POST·PUT·PATCH·DELETE)이 `403 CONSENT_REQUIRED`. 예외: `/auth/*`(로그아웃·기기·비밀번호·재인증·생체 키·소셜 연결·탈퇴), `POST /me/consent`, `DELETE /me/push-tokens`, `POST /me/security/integrity`. 읽기(GET)와 공개·선택 인증 엔드포인트는 그대로 쓴다 (docs/AUTH.md §11).
- **금칙어**: 닉네임·소개·지역, 작품 제목·설명, 후기, 문의·답변, 채팅 텍스트에 금칙어가 있으면 `400 PROHIBITED_CONTENT` (`details.fields`). 판단 함수는 `@shop/shared` `containsProhibited` — 클라이언트가 입력 중 같은 함수로 미리 안내한다.
- **차단 필터**: 로그인한 사용자가 차단한 회원의 작품은 목록(`/products`, `/home`, `/auctions`, `/products/:id/related`, `/users/:id/products`, `/me/following/feed`)에서 빠지고, 후기(`/users/:id/reviews`)·문의(`/products/:id/inquiries`)에서도 빠진다. 상세 `/products/:id` 는 열리되 `blockedByMe: true` 로 표시한다.

### 페이지네이션

`?cursor=&limit=` (기본 24, 최대 60). 커서는 `(sortValue, id)` 를 base64url 로 인코딩한 불투명 문자열.

### 금액

요청/응답 모두 정수(원). 소수·문자열 금액은 400.

### Rate Limit (Redis 고정 창)

| 대상        | 제한                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| 전역 IP     | 300 req / min                                                                                                        |
| 로그인      | IP 20/min, 계정 실패 10회/15분 → 15분 잠금                                                                           |
| OTP 발송    | 이메일당 5/시간, 60초 간격                                                                                           |
| 입찰        | 사용자당 10/10s                                                                                                      |
| 업로드      | 사용자당 60/min                                                                                                      |
| 채팅 전송   | 사용자당 30/10s (요청) · 도배: 8개/10s `CHAT_TOO_FAST`, 같은 글 30s 에 2번 `CHAT_DUPLICATE` (clientId 재시도는 제외) |
| 재인증      | 사용자당 10/10min (`/auth/reauth`), 재인증 OTP 발송 사용자당 5/10min + 이메일당 60초 간격·5/시간                     |
| 생체 키     | 등록 사용자당 10/시간                                                                                                |
| 빠른 로그인 | IP 20/min, 자격당 10/10min, 연속 실패 5회면 자격 삭제 · 켜기 사용자당 10/시간                                        |
| 무결성      | 신고 사용자당 30/시간                                                                                                |

초과 시 429 `RATE_LIMITED`.

### 캐시·압축

- **압축**: 1KB 이상 JSON 응답은 `Accept-Encoding` 에 따라 brotli(품질 8) 또는 gzip 으로 보낸다 (`compression`, `Vary: Accept-Encoding`). 이미지 등 압축 불가 타입과 1KB 미만 응답은 그대로 보낸다. 운영(Cloudflare 터널)에서는 오리진→엣지 구간 전송량이 준다 (방문자 구간은 원래도 엣지가 압축했다).
- **ETag**: 모든 GET 응답에 약한 ETag(본문 해시). `If-None-Match` 가 같으면 `304` (본문 없음).
- **HTTP 캐시**: 로그인 여부·사용자와 무관한 공개 GET 만 `Cache-Control: public, max-age=N, stale-while-revalidate=5N` (`@PublicCache`).

  | max-age | 경로                                                                                      |
  | ------- | ----------------------------------------------------------------------------------------- |
  | 30s     | `/products/suggest`                                                                       |
  | 60s     | `/categories`, `/products/facets`, `/artists`, `/artists/:id`, `/notices`, `/notices/:id` |
  | 300s    | `/sitemap`, `/auth/providers`, `/notifications/push-config`                               |

  홈·목록·상세처럼 `isFavorite`·경매 가격이 들어가는 응답과 로그인 사용자 응답에는 걸지 않는다. 에러 응답은 항상 `Cache-Control: no-store`.

### 응답 크기

목록 카드(`ProductCardDto`)는 카드가 그리는 필드만 담는다. 관심 수(`favoriteCount`)와 경매 id(`auction.id`)는 상세(`ProductDetailDto`)에만 있다. 홈 인기 작가(`popularArtists`, `/artists/popular`)는 `id·name·productCount·image` 만 담는다 (`ArtistCardDto`, 소개·생몰년은 `/artists/:id`).

## 엔드포인트

권한: `-` 공개, `U` 로그인, `S` 판매자(본인 소유), `A` ADMIN 이상, `SA` SUPER_ADMIN, `R` 재인증 헤더 필요(앱 세션).

### Auth

| Method | Path                           | 권한 | 설명                                                                                                                                                                                                                                                                       |
| ------ | ------------------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | /auth/email/send-code          | -    | {email, purpose} OTP 발송 (SIGNUP/RESET_PASSWORD/DELETE_ACCOUNT)                                                                                                                                                                                                           |
| POST   | /auth/email/verify-code        | -    | {email, purpose, code} → {verificationToken} (10분 유효)                                                                                                                                                                                                                   |
| POST   | /auth/signup                   | -    | {verificationToken, password, nickname, agreeTerms: true, agreePrivacy: true, ageOver14: true, agreeMarketing?, device} → 토큰 쌍                                                                                                                                          |
| POST   | /auth/login                    | -    | {email, password, device} → 토큰 쌍                                                                                                                                                                                                                                        |
| POST   | /auth/refresh                  | -    | 쿠키 또는 {refreshToken} → 회전된 토큰 쌍                                                                                                                                                                                                                                  |
| POST   | /auth/logout                   | -    | 현재 세션 폐기. {refreshToken?, pushToken?} — pushToken 은 그 세션 사용자의 것이면 함께 삭제(access 토큰 불필요). 이 기기 빠른 로그인 자격은 남긴다                                                                                                                        |
| POST   | /auth/session/persistence      | -    | 웹 쿠키 + CSRF. {persistent} — false 면 `rt` 를 세션 쿠키로 다시 굽고 `rts=1` 표시(회전도 세션 쿠키), true 면 30일 쿠키로 (docs/AUTH.md §12)                                                                                                                               |
| POST   | /auth/quick-login              | -    | {credentialId, secret, deviceId, device} 빠른 로그인(앱) → 토큰 쌍 + `quickLogin: {credentialId, secret, expiresAt}`(새 secret). 실패 401 `QUICK_LOGIN_INVALID` (docs/AUTH.md §9)                                                                                          |
| POST   | /auth/quick-login/register     | U(R) | {deviceId, deviceName} → {credentialId, secret, expiresAt}. 앱 세션만. 로그인 10분 뒤에는 R 필요                                                                                                                                                                           |
| GET    | /auth/quick-login              | U    | ?deviceId → {enabled, expiresAt}                                                                                                                                                                                                                                           |
| PATCH  | /auth/quick-login              | U    | {deviceId} 이 기기 자격을 현재 기기 세션(family)에 다시 묶는다 → {enabled, expiresAt}                                                                                                                                                                                      |
| DELETE | /auth/quick-login              | U    | {deviceId} 이 기기 자격 삭제                                                                                                                                                                                                                                               |
| POST   | /auth/password/reset           | -    | {verificationToken, newPassword} → 전체 세션 폐기                                                                                                                                                                                                                          |
| POST   | /auth/password/change          | U·R  | {currentPassword, newPassword} — 다른 기기 로그아웃                                                                                                                                                                                                                        |
| POST   | /auth/reauth                   | U    | {method:'password',password} · {method:'otp',code} · {method:'biometric',keyId,secret} → {reauthToken, expiresAt(5분)}. 실패 400 `REAUTH_FAILED`(OTP 는 `INVALID_CODE` 등)                                                                                                 |
| POST   | /auth/reauth/code              | U    | 로그인한 계정 이메일로 재인증 OTP 발송 → {retryAfterSec}                                                                                                                                                                                                                   |
| POST   | /auth/reauth/biometric         | U·R  | {deviceName} → {keyId, secret} 이 기기 생체 키 발급(재등록 시 교체, secret 은 이 응답에서만). 웹 세션도 R 필요                                                                                                                                                             |
| DELETE | /auth/reauth/biometric         | U    | 이 기기 생체 키 삭제                                                                                                                                                                                                                                                       |
| GET    | /auth/oauth/:provider/url      | -    | ?redirectUri → {url, state} (google/apple/kakao/naver)                                                                                                                                                                                                                     |
| POST   | /auth/oauth/:provider/callback | -    | {code, state, redirectUri, device} → 토큰 쌍                                                                                                                                                                                                                               |
| POST   | /auth/oauth/apple/native       | -    | {identityToken, authorizationCode?, name?, device} iOS 네이티브 Sign in with Apple → 토큰 쌍. code 는 서버가 refresh 토큰으로 교환해 암호화 저장(탈퇴 시 revoke)                                                                                                           |
| GET    | /auth/providers                | -    | {oauth: 웹 OAuth 가 설정된 provider[], appleNative: iOS 네이티브 Apple 가능 여부, identity}                                                                                                                                                                                |
| GET    | /auth/sessions                 | U    | 기기(세션) 목록                                                                                                                                                                                                                                                            |
| DELETE | /auth/sessions/:id             | U    | 특정 기기 로그아웃                                                                                                                                                                                                                                                         |
| DELETE | /auth/sessions                 | U    | 현재 기기 제외 전체 로그아웃                                                                                                                                                                                                                                               |
| DELETE | /auth/account                  | U·R  | 본인 확인 셋 중 하나: {password} · {verificationToken} · 소셜 재인증 {provider: kakao·naver·google·apple, code, state, redirectUri} 또는 {provider: 'apple', identityToken, authorizationCode?} → 탈퇴 (개인정보 익명화, Apple 토큰 revoke). 소셜 재인증만 보내면 R 불필요 |
| POST   | /auth/social/:provider         | U·R  | 소셜 연결. {code, state, redirectUri} 또는 Apple 네이티브 {identityToken, authorizationCode?}                                                                                                                                                                              |
| POST   | /auth/social/apple/native      | U·R  | {identityToken, authorizationCode?} iOS 시스템 Sign in with Apple 계정 연결 (위와 같은 동작의 전용 경로)                                                                                                                                                                   |
| DELETE | /auth/social/:provider         | U·R  | 소셜 연결 해제 (마지막 로그인 수단이면 409 `LAST_LOGIN_METHOD`). Apple 은 저장된 토큰을 revoke                                                                                                                                                                             |
| GET    | /auth/me                       | U    | 내 계정 + 프로필 + 역할 + `consentRequired` · `marketingOptIn` · `emailMissing`(소셜 임시 이메일, 화면에 보이지 않는다)                                                                                                                                                    |
| POST   | /me/consent                    | U    | {terms: true, privacy: true, ageOver14: true, marketing?, emailVerificationToken?, nickname?} → MeDto. 필수 동의(처음 값 유지)·마케팅 수신. 가입 마무리의 이메일 인증(SIGNUP)·닉네임 변경 (docs/AUTH.md §11)                                                               |

### Users / Profile

| Method                | Path                                            | 권한 | 설명                                                                                              |
| --------------------- | ----------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| GET                   | /users/:id                                      | -    | 공개 프로필 (닉네임, 소개, 신뢰도, 팔로워/팔로잉 수)                                              |
| PATCH                 | /users/me/profile                               | U    | 닉네임/소개/아바타/지역                                                                           |
| GET                   | /users/:id/products                             | -    | 판매 상품                                                                                         |
| GET                   | /users/:id/reviews                              | -    | 받은 리뷰                                                                                         |
| POST/DELETE           | /users/:id/follow                               | U    | 팔로우/언팔로우                                                                                   |
| GET                   | /users/:id/followers · /following               | -    |                                                                                                   |
| GET                   | /me/purchases · /me/sales · /me/bids · /me/wins | U    | 구매/판매/입찰/낙찰 기록                                                                          |
| GET/POST/PATCH/DELETE | /me/addresses                                   | U    | 배송지                                                                                            |
| POST                  | /me/seller                                      | U    | 판매자 등록 (정산 계좌) → role SELLER                                                             |
| GET                   | /me/seller                                      | S    | 정산 정보 (계좌 마스킹)                                                                           |
| PATCH                 | /me/seller                                      | S·R  | 정산 정보·계좌 수정                                                                               |
| GET                   | /me/security/events                             | U    | ?cursor → 내 보안 기록 (최신순 30개, IP 마스킹)                                                   |
| POST                  | /me/security/integrity                          | U    | {platform, flags[], appVersion} 기기 무결성 신고 → 204 (경고만, 같은 기기·신호는 24시간 1회 기록) |
| POST/DELETE           | /me/push-tokens                                 | U    | 푸시 토큰                                                                                         |

### Catalog

| Method | Path             | 권한 | 설명                                                                                    |
| ------ | ---------------- | ---- | --------------------------------------------------------------------------------------- |
| GET    | /categories      | -    | 트리 + 공개 작품 수(`productCount`, 대분류는 합계)·대표 이미지(`coverImage`) (캐시 60s) |
| GET    | /artists?q=      | -    | 작가 검색                                                                               |
| GET    | /artists/popular | -    | 인기 작가 요약 `ArtistCardDto` (캐시 5분)                                               |
| GET    | /artists/:id     | -    | 작가 + 작품                                                                             |

### Products

| Method      | Path                                     | 권한 | 설명                                                               |
| ----------- | ---------------------------------------- | ---- | ------------------------------------------------------------------ |
| GET         | /home                                    | -    | 홈 섹션 묶음 (배너, 인기, 오늘의 경매, 마감 임박, 신규, 인기 작가) |
| GET         | /products                                | -    | 검색/필터/정렬                                                     |
| GET         | /products/suggest?q=                     | -    | 자동완성 {products, artists, categories}                           |
| GET         | /products/:id                            | -    | 상세 (이미지, 판매자 요약, 인증서, 출처, 경매 요약, `blockedByMe`) |
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

| Method | Path          | 권한 | 설명                                                                                                                                                                                                        |
| ------ | ------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | /media/images | U    | multipart `file`(30MB 이하, JPG·PNG·HEIC/HEIF·WebP·AVIF·GIF·TIFF — 포맷은 내용으로 판별, gif·tiff 는 첫 장) → {key, width, height, dominantColor, urls}. 지원 안 함 `INVALID_IMAGE`, 초과 `IMAGE_TOO_LARGE` |

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
| POST         | /orders/:id/payments                | U·R         | {method, addressId?} → {paymentId, provider(toss·mock), clientKey, amount, orderName, dueAt}         |
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
| PATCH       | /chat/rooms/:id                     | U(참여자) | {muted?, pinned?} 알림 끄기 · 상단 고정 (목록은 고정한 방 먼저, 최근에 고정한 순)                                                                                                                                                                                     |
| PATCH       | /chat/rooms/:id/trade               | U(판매자) | {status: ACTIVE·RESERVED·SOLD} 채팅에서 거래 상태 변경 (경매·주문 걸린 작품은 `INVALID_TRANSITION`). 방에 SYSTEM 메시지 `TRADE_*`                                                                                                                                     |
| GET · PUT   | /chat/phrases                       | U         | 자주 쓰는 문구 {phrases: string[]} — 최대 20개·각 100자, 공백·중복 정리. 저장한 적 없으면 기본 문구                                                                                                                                                                   |
| —           | (SYSTEM 메시지)                     | —         | 주문 상태 전환 시 그 작품의 구매자·판매자 방에 `ORDER_PAID`·`ORDER_SHIPPED`·`ORDER_DELIVERED`·`ORDER_COMPLETED`·`ORDER_CANCELLED`·`ORDER_REFUND_REQUESTED`·`ORDER_REFUNDED` (`system {event, orderId}`)                                                               |
| POST/DELETE | /users/:id/block                    | U         | 차단/해제 — 차단 관계에서는 채팅 생성·전송 불가                                                                                                                                                                                                                       |
| GET         | /me/blocks · /me/reports            | U         | 차단 목록 / 내 신고 내역                                                                                                                                                                                                                                              |

### Reviews / Notifications / Reports

| Method      | Path                                | 권한      | 설명                                                                                                                         |
| ----------- | ----------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| POST        | /orders/:id/reviews                 | U         | COMPLETED 주문 당사자, 1회                                                                                                   |
| DELETE      | /reviews/:id                        | U(작성자) |                                                                                                                              |
| GET         | /notifications                      | U         | 커서 (30개)                                                                                                                  |
| POST        | /notifications/read                 | U         | {ids} 또는 {all:true} → {unreadCount}                                                                                        |
| GET         | /notifications/unread-count         | U         |                                                                                                                              |
| DELETE      | /notifications/:id · /notifications | U         | 한 건 삭제 / 읽은 알림 모두 삭제                                                                                             |
| GET/PUT     | /me/notification-settings           | U         | {push:{auction,trade,chat,activity}, quietHours} — 방해 금지 21~8시(KST) 푸시 보류. 운영 공지·가입 축하(system)는 끌 수 없다 |
| POST/DELETE | /me/push-tokens                     | U         | {token, platform: expo·web} 등록(기기당 한 계정)·해제                                                                        |
| GET         | /notifications/push-config          | -         | {vapidPublicKey} (웹 푸시 구독용, 미설정 시 null)                                                                            |
| POST        | /reports                            | U         | {targetType, targetId, reason, detail}                                                                                       |

### Admin (`/admin/*`, ADMIN·SUPER_ADMIN, 모든 변경은 AuditLog 기록)

목록은 `?page=&size=&q=` 페이지 방식 → `{items, total, page, size}`. 조치에는 `{reason}` 이 필요하다.

| 경로                              | 기능                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /admin/dashboard              | 회원·판매자·작품·경매·주문·거래액(오늘/30일)·처리 대기(환불 요청·신고·미결제)·정산 예정/보류 + 14일 추이 (캐시 30s)                                                                                                                                                 |
| /admin/users · /users/:id         | 검색(이메일·닉네임·ID, 역할·상태), 상세, suspend(모든 기기 로그아웃, 로그인 시 사유 안내)·restore, PATCH role(관리자 부여·관리자 대상 조치는 SA 만), reset-strikes                                                                                                  |
| /admin/sellers                    | 인증 대기/완료 필터, verify·unverify (VERIFIED_SELLER)                                                                                                                                                                                                              |
| /admin/products                   | 검색·상태·검수 필터·미처리 신고 수, hide(SUSPENDED)·restore, DELETE(진행 중 주문 있으면 거부), certificate 검수                                                                                                                                                     |
| /admin/categories                 | CRUD (2단계, slug 중복·작품/하위 있으면 삭제 거부)                                                                                                                                                                                                                  |
| /admin/auctions · /auction-policy | 목록·강제 취소 / 연장·결제 기한·기간 정책                                                                                                                                                                                                                           |
| /admin/orders · /orders/:id       | 검색, 상세, refund: 결제 전후 취소·환불 승인, 배송 이후·구매 확정 분쟁은 강제 환불 + 정산 보류                                                                                                                                                                      |
| /admin/payments                   | 결제 내역 (상태·수단 필터)                                                                                                                                                                                                                                          |
| /admin/settlements · /actions     | 목록, 일괄 pay·hold·release                                                                                                                                                                                                                                         |
| /admin/coupons                    | CRUD (사용된 쿠폰은 코드·방식·금액 변경 불가, 삭제 대신 비활성화)                                                                                                                                                                                                   |
| /admin/reports · /:id/resolve     | 대상 미리보기·누적 수, 처리 + 조치(작품 비공개·회원 정지·메시지/후기 삭제), 같은 대상 신고 일괄 종료                                                                                                                                                                |
| /admin/banners · /notices         | CRUD (배너 링크는 사이트 내부 경로만, 공지는 예약 게시)                                                                                                                                                                                                             |
| POST /admin/broadcast             | {title, body, link, audience: all·sellers·buyers, kind?: NOTICE(기본)·MARKETING} → {recipients, pushed}. NOTICE 는 운영 알림(알림함 + 푸시). MARKETING 은 `marketingOptIn` 회원에게만, 제목 앞 `(광고)`·본문 끝 수신거부 안내, 21~8시(KST)에는 푸시 없이 알림함에만 |
| GET /admin/audit-logs             | 감사 로그 (대상 유형·관리자 필터)                                                                                                                                                                                                                                   |
| /admin/ota                        | 앱 OTA 배포 목록(platform·channel 필터), PATCH :id 비율·중단, POST rollback (previous·embedded)                                                                                                                                                                     |

공개: `GET /notices` (고정 먼저, 게시일 지난 것만) · `GET /notices/:id`.

### OTA (앱 업데이트, Expo Updates 프로토콜 v1)

자체 호스팅 OTA. 흐름·키 관리는 docs/MOBILE_RELEASE.md "OTA 업데이트". 이 엔드포인트들은 공통 응답 포맷(`{error}` 제외)을 따르지 않고 Expo 프로토콜을 따른다.

| Method | Path          | 권한   | 설명                                                                                                                           |
| ------ | ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| GET    | /ota/manifest | -      | 앱(expo-updates)이 호출. 새 업데이트가 있으면 `multipart/mixed` 매니페스트, 되돌리기면 지시(directive), 없으면 204             |
| POST   | /ota/assets   | 토큰 P | multipart `file` + `contentType`, `fileExtension`(".png", 번들은 "") → `OtaAsset` {hash, key, contentType, fileExtension, url} |
| POST   | /ota/updates  | 토큰 P | `otaPublishSchema` → `OtaUpdateDto` (201)                                                                                      |

- **토큰 P**: 배포 스크립트 전용. `x-ota-publish-token` 헤더가 `OTA_PUBLISH_TOKEN` 과 같아야 한다 (불일치 401, 서버 미설정 503 `OTA_NOT_CONFIGURED`).
- **에셋 저장**: 내용 주소 `public/ota/<sha256 hex><ext>` (immutable 캐시). `hash` = sha256 base64url(패딩 없음), `key` = md5 hex. 파일당 최대 50MB.
- **매니페스트 요청 헤더**: `expo-platform`(ios·android, 필수), `expo-runtime-version`(필수) — 없으면 400. `expo-channel-name`(기본 production), `expo-current-update-id`, `expo-embedded-update-id`, `eas-client-id`, `expo-expect-signature`, `expo-protocol-version`(없으면 1).
- **선택**: 같은 platform·runtimeVersion·channel 의 ACTIVE 행을 최신순으로 보며, 점진 배포 대상인 첫 행을 고른다. 대상 여부 = `rolloutPercent = 100` 또는 `sha256("<id>:<eas-client-id>")` 앞 4바이트(uint32) % 100 < rolloutPercent. 기기 ID 가 없으면 100% 배포만 받는다.
  - 고른 행이 없거나, 이미 그 업데이트(`expo-current-update-id`)로 실행 중이면 204.
  - ROLLBACK 행: 내장 번들로 실행 중(현재 ID 없음 또는 내장 ID 와 같음)이면 204, 아니면 `directive` 파트 `{"type":"rollBackToEmbedded","parameters":{"commitTime"}}`.
  - UPDATE 행: `manifest` 파트 `{id, createdAt, runtimeVersion, launchAsset, assets, metadata: {}, extra: {expoClient, critical}}` + `extensions` 파트 `{"assetRequestHeaders":{}}`.
- **응답 헤더**: `expo-protocol-version: 1`, `expo-sfv-version: 0`, `cache-control: private, max-age=0`, `content-type: multipart/mixed; boundary=…` (204 도 `expo-protocol-version` 포함).
- **서명**: `OTA_SIGNING_KEY` 가 있으면 manifest·directive 파트 본문에 RSA-SHA256(PKCS#1 v1.5) 서명 → 파트 헤더 `expo-signature: sig="<base64>", keyid="<OTA_SIGNING_KEY_ID>"`. `expo-expect-signature` 가 왔는데 키가 없으면 500 `OTA_NOT_CONFIGURED`.

## WebSocket (Socket.IO, namespace `/rt`)

연결: `io(API_ORIGIN + "/rt", { auth: { token } })`. 토큰 없이도 연결 가능 (경매 관전). 토큰이 유효하지 않으면 익명으로 취급한다.

| 방향 | 이벤트                           | payload                                                                                                                                                                                                         |
| ---- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C→S  | `auction:join` / `auction:leave` | {auctionId} → ack {snapshot, serverTime}                                                                                                                                                                        |
| C→S  | `chat:join`                      | {roomId} (참여자 검증) — 들어가 있는 동안은 "보고 있음"이라 그 방 새 메시지 푸시를 보내지 않는다 (앱 백그라운드·웹 탭 숨김이면 `chat:leave`). 로그인 소켓 접속·해제로 `counterpart.online`·`lastSeenAt` (Redis) |
| C→S  | `time:sync`                      | ack {serverTime}                                                                                                                                                                                                |
| S→C  | `AUCTION_BID`                    | {auctionId, seq, bid:{id, amount, bidderMasked, createdAt}}                                                                                                                                                     |
| S→C  | `AUCTION_PRICE_UPDATED`          | {auctionId, seq, currentPrice, minNextBid, bidCount, bidderCount, highestBidderId}                                                                                                                              |
| S→C  | `AUCTION_TIMER_UPDATED`          | {auctionId, seq, endsAt, serverTime}                                                                                                                                                                            |
| S→C  | `AUCTION_EXTENDED`               | {auctionId, seq, endsAt, extendedBySec}                                                                                                                                                                         |
| S→C  | `AUCTION_STARTED`                | {auctionId, seq, status}                                                                                                                                                                                        |
| S→C  | `AUCTION_ENDED`                  | {auctionId, seq, result, winnerId, finalPrice}                                                                                                                                                                  |
| S→C  | `CHAT_MESSAGE`                   | {roomId, message}                                                                                                                                                                                               |
| S→C  | `CHAT_READ`                      | {roomId, userId, lastReadAt}                                                                                                                                                                                    |
| S→C  | `NOTIFICATION`                   | {notification, unreadCount} (room `user:{id}`) — 상위 입찰·종료 임박·낙찰/유찰·경매 시작(관심)·주문 상태·문의·가격 인하                                                                                         |
| S→C  | `ORDER_STATUS_UPDATED`           | {orderId, status} (room `user:{id}`)                                                                                                                                                                            |

`seq` = `Auction.version`. 클라이언트는 `seq` 가 건너뛰면 `GET /auctions/:id` 로 재동기화한다. 재연결 시 룸 재가입 + 스냅샷 재조회는 항상 수행한다.

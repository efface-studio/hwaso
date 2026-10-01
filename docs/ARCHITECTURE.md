# ARCHITECTURE

미술품·역사적 제품·컬렉터블 거래 + 실시간 경매 플랫폼 **화소(畫所)** 의 전체 구조.

## 1. 원칙

1. **서버가 진실의 원천(Server Authority)** — 가격, 입찰 가능 여부, 경매 상태/종료 시간, 최고 입찰자, 주문/결제 상태는 모두 서버가 결정한다. 클라이언트는 표시만 한다.
2. **데이터 무결성 우선** — 동시성이 걸린 쓰기(입찰, 즉시구매, 재고, 결제 확정)는 DB 트랜잭션 + Row Lock 으로 직렬화한다.
3. **가장 단순한 동작하는 구조** — 필요가 증명되기 전까지 인프라를 늘리지 않는다. (아래 "확장 경로" 참고)
4. 우선순위: Security → Data Integrity → Auction Integrity → Payment Integrity → UX → Performance → Maintainability → Visual.

## 2. Monorepo

pnpm workspaces 기반. (빌드 오케스트레이터는 `pnpm -r` 로 충분해 추가하지 않는다.)

```
apps/
  api/        NestJS 11 · Prisma 6 · PostgreSQL 16 · Redis 7 · Socket.IO
  web/        Next.js 16 (App Router) · Tailwind CSS 4 · TanStack Query · Zustand
  mobile/     Expo (React Native) · React Navigation · expo-notifications/camera/image-picker
packages/
  tokens/     디자인 토큰 (색·타이포·간격·radius·shadow) — web(CSS 변수)·mobile(JS 객체) 공용
  shared/     zod 스키마 · 공용 타입 · enum · 도메인 규칙(입찰 단위, 가격 포맷, 상태 전이표)
  api-client/ fetch 기반 타입 안전 API 클라이언트 + Socket 이벤트 타입 (web·mobile 공용)
docs/         설계 문서
```

- tsconfig 공통값은 루트 `tsconfig.base.json` 에 둔다. (별도 config 패키지는 만들지 않는다)
- 공유 패키지는 **소스(TS) 그대로 export** 하고 각 앱 번들러(Next/Metro)가 트랜스파일한다. API 는 tsup(swc, 데코레이터 메타데이터 지원)이 워크스페이스 패키지를 번들에 포함해 빌드한다.
- Web/Mobile UI 컴포넌트는 플랫폼별로 구현한다 (DOM vs Native). 토큰·스키마·로직만 공유한다.

## 3. 런타임 구성

```
                                   CDN (/media/*) ── S3 (로컬: RustFS)
                                                        ▲
 Web (Next SSR) ──HTTP──┐                               │
 Mobile (Expo)  ──HTTP──┼──> API (NestJS, N 인스턴스) ───┼──> PostgreSQL
                ──WS────┘     └ Socket.IO Gateway        │
                                 └ Redis adapter ─────> Redis (pub/sub, rate limit, cache, 세션 폐기 표시)
                         Worker (같은 코드베이스, 엔트리 `worker.ts`)
                           ├ 경매 스케줄러: SCHEDULED→LIVE, LIVE→ENDED (1초 폴링, SKIP LOCKED)
                           ├ 주문 결제 기한 만료
                           └ 경매 종료 임박 알림
```

- API 인스턴스는 무상태. 소켓 브로드캐스트는 `@socket.io/redis-adapter` 로 모든 인스턴스에 전파된다.
- Worker 도 Redis emitter 로 소켓 이벤트를 발행한다.
- Worker 는 `FOR UPDATE SKIP LOCKED` 로 경매를 집어가므로 여러 개 띄워도 중복 처리되지 않는다.

## 4. API 모듈 (apps/api/src)

| 모듈            | 책임                                                             |
| --------------- | ---------------------------------------------------------------- |
| `prisma`        | PrismaClient                                                     |
| `redis`         | ioredis 클라이언트                                               |
| `auth`          | 가입/로그인/토큰/세션·기기/소셜/이메일 인증/비밀번호 재설정/탈퇴 |
| `users`         | 프로필, 팔로우, 거래 신뢰도                                      |
| `catalog`       | 카테고리(트리), 작가                                             |
| `products`      | 상품 CRUD, 인증서/출처, 검색·필터·자동완성                       |
| `media`         | 업로드 검증, sharp 변환, S3 저장                                 |
| `favorites`     | 관심상품                                                         |
| `auctions`      | 경매 생성/상태 전이/입찰/즉시구매/연장, 스케줄러                 |
| `realtime`      | Socket.IO 게이트웨이, 룸/인증, 이벤트 발행                       |
| `orders`        | 장바구니, 주문, 주문 상태 전이                                   |
| `payments`      | `PaymentProvider` (Mock / TossPayments)                          |
| `shipping`      | 배송지, 송장, `CarrierProvider`                                  |
| `chat`          | 1:1 채팅                                                         |
| `reviews`       | 거래 리뷰                                                        |
| `notifications` | 인앱 알림 + 푸시 (Expo / Web Push)                               |
| `reports`       | 신고                                                             |
| `admin`         | 회원·상품·경매·주문 관리, 검수, 정책, 배너/공지/쿠폰, 감사 로그  |
| `ota`           | 앱 OTA 업데이트 서버 (Expo Updates v1 매니페스트·서명·점진 배포) |
| `settlements`   | 판매자 정산                                                      |
| 모듈            | 책임                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `prisma`        | PrismaClient                                                                                                                      |
| `redis`         | ioredis 클라이언트                                                                                                                |
| `auth`          | 가입/로그인/토큰/세션·기기/소셜/이메일 인증/비밀번호 재설정/탈퇴                                                                  |
| `security`      | 민감 작업 재인증 가드(`@RequireReauth`), 생체 재인증 키, 보안 이벤트·새 기기 알림, 기기 무결성 신고 (docs/SECURITY.md §계정 보안) |
| `users`         | 프로필, 팔로우, 거래 신뢰도                                                                                                       |
| `catalog`       | 카테고리(트리), 작가                                                                                                              |
| `products`      | 상품 CRUD, 인증서/출처, 검색·필터·자동완성                                                                                        |
| `media`         | 업로드 검증, sharp 변환, S3 저장                                                                                                  |
| `favorites`     | 관심상품                                                                                                                          |
| `auctions`      | 경매 생성/상태 전이/입찰/즉시구매/연장, 스케줄러                                                                                  |
| `realtime`      | Socket.IO 게이트웨이, 룸/인증, 이벤트 발행                                                                                        |
| `orders`        | 장바구니, 주문, 주문 상태 전이                                                                                                    |
| `payments`      | `PaymentProvider` (Mock / TossPayments)                                                                                           |
| `shipping`      | 배송지, 송장, `CarrierProvider`                                                                                                   |
| `chat`          | 1:1 채팅                                                                                                                          |
| `reviews`       | 거래 리뷰                                                                                                                         |
| `notifications` | 인앱 알림 + 푸시 (Expo / Web Push)                                                                                                |
| `reports`       | 신고                                                                                                                              |
| `admin`         | 회원·상품·경매·주문 관리, 검수, 정책, 배너/공지/쿠폰, 감사 로그                                                                   |
| `settlements`   | 판매자 정산                                                                                                                       |

각 모듈은 `controller → service → prisma`. 별도 Repository 계층은 두지 않는다 (Prisma 가 그 역할).

## 5. 요청 흐름 — 입찰 (핵심)

```
Client ──POST /auctions/:id/bids {amount, idempotencyKey}──> API
API:  JwtGuard → Throttle(user) → zod 검증
      BEGIN
        SELECT ... FROM "Auction" WHERE id=$1 FOR UPDATE        -- 직렬화 지점
        상태=LIVE, now() < endsAt, 판매자≠입찰자, 금액 ≥ 최소 허용가 검증
        INSERT AuctionBid
        UPDATE Auction SET currentPrice, highestBidId, bidCount, endsAt(연장 시), version+1
      COMMIT
      → Redis adapter → room `auction:{id}` : AUCTION_BID + AUCTION_PRICE_UPDATED (+ AUCTION_EXTENDED)
      → 이전 최고 입찰자에게 NOTIFICATION(OUTBID)
Client: 서버 이벤트로만 가격 갱신 (낙관적 업데이트 없음)
```

자세한 내용은 [AUCTION.md](./AUCTION.md).

## 6. 이미지 파이프라인

1. 클라이언트 → `POST /media/images` (multipart, 최대 30MB, 요청당 1장). 웹 `accept` 는 `image/*,.heic,.heif` (`IMAGE_UPLOAD`, packages/shared)
2. 서버: 확장자/Content-Type 이 아니라 **sharp 로 실제 포맷 판별** (jpeg/png/webp/heif/avif/gif/tiff 외 거부, gif·tiff 는 첫 장), 픽셀 수 상한 100MP. iPhone HEIC(HEVC)는 sharp 가 디코딩하지 못해 `heic-decode`(WASM)를 워커 스레드에서 실행
3. EXIF 방향 적용 후 **메타데이터(GPS 등) 제거**, 원본은 `originals/` (비공개) 에 보관
4. 파생본: 폭 `400/800/1600` WebP + AVIF → `public/` prefix, 키에 콘텐츠 해시 포함 → CDN `immutable` 캐시
   - 원본은 한 번만 디코딩한다: 방향 적용 + 1600 폭으로 줄인 픽셀에서 작은 파생본을 만들고, 인코딩은 병렬. 대표색은 64px 썸네일로 계산
5. `ProductImage` 에 key, width, height, dominantColor 저장 (로딩 placeholder 색)

### 앱 OTA 에셋

배포 스크립트가 올린 JS 번들·에셋은 가공 없이 `public/ota/<sha256 hex><ext>` 에 저장한다 (내용 주소라 같은 파일은 같은 키, CDN `immutable`). 매니페스트는 DB(`OtaUpdate`) 에서 만들어 서명하고, 서명한 파트는 API 인스턴스 메모리에 행 단위로 캐시한다 (내용이 바뀌지 않는다). 흐름은 docs/MOBILE_RELEASE.md "OTA 업데이트".

## 7. 검색

- PostgreSQL `pg_trgm` + ILIKE/유사도 — 상품명·작가·제작자·브랜드·시대·소재·카테고리·판매자.
- 조인한 OR ILIKE 는 trigram 인덱스를 못 타므로, 먼저 테이블별 ILIKE 를 `UNION` 해 공개 상품 id 후보를 모으고(`product_title_trgm`·`product_search_trgm`·`artist_name_trgm`·`profile_nickname_trgm`) 목록 쿼리는 `id IN (...)` + 나머지 필터·정렬로 조회한다. 후보가 5,000건을 넘는 흔한 검색어는 기존 OR 조건으로 찾는다.
- 자동완성: `pg_trgm` 유사도 상위 N (상품명/작가/카테고리).
- 확장 경로: 카탈로그가 커지거나 형태소 분석이 필요해지면 OpenSearch 인덱서로 전환. API 계약 유지.

## 8. 캐시

- 카테고리 트리, 홈 섹션: Redis 60초. 홈은 캐시가 비면 잠금(`SET NX`)을 잡은 한 요청만 다시 만들고, 나머지는 직전 값(`home:v3:stale`)을 쓰거나 잠시 기다린다. 경매 스케줄러는 틱마다 홈 캐시를 한 번만 지운다.
- 인기 작가(`/artists/popular`, 홈 인기 작가): Redis 5분. 관리자 대시보드: Redis 30초.
- 경매 정책(AuctionPolicy): 프로세스 메모리 60초. 관리자 변경은 변경을 처리한 프로세스에선 즉시, 다른 API 인스턴스·Worker 에선 60초 안에 반영.
- 상품 상세 페이지: Next.js ISR(60s). 경매 가격/상태는 클라이언트가 항상 실시간 조회·구독.
- 가격·입찰·재고·주문은 **캐시하지 않는다**.
- HTTP: 사용자와 무관한 공개 GET(카테고리·공지·작가 등)만 `Cache-Control: public` 짧은 캐시, JSON 응답은 br/gzip 압축 (docs/API.md "캐시·압축").

## 9. 환경

| 환경  | 구성                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------- |
| local | `docker compose` (postgres:5433, redis:6380, s3(RustFS):9000/9001, mailpit:8025) + `pnpm dev`           |
| CI    | GitHub Actions 서비스 컨테이너 (postgres, redis)                                                        |
| prod  | 컨테이너(API/Worker/Web) + 관리형 PostgreSQL/Redis + S3 + CDN. (배포 자동화는 범위 밖, Dockerfile 제공) |

로컬 3306 포트는 기존 MariaDB 가 사용 중 — DB 는 PostgreSQL 5433.

## 10. 확장 경로 (지금은 하지 않는 것)

| 지금                     | 한계                          | 확장                                |
| ------------------------ | ----------------------------- | ----------------------------------- |
| 경매 스케줄러 1초 폴링   | 초당 수만 건 종료             | BullMQ 지연 잡                      |
| 이미지 처리 요청 내 동기 | 업로드 폭주 시 API CPU        | 이미지 워커 + 큐                    |
| PG 검색                  | 대규모 카탈로그               | OpenSearch                          |
| 입찰 Row Lock            | 단일 경매 초당 수백 입찰 이상 | Redis Lua 원자 연산 + 비동기 영속화 |

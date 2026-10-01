# TESTING

## 계층

| 계층              | 도구                                           | 위치                            | 대상                                                          |
| ----------------- | ---------------------------------------------- | ------------------------------- | ------------------------------------------------------------- |
| Unit              | Vitest                                         | `packages/*/src/**/*.test.ts`   | 도메인 규칙 (최소 입찰가, 상태 전이표, 가격 포맷, zod 스키마) |
| Integration (API) | Vitest + supertest + **실제 PostgreSQL/Redis** | `apps/api/test/*.spec.ts`       | 엔드포인트, 트랜잭션, 동시성                                  |
| Component (Web)   | Vitest + Testing Library                       | `apps/web/src/**/*.test.tsx`    | 입찰 패널, 폼 검증, 카운트다운                                |
| E2E (Web)         | Playwright (Chromium)                          | `apps/web/e2e`                  | 둘러보기·검색, 즉시 구매→모의 결제, 경매 입찰, 채팅, 관리자   |
| Mobile            | Jest (jest-expo) + RN Testing Library          | `apps/mobile/src/**/*.test.tsx` | 핵심 컴포넌트/훅                                              |

API 통합 테스트는 **모킹하지 않은 DB** 로 돈다. 동시성·잠금·제약은 모킹으로 검증할 수 없기 때문이다. 외부 연동(PG, 메일, 소셜, S3)만 테스트 더블(Mock provider)로 교체한다.

## 테스트 DB

- 로컬: `docker compose up -d postgres redis` → `pnpm --filter @shop/api test` 가 `DATABASE_URL_TEST`(`shop_test` DB, 이름이 `_test` 로 끝나야 함)에 `prisma migrate deploy` 후 모든 테이블을 TRUNCATE 하고 실행.
- Redis 는 `REDIS_URL_TEST`(기본 `redis://localhost:6380/15`)를 쓴다. 테스트 앱은 시작할 때 이 db 를 `FLUSHDB` 하므로, 서버가 쓰는 db 0 이면 비우지 않고 실패한다.
- 각 spec 파일은 고유 데이터(랜덤 이메일 등)를 만들어 서로 간섭하지 않는다. 테이블 truncate 는 전역 setup 에서 1회.
- `test/fixtures.ts` 의 `createUser` 는 앱(ios) 기기 세션을 함께 만든다. 재인증(`@RequireReauth`)이 필요한 엔드포인트는 `reauth(t, user)` 로 `x-reauth-token` 헤더를 받아 붙인다 (재인증 흐름 자체는 `security.spec.ts`).
- CI: GitHub Actions 서비스 컨테이너 (postgres:16, redis:7).

## 필수 케이스

### Auth

- Signup: OTP 발송 → 검증 → 가입 → 토큰 반환 / 잘못된 코드 5회 초과 잠금 / 중복 닉네임 409
- Login: 성공 / 잘못된 비밀번호 동일 메시지 / 계정 잠금
- Logout: 세션 폐기 후 refresh 401
- Refresh: 회전 성공 / 이전 토큰 재사용 → family 전체 폐기
- 권한: USER 가 판매자/관리자 API 호출 → 403

### Product

- Create (판매자 등록 전 403, 등록 후 성공, 필수값 누락 400, 허용 외 필드 400)
- Read (공개 상세에 판매자 이메일 없음, 숨김 상품 404)
- Update (타인 상품 403/404, 경매 LIVE 중 가격 변경 409)
- Delete (진행 중 주문 있으면 409)
- Search/Filter/Sort, 자동완성

### Order

- Order: 재고 차감, 품절 409, 동시 주문 2건 중 1건만 성공 (stock=1)
- Payment: confirm 금액 불일치 → 거절 + 결제 취소, 정상 승인 → PAID, 같은 paymentKey 중복 confirm 멱등
- Cancel: 결제 전 취소 → 재고 복구, 결제 후 발송 전 취소 → 환불
- Refund: 판매자 승인 → REFUNDED, 결제 상태 반영

### Auction (가장 중요)

- Bid 성공 / Minimum Bid 미달 / 단위 불일치
- Duplicate Bid: 같은 idempotencyKey → 1건
- **Concurrent Bid**: 50개 동시 요청(같은 금액) → 정확히 1건 성공. 50개 동시 요청(증가 금액) → DB 불변식(`currentPrice = max(amount)`, `bidCount = count(bids)`, 입찰 금액 시간순 엄격 증가) 유지
- Auction End: 종료 후 입찰 거절, Worker 종료 처리 → Winner = 최고 입찰자, 주문 1건
- Worker 동시 실행 2개 → 주문 1건
- Extension: 연장 창 내 입찰 → endsAt 연장, maxEndsAt 상한
- Buy now 동시 2건 → 1건 성공, 경매 ENDED
- 낙찰 결제 → SETTLED, 미결제 기한 초과 → UNPAID

## E2E

- 로컬: API(4000)·웹(3000)을 띄운 상태에서 `pnpm --filter @shop/web e2e`. 시드 계정(buyer1~4, seller1~5)을 쓰며, 관리자 테스트는 시드 관리자(`admin@shop.local`)를 `SEED_ADMIN_PASSWORD`(시드 계정 비밀번호와 같게) 로 만들어 두어야 통과한다.
- CI(`e2e` 잡): 빌드 → `prisma migrate deploy` → `SEED_OFFLINE=1` 시드(이미지 다운로드·S3 없이 고정 키) → Playwright 가 API·웹을 띄워 실행. 실패하면 리포트·트레이스를 아티팩트로 올린다.
- 시드 데이터를 공유하므로 한 워커로 순서대로 돈다. 데이터 준비(배송지·입찰 가능한 경매 찾기)는 API 로 한다.

## 시드 안전장치 (`prisma/seed-guard.ts`)

시드는 DB 를 비우고 저장소에 공개된 기본 비밀번호로 계정을 만든다. 그래서:

- `NODE_ENV=production` 이면 실행하지 않는다.
- DB 이름이 운영 DB(`shop`)면 `SEED_ALLOW_PRODUCTION=1` 을 명시해야 실행된다. 개발 API 도 같은 DB 를 쓰므로 실수로 운영 데이터를 지우지 않게 한다. 개발용으로는 별도 DB(예: `shop_dev`)를 권장한다.
- 최고 관리자(`SUPER_ADMIN`)는 `SEED_ADMIN_PASSWORD` 를 지정했을 때만 그 비밀번호로 만든다. 없으면 아무도 모르는 임의 비밀번호라 로그인할 수 없다 — 기본 비밀번호의 최고 관리자가 생기지 않게.

## 기준

- CI 에서 format · typecheck · lint · test · build · E2E 전부 통과해야 병합.
- `packages/shared` 도메인 로직 커버리지 90%+, API 서비스 80%+ 목표.
- 버그 수정은 재현 테스트 먼저.

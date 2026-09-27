# TESTING

## 계층

| 계층 | 도구 | 위치 | 대상 |
| --- | --- | --- | --- |
| Unit | Vitest | `packages/*/src/**/*.test.ts` | 도메인 규칙 (최소 입찰가, 상태 전이표, 가격 포맷, zod 스키마) |
| Integration (API) | Vitest + supertest + **실제 PostgreSQL/Redis** | `apps/api/test/*.spec.ts` | 엔드포인트, 트랜잭션, 동시성 |
| Component (Web) | Vitest + Testing Library | `apps/web/src/**/*.test.tsx` | 입찰 패널, 폼 검증, 카운트다운 |
| E2E (Web) | Playwright | `apps/web/e2e` | 가입→로그인, 상품 등록→구매, 경매 입찰 두 브라우저 동기화 |
| Mobile | Jest (jest-expo) + RN Testing Library | `apps/mobile/src/**/*.test.tsx` | 핵심 컴포넌트/훅 |

API 통합 테스트는 **모킹하지 않은 DB** 로 돈다. 동시성·잠금·제약은 모킹으로 검증할 수 없기 때문이다. 외부 연동(PG, 메일, 소셜, S3)만 테스트 더블(Mock provider)로 교체한다.

## 테스트 DB

- 로컬: `docker compose up -d postgres redis` → `pnpm --filter @shop/api test` 가 `DATABASE_URL_TEST`(`shop_test` DB)에 `prisma migrate reset --force --skip-seed` 후 실행.
- 각 spec 파일은 고유 데이터(랜덤 이메일 등)를 만들어 서로 간섭하지 않는다. 테이블 truncate 는 전역 setup 에서 1회.
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

## 기준

- CI 에서 typecheck · lint · test · build 전부 통과해야 병합.
- `packages/shared` 도메인 로직 커버리지 90%+, API 서비스 80%+ 목표.
- 버그 수정은 재현 테스트 먼저.

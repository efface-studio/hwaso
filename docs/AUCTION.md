# AUCTION

서비스의 핵심. **경매의 모든 중요한 상태는 서버가 결정한다.**

```
Client → Server(검증) → PostgreSQL(트랜잭션 + Row Lock) → Redis pub/sub → Socket.IO → Client
```

클라이언트가 보내는 값은 `amount` 와 `idempotencyKey` 뿐이다. 현재가·최소 입찰가·종료 시간·최고 입찰자·상태는 절대 클라이언트 값을 쓰지 않는다.

## 1. 상태 머신

```
DRAFT ──schedule──> SCHEDULED ──(worker: now ≥ startsAt)──> LIVE ──(worker: now ≥ endsAt | buy-now)──> ENDED ──(주문 결제 완료)──> SETTLED
  │                     │                                    │                                         │
  └──cancel(seller)─────┴──cancel(seller)                    └──cancel(admin)─────────────────────────┴──cancel(admin, 미결제)──> CANCELLED
```

| From             | To        | 주체          | 조건                                     |
| ---------------- | --------- | ------------- | ---------------------------------------- |
| DRAFT            | SCHEDULED | 판매자        | 상품 소유, 필드 유효, startsAt ≥ now+1분 |
| SCHEDULED        | LIVE      | Worker        | now ≥ startsAt                           |
| LIVE             | ENDED     | Worker        | now ≥ endsAt (행 잠금 후 재확인)         |
| LIVE             | ENDED     | 즉시구매      | buyNowPrice 존재, 현재가 < buyNowPrice   |
| ENDED            | SETTLED   | 결제          | 낙찰 주문 PAID                           |
| DRAFT, SCHEDULED | CANCELLED | 판매자/관리자 |                                          |
| LIVE, ENDED      | CANCELLED | 관리자만      | 사유 필수, AuditLog                      |

전이표는 `packages/shared/src/auction.ts` 의 `AUCTION_TRANSITIONS` 로 정의하고 서버는 모든 상태 변경 전에 `assertTransition(from, to)` 를 호출한다. 상태 변경 SQL 은 항상 `WHERE id=$1 AND status=$from` 조건부 UPDATE 로 수행해 경쟁 상태에서도 이중 전이가 불가능하다.

## 2. 생성 규칙 (서버 검증)

- 상품: 판매자 본인 소유, `saleType=AUCTION`, 진행 중인 다른 경매/주문 없음.
- `startPrice ≥ 1,000`, `bidIncrement ≥ 100`, 둘 다 정수.
- `buyNowPrice` 선택. 있으면 `> startPrice`.
- 기간: `policy.minDurationMin ≤ endsAt - startsAt ≤ policy.maxDurationDays`.
- `autoExtend` 선택. 연장 창/시간은 판매자가 아니라 **관리자 정책(AuctionPolicy)** 값을 생성 시점에 복사한다.
- `maxEndsAt = endsAt + policy.maxExtensionSec` (무한 연장 방지).

## 3. 최소 입찰가

```
minNextBid = bidCount == 0 ? startPrice : currentPrice + bidIncrement
```

- `amount ≥ minNextBid`
- `(amount - startPrice) % bidIncrement == 0` (단위 정렬, `BID_NOT_ALIGNED`)
- `amount ≤ currentPrice + bidIncrement × 1000` (오타 방지 상한)
- `buyNowPrice` 가 있고 `amount ≥ buyNowPrice` 면 입찰 대신 즉시구매 안내 (`BID_EXCEEDS_BUY_NOW`)

함수는 `packages/shared` 의 `minNextBid()` 로 공유 — 클라이언트는 **안내 표시용**으로만 쓰고 서버가 다시 계산한다.

## 4. 입찰 처리 (동시성)

```sql
BEGIN;
-- 1) 멱등성: 같은 (bidderId, idempotencyKey) 가 있으면 그 결과를 반환하고 종료
-- 2) 직렬화 지점
SELECT * FROM "Auction" WHERE id = $1 FOR UPDATE;
-- 3) 검증 (DB 시각 기준 now())
--    status = 'LIVE' AND now() < "endsAt"
--    bidder != seller, bidder != highestBidderId (ALREADY_HIGHEST)
--    사용자 ACTIVE + emailVerified
--    amount 규칙 (3절)
-- 4) 쓰기
INSERT INTO "AuctionBid" (...);
UPDATE "Auction" SET
  "currentPrice" = $amount, "highestBidId" = $bidId, "highestBidderId" = $bidder,
  "bidCount" = "bidCount" + 1, "bidderCount" = (신규 입찰자면 +1),
  "endsAt" = (연장 조건 충족 시 LEAST("endsAt" + extensionSec, "maxEndsAt")),
  "version" = "version" + 1
WHERE id = $1;
COMMIT;
```

- **Row Lock (`FOR UPDATE`)** 로 한 경매의 입찰은 완전히 직렬화된다. 동시에 100건이 와도 한 건씩 처리되며, 두 번째 요청은 첫 번째의 결과(갱신된 currentPrice)를 기준으로 검증된다.
- 보조 안전장치: `UNIQUE(auctionId, amount)` — 같은 금액 두 건은 물리적으로 불가능.
- 시간 판단은 앱 서버 시계가 아니라 **DB `now()`** (트랜잭션 시작 시각) 기준이다.
- 트랜잭션 격리 수준은 READ COMMITTED + 명시적 행 잠금. 잠금 대기 타임아웃 `lock_timeout = 3s` 초과 시 `AUCTION_BUSY`(503, 재시도 안내).
- 커밋 **이후에만** 이벤트를 발행한다 (롤백된 입찰이 방송되는 일 없음).

### 이벤트 발행 (커밋 후)

1. `AUCTION_BID`, `AUCTION_PRICE_UPDATED` → room `auction:{id}`
2. 연장됐으면 `AUCTION_EXTENDED` + `AUCTION_TIMER_UPDATED`
3. 이전 최고 입찰자에게 `OUTBID` 알림, 입찰자에게 `BID_PLACED`
4. 판매자에게 알림은 첫 입찰 시에만 (스팸 방지)

## 5. 연장 경매 (Anti-sniping)

- 조건: `autoExtend = true` 이고 `endsAt - now() ≤ extensionWindowSec`
- 효과: `endsAt = min(endsAt + extensionSec, maxEndsAt)`
- 기본 정책: 종료 30초 이내 입찰 → +30초, 최대 누적 30분. 관리자 `/admin/auction-policy` 에서 변경 (이미 생성된 경매엔 소급 적용하지 않음). 정책은 프로세스 메모리에 60초 캐시되므로 다른 API 인스턴스·Worker(종료 임박 기준)에는 최대 60초 늦게 반영된다.

## 6. 즉시 구매

같은 `FOR UPDATE` 경로. `status=LIVE`, `buyNowPrice` 존재, `currentPrice < buyNowPrice` 확인 → `isBuyNow` 입찰 기록 → 곧바로 7절 종료 처리를 **같은 트랜잭션**에서 수행.

## 7. 종료 처리 (Worker)

Worker 가 1초마다:

```sql
SELECT id FROM "Auction"
WHERE status = 'LIVE' AND "endsAt" <= now()
ORDER BY "endsAt" LIMIT 50
FOR UPDATE SKIP LOCKED;
```

집어온 각 경매에 대해 하나의 트랜잭션에서:

1. `status → ENDED` (조건부 UPDATE), **이후 입찰은 상태 검증에서 차단**
2. 입찰 있음 → `result=SOLD`, `winnerId=highestBidderId`, 상품 `status=RESERVED`
   입찰 없음 → `result=NO_BIDS`, 상품 `status=ACTIVE`(판매자가 재등록 가능)
3. 낙찰 시 주문 생성: `Order(source=AUCTION, status=PAYMENT_PENDING, paymentDueAt=now+policy.paymentDueHours)`
4. 커밋 후: `AUCTION_ENDED` 방송, 낙찰자 `AUCTION_WON`, 다른 참가자 `AUCTION_LOST`, 판매자 `ITEM_SOLD`

`SKIP LOCKED` 덕분에 Worker 를 여러 개 띄워도 한 경매는 한 번만 종료된다. 입찰 트랜잭션이 잠금을 쥐고 있는 경매는 이번 틱에 건너뛰고 다음 틱(1초 후)에 처리 — 그 사이 연장됐다면 `endsAt <= now()` 가 거짓이 되어 자연스럽게 종료되지 않는다.

종료할 경매가 없으면(`LIMIT 1` 존재 확인) 트랜잭션을 열지 않는다.

같은 루프에서:

- `SCHEDULED AND startsAt <= now()` → LIVE, `AUCTION_STARTED` 방송, 관심 등록자에게 알림. 집어가기와 전환을 한 문장(`UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING`)으로 처리
- `LIVE AND endsAt - now() <= endingSoonMin AND endingSoonNotifiedAt IS NULL` → 참가자·관심 등록자에게 `AUCTION_ENDING`. 입찰이 잠근 경매는 `SKIP LOCKED` 로 건너뛰고 다음 틱에 표시
- 낙찰 주문 `PAYMENT_PENDING AND paymentDueAt <= now()` → 주문 CANCELLED, 경매 `result=UNPAID`, 낙찰자 신뢰도 페널티, 상품 ACTIVE

## 8. 결제 → SETTLED

낙찰 주문 결제 확정(`/payments/confirm`) 트랜잭션 안에서 `Auction.status ENDED → SETTLED`. 이후 배송·정산은 일반 주문과 동일 (ORDER 흐름).

## 9. 서버 시간 & 타이머

- 모든 스냅샷/이벤트에 `serverTime`(ISO) 포함.
- 클라이언트: `offset = serverTime - (requestStart + rtt/2)` 추정 → `remaining = endsAt - (Date.now() + offset)` 로 1초마다 렌더.
- 30초마다, 그리고 탭/앱 포그라운드 복귀 시 `time:sync` 로 offset 재측정.
- 표시가 0 이 되어도 클라이언트가 종료를 **선언하지 않는다**. "종료 처리 중…" 을 보여주고 `AUCTION_ENDED` 이벤트 또는 재조회로만 확정한다.

## 10. 재연결 · 재동기화

- Socket.IO 자동 재연결 (지수 백오프).
- `connect` 시마다: 룸 재가입 → ack 스냅샷으로 상태 교체.
- 이벤트 `seq` 가 `lastSeq + 1` 이 아니면 즉시 `GET /auctions/:id` 재조회.
- 앱 포그라운드 복귀 / 네트워크 복구 시 TanStack Query invalidate.

## 11. 보안 · 조작 방지

- 입찰 rate limit: 사용자당 10회/10초.
- 판매자 본인 및 판매자와 같은 계정 입찰 금지 (`SELF_BID`).
- 이메일 미인증, 정지 계정 입찰 금지.
- 낙찰 후 미결제(UNPAID) 누적 2회 → 입찰 제한 (`ACCOUNT_RESTRICTED`), 관리자 해제.
- 입찰 취소 기능 없음 (경매 무결성). 관리자 경매 취소만 가능하며 AuditLog 기록.
- 입찰 기록 공개 시 닉네임 마스킹 (`ab***`).

## 12. 테스트 (apps/api/test/auction.*.spec.ts)

| 케이스                   | 기대                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| 최소 입찰가 미만         | 400 BID_TOO_LOW                                                                          |
| 단위 불일치              | 400 BID_NOT_ALIGNED                                                                      |
| 같은 idempotencyKey 2회  | 입찰 1건, 같은 응답                                                                      |
| 동시 50건 같은 금액      | 정확히 1건 성공                                                                          |
| 동시 50건 서로 다른 금액 | 성공 건들의 금액은 엄격히 증가, 최종 currentPrice = 성공 최대 금액, bidCount = 성공 건수 |
| 종료 후 입찰             | 409 AUCTION_ENDED                                                                        |
| 종료 30초 이내 입찰      | endsAt 연장, maxEndsAt 초과 안 함                                                        |
| Worker 종료              | 최고 입찰자 winner, 주문 1건 생성                                                        |
| Worker 2개 동시 실행     | 주문 정확히 1건                                                                          |
| 즉시 구매 동시 2건       | 1건만 성공                                                                               |
| 자기 상품 입찰           | 403 SELF_BID                                                                             |

# SECURITY

우선순위: Security → Data Integrity → Auction Integrity → Payment Integrity → …

## 위협별 대응

| 위협                         | 대응                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **XSS**                      | React 기본 이스케이프. `dangerouslySetInnerHTML` 금지 (JSON-LD 는 `JSON.stringify` 후 `<` 를 `<` 로 치환). 상품 설명·채팅은 순수 텍스트로 저장/렌더 (줄바꿈만 CSS `white-space: pre-wrap`). CSP: `default-src 'self'; img-src 'self' data: <CDN>; connect-src 'self' <API> <WS>; frame-src <PG>; object-src 'none'; base-uri 'self'` |
| **CSRF**                     | API 는 Bearer 토큰 → CSRF 무관. 쿠키 사용 엔드포인트(`/auth/refresh`, `/auth/logout`)만 `SameSite=Lax` + `Origin` 허용 목록 + `X-Requested-With` 커스텀 헤더 요구                                                                                                                                                                    |
| **SQL Injection**            | Prisma 파라미터 바인딩. raw 쿼리는 `$queryRaw` 템플릿 리터럴(자동 바인딩)만, `$queryRawUnsafe` 금지 (lint 규칙)                                                                                                                                                                                                                      |
| **Rate Limit / Brute Force** | Redis 고정 창 (API.md 표). 로그인 계정 잠금, OTP 시도 5회 제한                                                                                                                                                                                                                                                                       |
| **Token Theft**              | Access 15분·메모리 보관, Refresh httpOnly/SecureStore, rotation + 재사용 탐지 시 family 폐기, 기기 관리에서 원격 로그아웃                                                                                                                                                                                                            |
| **Privilege Escalation**     | 모든 권한은 서버 Guard. 소유권은 쿼리 조건(`sellerId = me`)으로 강제. 역할 변경은 SUPER_ADMIN 만 + AuditLog. 요청 DTO 는 zod `strict()` — 허용되지 않은 필드(`role`, `status`, `price` 등)는 거부 (mass assignment 방지)                                                                                                             |
| **IDOR**                     | 주문/채팅/알림/배송지 조회는 항상 `WHERE userId = me` 또는 당사자 검사. cuid 로 추측 난이도 추가                                                                                                                                                                                                                                     |
| **File Upload**              | 크기 30MB, 요청당 1장, 사용자당 60/분. 확장자·Content-Type 불신 → 실제 디코딩 성공한 jpeg/png/webp/heif(HEIC)/avif/gif/tiff 만 허용(gif·tiff 는 첫 장), 픽셀 100MP 상한(decompression bomb), 재인코딩 결과만 공개 (원본 비공개), EXIF/GPS 제거, 저장 키는 서버 생성(cuid) — 사용자 파일명 사용 안 함, SVG·BMP 불허                   |
| **HEIC Decoder**             | sharp 가 못 푸는 HEVC HEIC 는 `heic-decode`(libheif WASM)로 디코딩. 워커 스레드에서 실행해 이벤트 루프를 막지 않고, 디코딩 전 컨테이너 크기(ispe)로 픽셀 상한 확인, 20초 시간 제한, 프로세스당 동시 2건                                                                                                                              |
| **Malicious File**           | 재인코딩으로 폴리글랏/스크립트 제거. 공개 버킷은 `Content-Type` 고정 + `X-Content-Type-Options: nosniff` + `Content-Disposition: inline`                                                                                                                                                                                             |
| **개인정보 노출**            | 공개 API 에 이메일·전화·주소 절대 미포함 (응답 DTO select 화이트리스트). 배송지는 주문 당사자만. 입찰자 닉네임 마스킹. 로그에서 `password`, `token`, `authorization`, `cookie`, `phone`, `address` 필드 redact (pino redact). 정산 계좌 AES-256-GCM 암호화 저장                                                                      |
| **Payment Tampering**        | 결제 금액은 **서버가 주문에서 계산**. confirm 시 PG 응답 금액 = `Order.totalAmount` 불일치면 즉시 결제 취소 + 주문 FAILED. 웹훅은 서명/PG 재조회로 검증, `providerPaymentKey` unique 로 중복 승인 방지. 결제 확정은 조건부 UPDATE(`status = PAYMENT_PENDING`) 로 멱등                                                                |
| **Auction Manipulation**     | AUCTION.md: 서버 계산 최소가, 행 잠금, DB 시각, 자기 입찰 금지, 입찰 취소 없음, 미결제 제재, 관리자 조치 AuditLog                                                                                                                                                                                                                    |
| **Race Condition**           | 입찰·즉시구매: `FOR UPDATE`. 재고: `UPDATE Product SET stock = stock - n WHERE id AND stock >= n` 결과 행 수 확인. 쿠폰: `usedCount < usageLimit` 조건부 증가 + `unique(couponId,userId)`. 상태 전이: 조건부 UPDATE. Worker: `SKIP LOCKED`                                                                                           |
| **Open Redirect**            | `next=` 파라미터는 `/` 로 시작하고 `//` 가 아닌 상대 경로만. OAuth `redirectUri` 허용 목록                                                                                                                                                                                                                                           |
| **SSRF**                     | 서버가 사용자 제공 URL 을 fetch 하지 않는다 (이미지는 업로드만)                                                                                                                                                                                                                                                                      |
| **Secrets**                  | `.env` 커밋 금지, `.env.example` 만. 부팅 시 zod 로 필수 환경변수 검증 — 누락 시 기동 실패. 운영 JWT 시크릿 32바이트 이상                                                                                                                                                                                                            |

## HTTP 보안 헤더 (API · Web)

`helmet` (API), Next `headers()` (Web): HSTS(운영), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`(PG iframe 제외), `Permissions-Policy: camera=(), geolocation=()`.

CORS: 허용 origin 목록(`WEB_ORIGIN`), `credentials: true`.

## 에러 노출

- 운영: 5xx 응답은 고정 문구 + requestId. 스택·SQL·파일 경로·내부 ID 미노출.
- 개발: 응답 `error.debug` 에 스택 포함 (`NODE_ENV !== 'production'`).
- Prisma 에러는 도메인 에러로 매핑(unique → 409 등) 후 원문 미노출.

## 감사 로그

관리자 모든 변경, 역할 변경, 경매 강제 취소, 주문 강제 상태 변경, 환불, 정산 지급, 계정 정지/탈퇴 → `AuditLog` (append-only, 삭제 API 없음).

## 의존성

- `pnpm audit --prod` CI 경고, Dependabot 주간.
- lockfile 커밋, `--frozen-lockfile` 설치.

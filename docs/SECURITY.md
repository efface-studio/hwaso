# SECURITY

우선순위: Security → Data Integrity → Auction Integrity → Payment Integrity → …

## 위협별 대응

| 위협                         | 대응                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **XSS**                      | React 기본 이스케이프. `dangerouslySetInnerHTML` 금지 (JSON-LD 는 `JSON.stringify` 후 `<` 를 `<` 로 치환). 상품 설명·채팅은 순수 텍스트로 저장/렌더 (줄바꿈만 CSS `white-space: pre-wrap`). CSP 는 아래 §HTTP 보안 헤더 — `script-src` 에 `'unsafe-inline'` 이 있어(ISR 유지) XSS 방어는 이스케이프에 기댄다                                                                                                                              |
| **CSRF**                     | API 는 Bearer 토큰 → CSRF 무관. 쿠키 사용 엔드포인트(`/auth/refresh`, `/auth/logout`)만 `SameSite=Lax` + `Origin` 허용 목록 + `X-Requested-With` 커스텀 헤더 요구                                                                                                                                                                                                                                                                         |
| **SQL Injection**            | Prisma 파라미터 바인딩. raw 쿼리는 `$queryRaw` 템플릿 리터럴(자동 바인딩)만, `$queryRawUnsafe` 금지 (lint 규칙)                                                                                                                                                                                                                                                                                                                           |
| **Rate Limit / Brute Force** | Redis 고정 창 (API.md 표). 로그인 계정 잠금, OTP 시도 5회 제한. 현재 비밀번호를 확인하는 비밀번호 변경·탈퇴는 사용자당 10회/10분 — 웹은 재인증 예외라 탈취한 access 토큰으로 비밀번호를 대입하지 못하게 한다. 소켓은 소켓당 이벤트 40개/10초·경매 룸 20개                                                                                                                                                                                 |
| **Token Theft**              | Access 15분·메모리 보관, Refresh httpOnly/SecureStore, rotation + 재사용 탐지 시 family 폐기, 기기 관리에서 원격 로그아웃 — 폐기된 기기의 access 토큰은 즉시 거부. 민감 작업은 재인증(step-up) 필요 (아래 §계정 보안)                                                                                                                                                                                                                     |
| **Privilege Escalation**     | 모든 권한은 서버 Guard. 소유권은 쿼리 조건(`sellerId = me`)으로 강제. 역할 변경은 SUPER_ADMIN 만 + AuditLog. 요청 DTO 는 zod `strict()` — 허용되지 않은 필드(`role`, `status`, `price` 등)는 거부 (mass assignment 방지)                                                                                                                                                                                                                  |
| **IDOR**                     | 주문/채팅/알림/배송지 조회는 항상 `WHERE userId = me` 또는 당사자 검사. cuid 로 추측 난이도 추가                                                                                                                                                                                                                                                                                                                                          |
| **File Upload**              | 크기 30MB, 요청당 1장, 사용자당 60/분. 확장자·Content-Type 불신 → 실제 디코딩 성공한 jpeg/png/webp/heif(HEIC)/avif/gif/tiff 만 허용(gif·tiff 는 첫 장), 픽셀 100MP 상한(decompression bomb), 재인코딩 결과만 공개, 업로드 원본 대신 메타데이터를 지운 보관본만 비공개 저장, EXIF/GPS 제거, 저장 키는 서버 생성(cuid) — 사용자 파일명 사용 안 함, SVG·BMP 불허                                                                             |
| **HEIC Decoder**             | sharp 가 못 푸는 HEVC HEIC 는 `heic-decode`(libheif WASM)로 디코딩. 워커 스레드에서 실행해 이벤트 루프를 막지 않고, 디코딩 전 컨테이너 크기(ispe)로 픽셀 상한 확인, 20초 시간 제한, 프로세스당 동시 2건                                                                                                                                                                                                                                   |
| **Malicious File**           | 재인코딩으로 폴리글랏/스크립트 제거. 공개 객체는 업로드 때 `Content-Type`(재인코딩 결과 형식) + `Content-Disposition: inline` 고정. `X-Content-Type-Options: nosniff` 는 S3 객체 메타데이터로 줄 수 없어 운영 응답에는 아직 없다 — Cloudflare 응답 헤더 규칙으로 `/shop-media/*` 에 붙이는 것을 권장. 인증서 이미지도 작품 사진처럼 본인이 올린 키만 붙일 수 있다(등록·수정)                                                              |
| **개인정보 노출**            | 공개 API 에 이메일·전화·주소 절대 미포함 (응답 DTO select 화이트리스트). 배송지는 주문 당사자만. 입찰자 닉네임 마스킹. 로그에서 `password`, `token`, `authorization`, `cookie`, `x-reauth-token`, 생체 키 `secret`, `phone`, `address` 필드 redact (pino redact). 요청 로그의 URL 쿼리 중 `code`·`state`·`token`·`*_token`·`password`·`secret` 값은 `[redacted]` (OAuth 중계 주소에 code 가 실려 온다). 정산 계좌 AES-256-GCM 암호화 저장 |
| **Payment Tampering**        | 결제 금액은 **서버가 주문에서 계산**. confirm 시 PG 응답 금액 = `Order.totalAmount` 불일치면 즉시 결제 취소 + 주문 FAILED. 웹훅은 서명/PG 재조회로 검증, `providerPaymentKey` unique 로 중복 승인 방지. 결제 확정은 조건부 UPDATE(`status = PAYMENT_PENDING`) 로 멱등                                                                                                                                                                     |
| **Auction Manipulation**     | AUCTION.md: 서버 계산 최소가, 행 잠금, DB 시각, 자기 입찰 금지, 입찰 취소 없음, 미결제 제재, 관리자 조치 AuditLog                                                                                                                                                                                                                                                                                                                         |
| **Race Condition**           | 입찰·즉시구매: `FOR UPDATE`. 재고: `UPDATE Product SET stock = stock - n WHERE id AND stock >= n` 결과 행 수 확인. 쿠폰: `usedCount < usageLimit` 조건부 증가 + `unique(couponId,userId)`. 상태 전이: 조건부 UPDATE. Worker: `SKIP LOCKED`                                                                                                                                                                                                |
| **Open Redirect**            | `next=` 는 `/` 로 시작하는 같은 사이트 경로만 (`apps/web/src/lib/redirect.ts` `safeNext`): `//`·역슬래시·제어 문자(브라우저가 지우는 탭·줄바꿈, `/\t/evil.com` → `//evil.com`)를 거부하고 해석한 주소의 출처를 한 번 더 확인한다. 관리자 배너·전체 알림 링크도 `SITE_PATH`(`//host` 불허). OAuth `redirectUri` 허용 목록                                                                                                                  |
| **SSRF**                     | 서버가 사용자 제공 URL 을 fetch 하지 않는다 (이미지는 업로드만). 예외인 웹 푸시 구독 endpoint 는 브라우저 푸시 서비스 호스트(`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`)의 https·기본 포트만 등록받고(`isAllowedWebPushEndpoint`), 보낼 때 한 번 더 확인·10초 시간 제한. APNs 기기 토큰은 hex 만(요청 경로에 들어간다)                                                       |
| **유해 UGC (App Store 1.2)** | 금칙어(`@shop/shared` `containsProhibited`: NFKC·소문자·보이지 않는 문자 제거·기호/숫자 끼우기·글자 반복·한 글자씩 띄어쓰기 우회 대응, 정상 낱말 허용 목록)로 닉네임·소개·작품·후기·문의·채팅을 400 `PROHIBITED_CONTENT`. 작품·후기·메시지·회원 신고(`POST /reports`), 차단 시 그 회원의 작품·후기·문의를 목록에서 제외. 신고는 24시간 이내 검토(이용약관 제7조)                                                                          |
| **Apple 로그인 토큰**        | 탈퇴·연결 해제 시 revoke 하기 위해 refresh 토큰만 AES-256-GCM 으로 저장. 토큰·authorization code 는 로그에 남기지 않는다. 앱이 보낸 identityToken 은 RS256·iss·aud(번들 ID)·exp 를 검증하고 **1회용**(토큰 해시를 만료까지 Redis 에 표시) — 같은 토큰이 다시 오면 탈취·재전송으로 보고 401                                                                                                                                                |
| **Secrets**                  | `.env` 커밋 금지, `.env.example` 만. 부팅 시 zod 로 필수 환경변수 검증 — 누락 시 기동 실패. 운영 JWT 시크릿 32바이트 이상. 운영(`NODE_ENV=production`)에서 저장소에 공개된 기본값(`dev-only`·`test-`·`e2e-` 로 시작하는 `JWT_SECRET`·`OTP_SECRET`, 한 글자만 반복된 `DATA_ENCRYPTION_KEY`, 두 시크릿이 같은 경우)이면 **기동하지 않는다** (`productionSecretIssues`, 값은 출력하지 않음). 교체 절차는 아래 §비밀값 교체                   |

## 계정 보안

탈취된 access 토큰 하나로 돈이 오가는 작업을 할 수 없게 하고, 사용자가 이상 징후를 볼 수 있게 한다. 구현: `apps/api/src/security`, `apps/api/src/common/auth.ts`.

### 민감 작업 재인증 (step-up)

- 대상(`@RequireReauth()`): 관리자 계정 생성·회원 삭제 `POST /admin/users`·`DELETE /admin/users/:id`, 결제 시작 `POST /orders/:id/payments`, 정산 정보 수정 `PATCH /me/seller`, 비밀번호 변경 `POST /auth/password/change`, 탈퇴 `DELETE /auth/account`, 소셜 연결 `POST /auth/social/:provider`·`POST /auth/social/apple/native`·해제 `DELETE /auth/social/:provider`, 생체 키 등록 `POST /auth/reauth/biometric`. 기존 확인(현재 비밀번호·탈퇴 확인 등)은 그대로 두고 추가로 요구한다.
- 예외: 탈퇴를 **소셜 재인증만으로** 확인하면(본문에 `provider` 와 OAuth 결과·Apple identityToken, 비밀번호·이메일 인증 없음) 그 자체를 재인증으로 본다 — provider 에서 방금 다시 로그인한 결과이고 서버가 이 회원에게 연결된 계정인지 확인한다. 비밀번호도 실제 이메일도 없는 소셜 가입자는 재인증 토큰을 받을 방법이 없기 때문이다 (App Store 5.1.1(v) 앱 안 탈퇴).
- `POST /auth/reauth` 에 비밀번호 · 이메일 OTP(`REAUTH`) · 생체 키 중 하나를 보내면 5분짜리 재인증 토큰(JWT, 기존 서명 키, `typ`·`aud` = `reauth`)을 준다. 토큰은 `sub`(사용자)와 `fam`(기기 세션 family)에 묶이며, Guard 는 헤더 `x-reauth-token` 의 토큰이 **현재 access 토큰의 사용자·family** 와 일치하는지 확인한다. family 로 묶는 이유: access 토큰의 `sid` 는 15분마다 refresh 회전으로 바뀌지만 같은 기기는 같은 family 를 유지한다. 다른 사용자·다른 기기·만료·access 토큰을 넣으면 거부한다. 재인증 토큰은 access 토큰으로 쓸 수 없다(`typ` 불일치).
- 거부 응답은 **403 `REAUTH_REQUIRED`** — 401 은 클라이언트가 토큰 갱신으로 처리하므로 쓰지 않는다. `@shop/api-client` 는 `reauth` 훅으로 본인 확인을 받아 같은 요청을 한 번 다시 보낸다.
- 재인증 실패는 400 `REAUTH_FAILED`(OTP 는 `INVALID_CODE`/`CODE_EXPIRED`/`CODE_ATTEMPTS_EXCEEDED`)이고 `REAUTH_FAILED` 이벤트로 남는다. 시도는 사용자당 10회/10분(429). 비밀번호가 없는 계정도 더미 해시로 같은 시간을 쓴다. 비교는 모두 상수 시간(`timingSafeEqual`, argon2).
- **웹 세션은 현재 제외**한다(`REAUTH_ENFORCED_PLATFORMS = ios·android`). 웹에는 아직 재인증 UI 가 없어 적용하면 웹 결제·설정이 막힌다. 플랫폼은 서버 `Session.platform` 에서 읽으므로 클라이언트가 우회할 수 없다. 웹 재인증 UI 를 만들면 이 예외를 없앤다. 생체 키 등록은 웹에서도 요구한다.
- 결제 승인 `POST /payments/confirm` 은 PG 창을 다녀온 뒤라 5분을 넘길 수 있고 금액은 서버가 주문과 대조하므로 요구하지 않는다.

### 생체 재인증 키

- 발급: 재인증 토큰 필요. secret = 32바이트 난수(base64url), 응답에서 한 번만 준다. DB(`BiometricKey`)에는 SHA-256 만 저장.
- 기기 세션(family)당 1개. refresh 회전에는 유지, 재등록 시 교체, 로그아웃·원격 로그아웃·전체 로그아웃·비밀번호 변경(다른 기기)·탈퇴·재사용 탐지로 family 가 폐기되면 삭제. 다른 기기의 키로는 재인증할 수 없다.

### Access 토큰 즉시 폐기

- access 토큰에 `fam` 클레임을 넣고, family 폐기 시 Redis `auth:revoked:{fam}` 을 15분+60초 동안 둔다. `AuthGuard`·소켓 연결이 매 요청 `EXISTS` 한 번으로 확인한다 (DB 조회 없음).
- **fail-closed**: Redis 에 접속할 수 없으면 인증이 필요한 요청은 실패(5xx)한다. Guard 는 이미 계정 상태 캐시·rate limit 을 Redis 에서 읽고 있어 Redis 장애 시 같은 방식으로 실패하므로, 폐기 확인만 fail-open 으로 두는 것은 보안상 이득 없이 일관성만 해친다.
- 보조 수단: 재인증이 필요한 엔드포인트는 DB 에서 family 가 살아 있는지 한 번 더 확인한다. Redis 표시가 유실되면 일반 요청은 최대 15분 창이 남지만 민감 작업은 막힌다.
- `fam` 이 없는 토큰(이 기능 배포 전 발급)은 폐기 확인을 건너뛴다 — 최대 15분 뒤 모두 만료된다.
- **실시간 소켓**: 연결 전(namespace 미들웨어)에 토큰·family 폐기·계정 상태(정지·탈퇴, HTTP Guard 와 같은 30초 캐시)를 확인하고, 통과한 소켓만 개인 룸 `user:{id}` 과 기기 룸 `fam:{familyId}` 에 넣는다. family 를 폐기하면(로그아웃·원격 로그아웃·비밀번호 변경·정지·탈퇴·재사용 탐지) Redis emitter 로 모든 인스턴스에서 그 기기의 소켓을 끊는다. 소켓은 연결할 때만 토큰을 보므로, 끊지 않으면 폐기 뒤에도 채팅·알림을 계속 받는다.

### 보안 이벤트 (`SecurityEvent`)

- 기록: `LOGIN`, `LOGIN_FAILED`(존재하는 계정만, 응답을 기다리지 않음), `NEW_DEVICE`, `LOGOUT`, `SESSION_REVOKED`, `PASSWORD_CHANGED`, `SETTLEMENT_ACCOUNT_CHANGED`(계좌는 마스킹만), `REAUTH`, `REAUTH_FAILED`, `BIOMETRIC_REGISTERED`, `BIOMETRIC_REMOVED`, `INTEGRITY_WARNING`, `ACCOUNT_LINKED`, `ACCOUNT_UNLINKED`. 기록 실패는 본 업무를 막지 않는다.
- 사용자는 `GET /me/security/events` 로 자기 기록만 본다 (IP 마지막 옥텟 마스킹).
- 새 기기: 이전 로그인 기록이 있는 계정이 90일 안에 쓰지 않은 플랫폼+기기명으로 로그인하면 `NEW_DEVICE` + 인앱·푸시 알림(`SECURITY_NEW_DEVICE`, 끌 수 없는 system 분류) + 메일(`@*.invalid` 주소 제외). 가입 직후 첫 로그인은 알리지 않는다.

### 기기 무결성 (앱)

- 앱이 탈옥·루팅·디버거·후킹·에뮬레이터·변조 신호를 `POST /me/security/integrity` 로 신고한다. **경고만** 한다 — 이용을 막지 않고 `INTEGRITY_WARNING` 을 남긴다. 같은 기기·같은 신호 조합은 24시간에 한 번만 기록(Redis NX). 클라이언트 신호는 우회될 수 있으므로 서버 권한 판단에 쓰지 않는다.

## HTTP 보안 헤더 (API · Web)

- **Web** (`apps/web/next.config.ts` `headers()`): CSP(`default-src 'self'`, `script-src 'self' 'unsafe-inline'` + 토스·포트원·다음 우편번호 호스트, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, https 면 `upgrade-insecure-requests`), HSTS 2년 `includeSubDomains; preload`(https 일 때), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(self)`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`.
  - `'unsafe-inline'` 은 정적 생성(ISR)을 유지하려는 선택이다 — nonce CSP 는 모든 페이지를 동적 렌더링으로 바꾼다. 다음 단계: 동적 페이지(로그인·결제·마이)부터 nonce, `report-to`, 와일드카드 호스트(`*.kakao.com` 등) 축소.
- **API** (`helmet` 기본값 + `Cross-Origin-Resource-Policy: same-site`): HSTS 1년, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: SAMEORIGIN`, 기본 CSP.
- **미디어** (`/shop-media/public/*`, S3 직접): `Content-Type`·`Cache-Control` 만 — `nosniff` 는 Cloudflare 규칙으로 보강 권장 (위 Malicious File).

CORS: 허용 origin 목록(`WEB_ORIGIN`), `credentials: true`. 소켓도 같은 목록.

## OAuth 로그인 CSRF

state 는 서버가 1회용으로 보관하지만 어느 브라우저가 시작했는지는 모른다. 그래서 클라이언트가 시작한 요청의 state 를 기억했다가 돌아온 state 와 대조한다 — 공격자가 자기 계정으로 받은 `code`·`state` 링크를 보내 피해자를 공격자 계정에 로그인시키는 것(로그인 CSRF)을 막는다.

- 웹: `startOAuth` 가 state 를 sessionStorage(탭 단위)에 저장하고 `/auth/callback/:provider` 가 같은 값인지 확인 후 1회 소비한다. Apple `form_post` 도 같은 탭으로 돌아온다.
- 앱: `authorizeInBrowser` 가 `oauthUrl` 응답의 state 와 딥링크로 돌아온 state 를 비교한다 (Android 에서 다른 앱이 `hwaso://auth/callback` 을 보내는 경우).

## 비밀값 교체

- `JWT_SECRET`: 바꾸면 발급된 access·재인증·이메일 인증 토큰이 모두 무효다. refresh 토큰은 DB 의 불투명 토큰이라 유지되므로 앱·웹은 갱신으로 새 access 토큰을 받는다 (재로그인 불필요).
- `OTP_SECRET`: 바꾸면 발송된 인증번호(10분)만 무효.
- `DATA_ENCRYPTION_KEY`(정산 계좌·Apple refresh 토큰): 새 키를 넣고 이전 키를 `DATA_ENCRYPTION_KEY_PREVIOUS` 에 둔 채 재시작 → 같은 env 로 `pnpm exec tsx --env-file=<env> prisma/reencrypt-data-key.ts`(apps/api) → `DATA_ENCRYPTION_KEY_PREVIOUS` 제거 후 재시작. 복호화는 현재 키 → 이전 키 순으로 시도한다(GCM 태그가 맞아야 성공). 시드 자리표시자처럼 어느 키로도 열리지 않는 값은 건드리지 않는다.
- 시드는 운영 DB·운영 환경에서 실행하지 않고, 기본 비밀번호로 최고 관리자를 만들지 않는다 (docs/TESTING.md §시드 안전장치).

## 에러 노출

- 운영: 5xx 응답은 고정 문구 + requestId. 스택·SQL·파일 경로·내부 ID 미노출.
- 개발: 응답 `error.debug` 에 스택 포함 (`NODE_ENV !== 'production'`).
- Prisma 에러는 도메인 에러로 매핑(unique → 409 등) 후 원문 미노출.

## 감사 로그

관리자 모든 변경, 역할 변경, 경매 강제 취소, 주문 강제 상태 변경, 환불, 정산 지급, 계정 정지(기간 포함)/해제·생성·정보 수정·삭제, 서버 로그 열람(`logs.view`, 관리자당 10분에 한 번) → `AuditLog` (append-only, 삭제 API 없음). 기간 정지가 끝나 풀리면 처리자 없이 `user.suspension_expired` 로 남는다.

- 값은 before/after 로 바뀐 것만 남기고 비밀값은 넣지 않는다 — 계정 생성은 임시 비밀번호 대신 `passwordGenerated` 여부만, 삭제는 이메일을 가려서(`ab***@domain`) 남긴다.

## 관리자 권한

- `ADMIN`: 일반 회원(USER·SELLER·VERIFIED_SELLER) 조회·수정·정지·삭제·계정 생성(USER). 관리자 계정은 다룰 수 없고 관리자 역할을 줄 수 없다.
- `SUPER_ADMIN`: 위 + 관리자·최고 관리자 부여/회수, 관리자 계정 수정·정지·삭제, 관리자 계정 생성, 서버 로그 열람.
- 공통: 본인 계정에는 어떤 조치도 할 수 없다. 마지막 활성 SUPER_ADMIN 은 강등·정지·삭제할 수 없다 — 최고 관리자 행을 `FOR UPDATE` 로 잠근 트랜잭션에서 검사해 동시에 서로를 강등해도 한 명은 남고, 처리자의 역할도 DB 에서 다시 확인한다(역할 캐시는 30초까지 늦을 수 있다). 관리자 역할에서 내려가면 모든 기기 세션·생체 키를 폐기하고 상태 캐시를 지워 바로 반영한다.
- 클라이언트(앱·웹)는 할 수 없는 조치·역할을 숨기지만, 판단은 모두 서버가 한다.

## 서버 로그 열람 (관리자 실시간 로그)

- 원천: API 프로세스 안의 링 버퍼(`common/log-buffer.ts`, 기본 1000줄·`LOG_BUFFER_SIZE` 100~5000). pino `hooks.streamWrite` 로 쓰는 줄을 받아 **가린 결과만** 보관한다 — 로그 파일(launchd)을 읽지 않는다. 워커 등 다른 프로세스 로그는 없다.
- 열람: SUPER_ADMIN 만. `GET /admin/logs`(tail) + Socket.IO `/admin-logs`(실시간). 소켓은 연결 때와 30초마다 토큰 만료·family 폐기·DB 역할/상태를 확인해 끊는다. 연결 횟수 사용자당 20회/분, 동시 연결 사용자당 3개·전체 20개, 0.5초 묶음·한 번에 200줄(넘치면 건너뛴 수만), tail 60회/분.
- 가리기(`common/log-redact.ts`):
  - 담는 필드만 고른다: 시각·단계·메시지·context·요청 ID·method·URL·상태·응답 시간·에러 종류/메시지·나머지 단일 값(한 단계 펼침, 최대 20개). **스택(`stack`·`trace`)·요청 헤더는 보내지 않는다.**
  - 키 이름으로 통째로 가림: password·token·secret·authorization·cookie·otp·code·phone·address·bank·account·session·signature·private·credential·apiKey 등 → `[redacted]`. `email` 키는 앞 두 글자만, `ip` 키는 일부만.
  - 모든 문자열: 환경 변수 비밀값(SECRET·KEY·TOKEN·PASSWORD·PRIVATE·DATABASE_URL·REDIS_URL·SMTP_URL 등) → `[env]`, 접속 문자열 계정 정보(`scheme://user:pass@`), `Bearer`/`Basic` 값, JWT(`eyJ…`), URL 쿼리의 token·code·state·password·secret·key·signature·otp·auth·email 값, `password: …`·`token=…` 같은 쌍, `인증번호 123456` → 가림. 이메일 `ab***@domain`, 휴대전화 `010-****-1234`, IPv4 마지막 자리 `1.2.3.*`, IPv6 앞 세 묶음만.
  - 메시지 2000자·필드 300자에서 자르고, 32KB 넘는 줄은 내용 없이 "생략"으로만 남긴다.
- 검색도 가린 뒤의 글자를 대상으로 한다 (가린 값으로는 찾을 수 없다).

사용자 계정 보안 기록(로그인·재인증·계좌 변경 등)은 `SecurityEvent` 에 따로 남긴다 (§계정 보안).

## 의존성

- `pnpm audit --prod` CI 경고, Dependabot 주간.
- lockfile 커밋, `--frozen-lockfile` 설치.

## 앱 보안 (apps/mobile)

- **재인증 창**: 서버가 403 `REAUTH_REQUIRED` 를 주면 api-client 의 `reauth` 훅이 본인 확인 창(`components/reauth-host.tsx`)을 띄운다. 생체 인증 키가 있으면 Face ID 부터, 없으면 비밀번호·이메일 인증번호. 받은 재인증 토큰으로 같은 요청을 다시 보낸다.
- **생체 인증 키**: 설정 → 보안에서 켠다(등록도 재인증 필요). 비밀값은 `requireAuthentication` 키체인 항목(`WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`, 얼굴·지문을 다시 등록하면 무효)에만 두고, 로그아웃하면 지운다.
- **빠른 로그인 (Face ID·지문)**: 비밀번호가 아니라 서버가 만든 1회용 자격(docs/AUTH.md §9)을 같은 생체 인증 보호 키체인 항목에 둔다. 생체 키와 달리 본인 로그아웃 뒤에도 남는다(그게 목적). 원격 로그아웃·다른 기기 전체 로그아웃·비밀번호 변경·재사용 탐지로 폐기된다. 기기 무결성 위험이 보이면 켜지 않는다.
- **자동 로그인 끔**: 다음 실행 때 저장된 refresh 토큰으로 서버 로그아웃(푸시 토큰 포함)을 보내고 지운다 (docs/AUTH.md §12).
- **키체인**: 일반 항목은 `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (백업·기기 이전으로 옮겨지지 않음). 예전 항목은 읽을 때 옮긴다. Android `allowBackup: false`.
- **TLS 피닝** (`plugins/with-tls-pinning.ts`): API·미디어·웹 도메인에 Cloudflare 가 쓰는 루트·중간 CA 의 SPKI SHA-256 을 고정한다 — iOS ATS `NSPinnedDomains`, Android network security config(만료 2027-12-31, 지나면 고정 해제). 네이티브 설정이라 **OTA 로 바꿀 수 없다** — CA 를 바꾸면 스토어 빌드가 먼저 나가야 한다. 핀 목록은 `app.config.ts` 주석 참고.
- **변조 탐지** (`modules/device-integrity`): 탈옥·루팅·디버거·후킹(Frida 등)·변조(번들 ID·서명 인증서)를 확인해 **경고만** 한다(사용은 막지 않음). 에뮬레이터는 알리지도 기록하지도 않는다. 위험 신호는 `POST /me/security/integrity` 로 보안 기록에 남는다. Android 서명 검사는 `ANDROID_SIGNING_CERT_SHA256`(Play 앱 서명 키 지문) 을 넣어야 켜진다.
- **화면 보호**: 앱 전환 화면은 가림 화면(`components/privacy-shield.tsx`)으로 덮는다. 정산 계좌·비밀번호·주문(입금 계좌)·보안 화면은 캡처·화면 녹화를 막는다(`useScreenGuard`). 입금 계좌번호는 복사 2분 뒤 클립보드에서 지운다.

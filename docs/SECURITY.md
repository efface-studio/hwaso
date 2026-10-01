# SECURITY

우선순위: Security → Data Integrity → Auction Integrity → Payment Integrity → …

## 위협별 대응

| 위협                         | 대응                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **XSS**                      | React 기본 이스케이프. `dangerouslySetInnerHTML` 금지 (JSON-LD 는 `JSON.stringify` 후 `<` 를 `<` 로 치환). 상품 설명·채팅은 순수 텍스트로 저장/렌더 (줄바꿈만 CSS `white-space: pre-wrap`). CSP: `default-src 'self'; img-src 'self' data: <CDN>; connect-src 'self' <API> <WS>; frame-src <PG>; object-src 'none'; base-uri 'self'`                             |
| **CSRF**                     | API 는 Bearer 토큰 → CSRF 무관. 쿠키 사용 엔드포인트(`/auth/refresh`, `/auth/logout`)만 `SameSite=Lax` + `Origin` 허용 목록 + `X-Requested-With` 커스텀 헤더 요구                                                                                                                                                                                                |
| **SQL Injection**            | Prisma 파라미터 바인딩. raw 쿼리는 `$queryRaw` 템플릿 리터럴(자동 바인딩)만, `$queryRawUnsafe` 금지 (lint 규칙)                                                                                                                                                                                                                                                  |
| **Rate Limit / Brute Force** | Redis 고정 창 (API.md 표). 로그인 계정 잠금, OTP 시도 5회 제한                                                                                                                                                                                                                                                                                                   |
| **Token Theft**              | Access 15분·메모리 보관, Refresh httpOnly/SecureStore, rotation + 재사용 탐지 시 family 폐기, 기기 관리에서 원격 로그아웃 — 폐기된 기기의 access 토큰은 즉시 거부. 민감 작업은 재인증(step-up) 필요 (아래 §계정 보안)                                                                                                                                            |
| **Privilege Escalation**     | 모든 권한은 서버 Guard. 소유권은 쿼리 조건(`sellerId = me`)으로 강제. 역할 변경은 SUPER_ADMIN 만 + AuditLog. 요청 DTO 는 zod `strict()` — 허용되지 않은 필드(`role`, `status`, `price` 등)는 거부 (mass assignment 방지)                                                                                                                                         |
| **IDOR**                     | 주문/채팅/알림/배송지 조회는 항상 `WHERE userId = me` 또는 당사자 검사. cuid 로 추측 난이도 추가                                                                                                                                                                                                                                                                 |
| **File Upload**              | 크기 30MB, 요청당 1장, 사용자당 60/분. 확장자·Content-Type 불신 → 실제 디코딩 성공한 jpeg/png/webp/heif(HEIC)/avif/gif/tiff 만 허용(gif·tiff 는 첫 장), 픽셀 100MP 상한(decompression bomb), 재인코딩 결과만 공개 (원본 비공개), EXIF/GPS 제거, 저장 키는 서버 생성(cuid) — 사용자 파일명 사용 안 함, SVG·BMP 불허                                               |
| **HEIC Decoder**             | sharp 가 못 푸는 HEVC HEIC 는 `heic-decode`(libheif WASM)로 디코딩. 워커 스레드에서 실행해 이벤트 루프를 막지 않고, 디코딩 전 컨테이너 크기(ispe)로 픽셀 상한 확인, 20초 시간 제한, 프로세스당 동시 2건                                                                                                                                                          |
| **Malicious File**           | 재인코딩으로 폴리글랏/스크립트 제거. 공개 버킷은 `Content-Type` 고정 + `X-Content-Type-Options: nosniff` + `Content-Disposition: inline`                                                                                                                                                                                                                         |
| **개인정보 노출**            | 공개 API 에 이메일·전화·주소 절대 미포함 (응답 DTO select 화이트리스트). 배송지는 주문 당사자만. 입찰자 닉네임 마스킹. 로그에서 `password`, `token`, `authorization`, `cookie`, `x-reauth-token`, 생체 키 `secret`, `phone`, `address` 필드 redact (pino redact). 정산 계좌 AES-256-GCM 암호화 저장                                                              |
| **Payment Tampering**        | 결제 금액은 **서버가 주문에서 계산**. confirm 시 PG 응답 금액 = `Order.totalAmount` 불일치면 즉시 결제 취소 + 주문 FAILED. 웹훅은 서명/PG 재조회로 검증, `providerPaymentKey` unique 로 중복 승인 방지. 결제 확정은 조건부 UPDATE(`status = PAYMENT_PENDING`) 로 멱등                                                                                            |
| **Auction Manipulation**     | AUCTION.md: 서버 계산 최소가, 행 잠금, DB 시각, 자기 입찰 금지, 입찰 취소 없음, 미결제 제재, 관리자 조치 AuditLog                                                                                                                                                                                                                                                |
| **Race Condition**           | 입찰·즉시구매: `FOR UPDATE`. 재고: `UPDATE Product SET stock = stock - n WHERE id AND stock >= n` 결과 행 수 확인. 쿠폰: `usedCount < usageLimit` 조건부 증가 + `unique(couponId,userId)`. 상태 전이: 조건부 UPDATE. Worker: `SKIP LOCKED`                                                                                                                       |
| **Open Redirect**            | `next=` 파라미터는 `/` 로 시작하고 `//` 가 아닌 상대 경로만. OAuth `redirectUri` 허용 목록                                                                                                                                                                                                                                                                       |
| **SSRF**                     | 서버가 사용자 제공 URL 을 fetch 하지 않는다 (이미지는 업로드만)                                                                                                                                                                                                                                                                                                  |
| **유해 UGC (App Store 1.2)** | 금칙어(`@shop/shared` `containsProhibited`: NFKC·소문자·보이지 않는 문자 제거·기호/숫자 끼우기·글자 반복·한 글자씩 띄어쓰기 우회 대응, 정상 낱말 허용 목록)로 닉네임·소개·작품·후기·문의·채팅을 400 `PROHIBITED_CONTENT`. 작품·후기·메시지·회원 신고(`POST /reports`), 차단 시 그 회원의 작품·후기·문의를 목록에서 제외. 신고는 24시간 이내 검토(이용약관 제7조) |
| **Apple 로그인 토큰**        | 탈퇴·연결 해제 시 revoke 하기 위해 refresh 토큰만 AES-256-GCM 으로 저장. 토큰·authorization code 는 로그에 남기지 않는다                                                                                                                                                                                                                                         |
| **Secrets**                  | `.env` 커밋 금지, `.env.example` 만. 부팅 시 zod 로 필수 환경변수 검증 — 누락 시 기동 실패. 운영 JWT 시크릿 32바이트 이상                                                                                                                                                                                                                                        |

## 계정 보안

탈취된 access 토큰 하나로 돈이 오가는 작업을 할 수 없게 하고, 사용자가 이상 징후를 볼 수 있게 한다. 구현: `apps/api/src/security`, `apps/api/src/common/auth.ts`.

### 민감 작업 재인증 (step-up)

- 대상(`@RequireReauth()`): 결제 시작 `POST /orders/:id/payments`, 정산 정보 수정 `PATCH /me/seller`, 비밀번호 변경 `POST /auth/password/change`, 탈퇴 `DELETE /auth/account`, 소셜 연결 `POST /auth/social/:provider`·`POST /auth/social/apple/native`·해제 `DELETE /auth/social/:provider`, 생체 키 등록 `POST /auth/reauth/biometric`. 기존 확인(현재 비밀번호·탈퇴 확인 등)은 그대로 두고 추가로 요구한다.
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

### 보안 이벤트 (`SecurityEvent`)

- 기록: `LOGIN`, `LOGIN_FAILED`(존재하는 계정만, 응답을 기다리지 않음), `NEW_DEVICE`, `LOGOUT`, `SESSION_REVOKED`, `PASSWORD_CHANGED`, `SETTLEMENT_ACCOUNT_CHANGED`(계좌는 마스킹만), `REAUTH`, `REAUTH_FAILED`, `BIOMETRIC_REGISTERED`, `BIOMETRIC_REMOVED`, `INTEGRITY_WARNING`, `ACCOUNT_LINKED`, `ACCOUNT_UNLINKED`. 기록 실패는 본 업무를 막지 않는다.
- 사용자는 `GET /me/security/events` 로 자기 기록만 본다 (IP 마지막 옥텟 마스킹).
- 새 기기: 이전 로그인 기록이 있는 계정이 90일 안에 쓰지 않은 플랫폼+기기명으로 로그인하면 `NEW_DEVICE` + 인앱·푸시 알림(`SECURITY_NEW_DEVICE`, 끌 수 없는 system 분류) + 메일(`@*.invalid` 주소 제외). 가입 직후 첫 로그인은 알리지 않는다.

### 기기 무결성 (앱)

- 앱이 탈옥·루팅·디버거·후킹·에뮬레이터·변조 신호를 `POST /me/security/integrity` 로 신고한다. **경고만** 한다 — 이용을 막지 않고 `INTEGRITY_WARNING` 을 남긴다. 같은 기기·같은 신호 조합은 24시간에 한 번만 기록(Redis NX). 클라이언트 신호는 우회될 수 있으므로 서버 권한 판단에 쓰지 않는다.

## HTTP 보안 헤더 (API · Web)

`helmet` (API), Next `headers()` (Web): HSTS(운영), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`(PG iframe 제외), `Permissions-Policy: camera=(), geolocation=()`.

CORS: 허용 origin 목록(`WEB_ORIGIN`), `credentials: true`.

## 에러 노출

- 운영: 5xx 응답은 고정 문구 + requestId. 스택·SQL·파일 경로·내부 ID 미노출.
- 개발: 응답 `error.debug` 에 스택 포함 (`NODE_ENV !== 'production'`).
- Prisma 에러는 도메인 에러로 매핑(unique → 409 등) 후 원문 미노출.

## 감사 로그

관리자 모든 변경, 역할 변경, 경매 강제 취소, 주문 강제 상태 변경, 환불, 정산 지급, 계정 정지/탈퇴 → `AuditLog` (append-only, 삭제 API 없음).

사용자 계정 보안 기록(로그인·재인증·계좌 변경 등)은 `SecurityEvent` 에 따로 남긴다 (§계정 보안).

## 의존성

- `pnpm audit --prod` CI 경고, Dependabot 주간.
- lockfile 커밋, `--frozen-lockfile` 설치.

## 앱 보안 (apps/mobile)

- **재인증 창**: 서버가 403 `REAUTH_REQUIRED` 를 주면 api-client 의 `reauth` 훅이 본인 확인 창(`components/reauth-host.tsx`)을 띄운다. 생체 인증 키가 있으면 Face ID 부터, 없으면 비밀번호·이메일 인증번호. 받은 재인증 토큰으로 같은 요청을 다시 보낸다.
- **생체 인증 키**: 설정 → 보안에서 켠다(등록도 재인증 필요). 비밀값은 `requireAuthentication` 키체인 항목(`WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`, 얼굴·지문을 다시 등록하면 무효)에만 두고, 로그아웃하면 지운다.
- **키체인**: 일반 항목은 `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (백업·기기 이전으로 옮겨지지 않음). 예전 항목은 읽을 때 옮긴다. Android `allowBackup: false`.
- **TLS 피닝** (`plugins/with-tls-pinning.ts`): API·미디어·웹 도메인에 Cloudflare 가 쓰는 루트·중간 CA 의 SPKI SHA-256 을 고정한다 — iOS ATS `NSPinnedDomains`, Android network security config(만료 2027-12-31, 지나면 고정 해제). 네이티브 설정이라 **OTA 로 바꿀 수 없다** — CA 를 바꾸면 스토어 빌드가 먼저 나가야 한다. 핀 목록은 `app.config.ts` 주석 참고.
- **변조 탐지** (`modules/device-integrity`): 탈옥·루팅·디버거·후킹(Frida 등)·변조(번들 ID·서명 인증서)를 확인해 **경고만** 한다(사용은 막지 않음). 에뮬레이터는 알리지도 기록하지도 않는다. 위험 신호는 `POST /me/security/integrity` 로 보안 기록에 남는다. Android 서명 검사는 `ANDROID_SIGNING_CERT_SHA256`(Play 앱 서명 키 지문) 을 넣어야 켜진다.
- **화면 보호**: 앱 전환 화면은 가림 화면(`components/privacy-shield.tsx`)으로 덮는다. 정산 계좌·비밀번호·주문(입금 계좌)·보안 화면은 캡처·화면 녹화를 막는다(`useScreenGuard`). 입금 계좌번호는 복사 2분 뒤 클립보드에서 지운다.

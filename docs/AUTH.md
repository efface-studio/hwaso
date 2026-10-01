# AUTH

## 1. 토큰 모델

| 토큰         | 형식                             | 수명            | 저장 위치                                                                                         |
| ------------ | -------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| Access       | JWT HS256 `{sub, role, sid}`     | 15분            | Web: 메모리(Zustand) · Mobile: 메모리                                                             |
| Refresh      | 불투명 랜덤 32바이트 (base64url) | 30일 (슬라이딩) | Web: `httpOnly Secure SameSite=Lax` 쿠키 `rt` (Path `/api/v1/auth`) · Mobile: `expo-secure-store` |
| Verification | JWT `{email, purpose}`           | 10분            | 클라이언트 메모리 (가입/재설정 단계 사이 전달)                                                    |

- DB 에는 refresh 토큰의 **SHA-256 해시만** 저장 (`Session.refreshTokenHash`).
- **Refresh Rotation**: `/auth/refresh` 마다 새 토큰 발급, 이전 토큰 무효. 이미 회전된(폐기된) 토큰이 다시 오면 **재사용 탐지** → 해당 `familyId` 전체 세션 폐기 (토큰 탈취 대응).
- Access 토큰 검증 시 `sid` 의 세션이 폐기됐는지는 확인하지 않는다 (15분 창 허용). 대신 권한 변경·정지·비밀번호 변경 시 세션 전부 폐기 + 계정 상태는 매 요청 Guard 에서 캐시(30s) 확인.
- Web 새로고침 시: 앱 부팅 → `/auth/refresh` (쿠키) → access 획득. SSR 페이지는 공개 데이터만 렌더하고 사용자 데이터는 클라이언트에서 조회.

## 2. 비밀번호

- argon2id (memoryCost 19MiB, timeCost 2, parallelism 1).
- 정책: 8~72자, 영문+숫자 포함. 이메일과 동일 불가. (zod 스키마 `passwordSchema` 공유)
- 로그인 실패: 동일 메시지 "이메일 또는 비밀번호가 올바르지 않습니다." (계정 존재 여부 비노출). 존재하지 않는 계정에도 더미 해시 검증으로 응답 시간 평준화.
- 계정당 실패 10회/15분 → 15분 잠금, IP 당 20회/분.

## 3. 이메일 인증 (OTP)

- 6자리 숫자, 10분 유효, 시도 5회, 재발송 60초 간격 / 시간당 5회.
- DB 에는 `codeHash`(HMAC-SHA256, 서버 시크릿) 만 저장.
- 발송은 `MailProvider` (개발: Mailpit SMTP, 운영: SMTP/SES). 개발 환경에서는 로그에도 코드 출력.
- `SIGNUP` 발송 시 이미 가입된 이메일이어도 같은 응답 (계정 열거 방지) — 대신 메일 본문에 "이미 가입된 계정" 안내.

## 4. 가입 UX (최소 입력)

```
이메일 입력 → 인증코드 6자리 → 비밀번호 → 닉네임(+선택: 프로필 사진) → 완료(자동 로그인)
```

- 약관 동의는 비밀번호 단계에 필수 체크 3개(서비스 이용약관 · 개인정보 수집·이용 · 만 14세 이상)와 선택 마케팅 수신. `signupSchema` 의 `agreeTerms`·`agreePrivacy`·`ageOver14` 는 모두 `literal(true)` 이다 (§11).
- 판매자 정보(정산 계좌)는 **첫 상품 등록 시** 요청한다. 가입 단계에서 묻지 않는다.

## 5. 소셜 로그인

| Provider | 방식                                                    | 필요 설정                                                                                                                                   |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Google   | OAuth 2.0 Authorization Code + PKCE, OIDC id_token 검증 | `GOOGLE_CLIENT_ID/SECRET`                                                                                                                   |
| Apple    | Sign in with Apple, id_token(JWKS) 검증, `form_post`    | 웹: `APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY`, iOS 네이티브: `APPLE_BUNDLE_ID` (+ 토큰 폐기용 `APPLE_SIGNIN_KEY_ID/TEAM_ID/PRIVATE_KEY`) |
| Kakao    | OAuth 2.0 Code → `/v2/user/me`                          | `KAKAO_CLIENT_ID/SECRET`                                                                                                                    |
| Naver    | OAuth 2.0 Code (+state) → `/v1/nid/me`                  | `NAVER_CLIENT_ID/SECRET`                                                                                                                    |

흐름 (Web·Mobile 공통, 서버가 code 교환):

1. `GET /auth/oauth/:provider/url?redirectUri=` → 서버가 `state`(Redis 10분, redirectUri 바인딩) 생성 후 인가 URL 반환. `redirectUri` 는 허용 목록만.
2. 사용자 인증 → provider 가 `redirectUri?code&state` 로 복귀 (Web: `/auth/callback/:provider`, Mobile: API 중계 `/auth/oauth/:provider/redirect` → `hwaso://auth/callback` via `expo-web-browser`, iOS Apple 은 네이티브 Sign in with Apple)
3. `POST /auth/oauth/:provider/callback {code, state, redirectUri}` → 서버가 state 1회 소비 검증 → 토큰 교환 → 사용자 정보 조회
4. `SocialAccount(provider, providerUserId)` 있으면 로그인. 없으면:
   - provider 가 **검증된 이메일**을 주고 같은 이메일의 계정이 있으면 → 연결하지 않고 `ACCOUNT_EXISTS` (이메일 로그인 후 설정에서 연결하도록 안내. 계정 탈취 방지)
   - 없으면 신규 가입 (emailVerifiedAt = provider 검증 시각, 닉네임은 provider 이름으로 자동 생성). 이메일을 주지 않는 provider(카카오 동의 미선택 등)는 임시 주소 `<provider>+<id>@social.invalid`(`SOCIAL_PLACEHOLDER_EMAIL_DOMAIN`)를 넣고 `MeDto.emailMissing = true`. 약관 동의는 기록하지 않는다 → `consentRequired: true` 로 가입 마무리 화면을 거친다 (§11)

환경 변수가 없는 provider 는 `/auth/providers` 응답에서 제외되어 버튼이 표시되지 않는다.

iOS 앱의 Apple 로그인은 웹 OAuth 가 아니라 시스템 Sign in with Apple 이다. 앱이 받은 `identityToken` 을 `POST /auth/oauth/apple/native` 로 보내면 서버가 Apple 공개키로 검증하며, 토큰 대상(aud)이 `APPLE_BUNDLE_ID`(앱 번들 ID, `app.config.ts` 의 `ios.bundleIdentifier`)여야 한다. 그래서 웹 키가 없어도 `APPLE_BUNDLE_ID` 만 있으면 `/auth/providers` 의 `appleNative` 가 `true` 가 되어 iOS 앱에 버튼이 보인다. 개발 모드에서는 Expo Go 로 실행한 토큰(aud `host.exp.Exponent`)도 허용한다. Apple Developer 에서 해당 App ID 에 Sign in with Apple 기능을 켜야 한다.

### Apple 토큰 폐기 (App Store 5.1.1(v))

- iOS 앱은 `identityToken` 과 함께 1회용 `authorizationCode` 를 보낸다(로그인·연결·탈퇴 확인). 서버는 `https://appleid.apple.com/auth/token` 에 `client_id = APPLE_BUNDLE_ID`, `client_secret = ES256 JWT(iss 팀 ID, sub 번들 ID, aud https://appleid.apple.com, 5분)` 로 교환해 받은 `refresh_token` 을 `SocialAccount.refreshTokenEnc`(AES-256-GCM, 정산 계좌와 같은 `common/crypto.encrypt`)와 `tokenClientId` 에 저장한다. 웹 OAuth 는 코드 교환 응답의 `refresh_token` 을 같은 방식으로 저장한다 (`tokenClientId = APPLE_CLIENT_ID`).
- 탈퇴와 Apple 연결 해제 시 `https://appleid.apple.com/auth/revoke` (`token_type_hint=refresh_token`) 로 폐기한다. 저장된 토큰이 없으면(도입 전 가입자) 건너뛰고, 실패는 로그만 남기며 탈퇴·해제를 막지 않는다. 토큰·코드는 로그에 남기지 않는다.
- 서명 키: 번들 ID 는 `APPLE_SIGNIN_*` → `APNS_*` → `APPLE_TEAM_ID/KEY_ID/PRIVATE_KEY` 순, 웹 서비스 ID 는 `APPLE_*` 를 먼저 쓴다. 키는 Apple Developer 에서 Sign in with Apple 이 켜진 .p8 이어야 한다. 개인키의 `\n` 은 줄바꿈으로 바꾼다.
- 외부 호출은 `AppleAuthClient`(`apps/api/src/auth/apple.client.ts`)에 모아 테스트에서 교체한다.

## 6. 세션 · 기기 관리

- 로그인/가입/소셜 시 `device: {name, platform}` 전달 → `Session` 1행.
- `GET /auth/sessions` : 기기명, 플랫폼, IP(마지막 옥텟 마스킹), 마지막 사용, 현재 기기 표시.
- 개별/전체 로그아웃, 비밀번호 변경·재설정 시 전체 세션 폐기.
- 만료 세션은 Worker 가 매일 정리.

## 7. 탈퇴

- 확인: 비밀번호, 이메일 OTP(`DELETE_ACCOUNT`), 또는 **소셜 재인증** — 로그인과 같은 OAuth 결과(`{provider, code, state, redirectUri}`, iOS Apple 은 `{provider: 'apple', identityToken, authorizationCode?}`)의 계정이 이 회원에게 연결돼 있어야 한다. 비밀번호도 실제 이메일도 없는 소셜 가입자(`…@social.invalid`)는 이 방법으로 탈퇴한다.
- 경로: 앱 마이 › 설정 › 회원 탈퇴, 웹 마이 › 설정. 로그인 없이 볼 수 있는 안내는 웹 `/account-deletion` (Google Play 데이터 삭제 URL).
- 탈퇴는 필수 동의(§11) 전에도 할 수 있다.
- 차단 조건: 진행 중 주문(결제~배송), LIVE 경매 판매/최고 입찰 중 → 409 + 안내.
- 처리: `User.status=DELETED`, email → `deleted+{id}@invalid`, passwordHash null, 프로필 익명화("탈퇴한 사용자"), 마케팅 동의 철회, 소셜 연결·세션·푸시 토큰 삭제, Apple 토큰 revoke. 주문/리뷰/입찰 기록은 거래 무결성과 법적 보관 의무로 익명 상태로 유지.

## 8. 권한 (RBAC)

| Role            | 가능                                   |
| --------------- | -------------------------------------- |
| USER            | 탐색, 구매, 입찰, 채팅, 리뷰, 신고     |
| SELLER          | + 상품/경매 등록, 판매 관리, 정산 조회 |
| VERIFIED_SELLER | + 인증 배지, 고가 경매(1억 이상) 등록  |
| ADMIN           | + 관리자 기능 (역할 부여 제외)         |
| SUPER_ADMIN     | + ADMIN 부여/회수, 정책 변경           |

- 서버: `@Roles()` 데코레이터 + `RolesGuard`, 리소스 소유권은 서비스 계층에서 `WHERE sellerId = currentUser` 로 강제.
- 클라이언트의 버튼 숨김은 UX 일 뿐 보안이 아니다.
- 모든 USER 는 판매자 등록(`POST /me/seller`) 으로 SELLER 가 될 수 있다.

## 9. 생체 인증 (Mobile)

- 설정에서 켜면 앱 실행/포그라운드 복귀 시 `expo-local-authentication` 으로 잠금 해제 후 SecureStore 의 refresh 토큰 사용.
- 서버 인증 방식 변화 없음 (로컬 잠금).

## 10. 공개 데모 모드

`DEMO_ACCOUNTS` 환경 변수(JSON 배열 `{ login, password, role, nickname? }`)가 있으면 데모 모드로 동작한다 (`apps/api/src/auth/demo.ts`). 계정 정보는 서버 환경 변수로만 두고 저장소에 커밋하지 않는다.

- 부팅 시 지정 계정을 만들거나 비밀번호·역할을 맞춘다. 판매자 역할은 데모용 정산 계좌(Seller)를 함께 만든다.
- 지정 계정만 로그인한다. 로그인 아이디는 이메일 형식이 아니어도 된다 (`loginIdSchema`).
- 누구나 아는 계정이므로 로그인 실패 잠금을 쓰지 않는다 (IP 단위 rate limit 은 유지).
- 가입·OTP·비밀번호 재설정/변경·탈퇴·소셜 로그인/연결·판매자 등록/수정은 `DEMO_DISABLED`(403).
- 실제 결제가 일어나지 않게 운영 모드에서도 모의 결제를 쓴다.

## 11. 필수 동의 (이용약관 · 개인정보 · 만 14세)

- `User.termsAgreedAt`·`privacyAgreedAt`·`ageConfirmedAt` 중 하나라도 비어 있으면 `MeDto.consentRequired = true`.
- 이메일 가입은 가입 요청에서 세 동의를 받아 즉시 기록한다. 소셜 첫 가입은 기록하지 않아 동의 화면(앱 `app/consent.tsx`, 웹 동의 페이지)을 거친다. `POST /me/consent {terms, privacy, ageOver14, marketing}` 가 기록하고 MeDto 를 돌려준다.
- **가입 마무리** (소셜 첫 가입): 동의 화면(앱 `app/consent.tsx`, 웹 `/consent`)에서 이메일·닉네임도 함께 받는다.
  - 이메일: provider 가 준 이메일을 채워 둔다. 그대로 쓰면 인증이 필요 없고, 없거나(`emailMissing`) 바꾸면 인증번호(`purpose=SIGNUP`)로 확인해 `emailVerificationToken` 을 함께 보낸다. 서버는 토큰을 1회 소비하고, 다른 계정이 쓰는 이메일이면 `409 ACCOUNT_EXISTS`(details.fields.email), 아니면 이메일을 바꾸고 `emailVerifiedAt` 을 기록한다.
  - 필수 동의 전이고 이메일이 임시 주소인데 토큰이 없으면 `400 VALIDATION_FAILED`("이메일을 입력해주세요.", details.fields.email). 이미 동의한 회원(마케팅 수신 변경 등)은 강제하지 않는다.
  - 닉네임: provider 이름으로 만든 닉네임을 채워 두고 고칠 수 있다. 바뀌었을 때만 `nickname` 을 보내며 금칙어(`PROHIBITED_CONTENT`)·중복(`409 NICKNAME_TAKEN`)을 검사한다. 닉네임 검사를 통과한 뒤에 이메일 토큰을 소비한다.
  - 검사를 모두 통과하면 동의·이메일·닉네임을 한 트랜잭션으로 기록한다. 실패하면 동의도 기록되지 않는다.
- **가입 축하** (`WELCOME`): 가입이 끝나는 순간 회원마다 한 번 알림(알림함 + 푸시, 링크 `/`)을 보낸다 — 이메일 가입은 가입 직후, 소셜 가입은 `POST /me/consent` 로 필수 동의가 처음 채워질 때. 이미 동의한 회원의 재요청(마케팅 수신 변경)은 보내지 않고, 이미 받은 회원은 건너뛴다 (동시 요청은 Redis 잠금 `notify:welcome:{id}` 60초). 운영 알림(system)이라 알림 설정으로 끌 수 없고 방해 금지 시간에는 푸시만 보류한다. 앱은 같은 순간 가입 축하 팝업(`WelcomeHost`)을 띄운다.
- 화면은 임시 주소를 보이지 않는다 (`emailMissing` 이면 이메일 대신 '소셜 계정' 표시 또는 생략).
- 동의 전에는 읽기만 된다. 로그인이 필요한 쓰기 요청은 전역 `AuthGuard` 가 `403 CONSENT_REQUIRED` 로 막는다. 예외는 `@ConsentExempt()` — `AuthController` 전체(로그아웃·기기·비밀번호·소셜·탈퇴), `POST /me/consent`, `DELETE /me/push-tokens`. 동의 여부는 계정 상태 캐시(`user:status:{id}` = `상태:역할:동의(0/1)`, 30초)에 함께 두고 동의 시 무효화한다.
- 마케팅(광고성 정보) 수신: `marketingOptIn` + 동의 시각 `marketingAgreedAt`. `POST /me/consent` 를 다시 보내 동의·철회한다 (필수 동의 시각은 처음 값을 유지). 광고성 전체 알림은 동의자에게만, 제목 `(광고)`, 21~8시(KST)에는 푸시하지 않는다 (docs/API.md Admin).
- 마이그레이션 `20261002000000_store_review` 가 기존 가입자의 `privacyAgreedAt`·`ageConfirmedAt` 을 `termsAgreedAt` 으로 채운다 — 약관 동의 기록이 없는 계정(시드 등)만 다음 로그인 때 동의 화면을 본다.
- 만 14세 미만은 가입할 수 없다 (개인정보 보호법 제22조의2 법정대리인 동의 절차를 두지 않는다).

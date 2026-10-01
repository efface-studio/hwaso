# AUTH

## 1. 토큰 모델

| 토큰         | 형식                               | 수명            | 저장 위치                                                                                         |
| ------------ | ---------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| Access       | JWT HS256 `{sub, role, sid, fam}`  | 15분            | Web: 메모리(Zustand) · Mobile: 메모리                                                             |
| Refresh      | 불투명 랜덤 32바이트 (base64url)   | 30일 (슬라이딩) | Web: `httpOnly Secure SameSite=Lax` 쿠키 `rt` (Path `/api/v1/auth`) · Mobile: `expo-secure-store` |
| Verification | JWT `{email, purpose}`             | 10분            | 클라이언트 메모리 (가입/재설정 단계 사이 전달)                                                    |
| Reauth       | JWT `{sub, sid, fam}` aud `reauth` | 5분             | 클라이언트 메모리. 민감 작업 요청의 `x-reauth-token` 헤더 (docs/SECURITY.md §계정 보안)           |
| Quick login  | 불투명 랜덤 32바이트 (base64url)   | 90일 (슬라이딩) | Mobile 전용: 생체 인증 보호 키체인 항목. 쓸 때마다 교체 (§9 빠른 로그인)                          |

- 로그인 유지 선택(§12): 앱 "자동 로그인"을 끄면 refresh 토큰을 다음 실행 때 서버 로그아웃과 함께 폐기하고, 웹 "로그인 상태 유지"를 끄면 `rt` 를 만료 없는 세션 쿠키로 굽는다.

- DB 에는 refresh 토큰의 **SHA-256 해시만** 저장 (`Session.refreshTokenHash`).
- **Refresh Rotation**: `/auth/refresh` 마다 새 토큰 발급, 이전 토큰 무효. 이미 회전된(폐기된) 토큰이 다시 오면 **재사용 탐지** → 해당 `familyId` 전체 세션 폐기 (토큰 탈취 대응).
- `fam` 은 세션 family(기기) ID. 로그아웃·원격 로그아웃·비밀번호 변경/재설정·정지·재사용 탐지로 family 를 폐기하면 Redis 에 `auth:revoked:{fam}` 을 access 토큰 수명(15분+60초) 동안 표시하고, Guard 가 매 요청 확인해 **폐기된 기기의 access 토큰을 즉시 거부**한다(401 `INVALID_TOKEN`). refresh 회전은 같은 family 라 표시하지 않는다. 계정 상태는 매 요청 Guard 에서 캐시(30s) 확인.
- 재인증이 필요한 엔드포인트는 추가로 DB 에서 family 가 살아 있는지 확인한다 (Redis 표시가 유실돼도 민감 작업은 막힌다).
- Web 새로고침 시: 앱 부팅 → `/auth/refresh` (쿠키) → access 획득. SSR 페이지는 공개 데이터만 렌더하고 사용자 데이터는 클라이언트에서 조회.

## 2. 비밀번호

- argon2id (memoryCost 19MiB, timeCost 2, parallelism 1).
- 정책: 8~72자, 영문+숫자 포함. 이메일과 동일 불가. (zod 스키마 `passwordSchema` 공유)
- 로그인 실패: 동일 메시지 "이메일 또는 비밀번호가 올바르지 않습니다." (계정 존재 여부 비노출). 존재하지 않는 계정에도 더미 해시 검증으로 응답 시간 평준화.
- 계정당 실패 10회/15분 → 15분 잠금, IP 당 20회/분.

## 3. 이메일 인증 (OTP)

- 6자리 숫자, 10분 유효, 시도 5회, 재발송 60초 간격 / 시간당 5회.
- 목적: `SIGNUP`, `RESET_PASSWORD`, `DELETE_ACCOUNT` (공개 `send-code`) · `REAUTH` (로그인 사용자 전용 `POST /auth/reauth/code`, 계정 이메일로만 발송 — 공개 엔드포인트로는 요청 불가).
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
- 개별/전체 로그아웃, 비밀번호 변경·재설정 시 전체 세션 폐기. 폐기된 기기는 access 토큰도 즉시 거부되고 그 기기의 생체 재인증 키도 삭제된다.
- 빠른 로그인 자격(§9)은 family 폐기와 함께 지운다 — 원격 로그아웃(`DELETE /auth/sessions/:id`)·다른 기기 전체 로그아웃(현재 기기 것은 남김)·재사용 탐지·정지·탈퇴·비밀번호 재설정. **본인이 그 기기에서 로그아웃(`POST /auth/logout`)할 때만 남긴다** (로그아웃한 뒤 Face ID 로 다시 들어오는 기능). 비밀번호 변경은 현재 기기 것까지 모두 지운다.
- 로그인·가입·소셜 로그인은 `SecurityEvent` 에 기록한다. 이전 로그인 기록이 있는 계정이 최근 90일 동안 쓰지 않은 기기(플랫폼 + 기기명)로 로그인하면 `NEW_DEVICE` 를 남기고 인앱·푸시 알림(`SECURITY_NEW_DEVICE`, 끌 수 없는 system 분류)과 메일을 보낸다.
- 만료 세션은 Worker 가 매일 정리.

## 7. 탈퇴

- 확인: 비밀번호, 이메일 OTP(`DELETE_ACCOUNT`), 또는 **소셜 재인증** — 로그인과 같은 OAuth 결과(`{provider, code, state, redirectUri}`, iOS Apple 은 `{provider: 'apple', identityToken, authorizationCode?}`)의 계정이 이 회원에게 연결돼 있어야 한다. 비밀번호도 실제 이메일도 없는 소셜 가입자(`…@social.invalid`)는 이 방법으로 탈퇴한다.
- 앱 세션은 위 확인에 더해 재인증 토큰(`x-reauth-token`)이 필요하다. 소셜 재인증만으로 확인하는 탈퇴는 그 자체를 재인증으로 본다 (docs/SECURITY.md §계정 보안).
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

- 앱 잠금(선택): 설정에서 켜면 앱 실행/포그라운드 복귀 시 `expo-local-authentication` 으로 잠금 해제 후 SecureStore 의 refresh 토큰 사용 (로컬 잠금, 서버 변화 없음). 로그인하지 않은 채 시작해 이어서 로그인(빠른 로그인 포함)했으면 그 실행에서는 잠금을 다시 묻지 않는다.
- 생체 재인증 키: 재인증 토큰으로 `POST /auth/reauth/biometric` 을 호출하면 서버가 32바이트 난수 secret 과 keyId 를 한 번만 내려준다. 앱은 secret 을 생체 인증으로 보호되는 SecureStore 항목에 저장하고, 민감 작업 때 생체 인증으로 꺼내 `POST /auth/reauth {method:'biometric', keyId, secret}` 로 보낸다. 서버는 SHA-256 해시만 저장하고 상수 시간으로 비교한다.
- 키는 기기 세션(family)당 1개 — refresh 회전에는 유지되고, 다시 등록하면 교체되며, 그 기기가 로그아웃·원격 로그아웃되면 삭제된다. 다른 기기의 키로는 재인증할 수 없다.

### 빠른 로그인 (Face ID · Touch ID · 지문)

로그아웃했거나 세션이 만료된 뒤 비밀번호 없이 생체 인증만으로 로그인한다. **비밀번호를 기기에 저장하지 않고**, 서버가 만든 자격(`QuickLoginCredential`)을 쓴다. 비밀번호가 없는 소셜 전용 계정도 쓸 수 있다.

- **켜기** `POST /auth/quick-login/register {deviceId, deviceName}` → `{credentialId, secret, expiresAt}`. 앱 세션(ios·android)만, 로그인한 지 10분 안의 기기 세션이 아니면 재인증 토큰 필요(`REAUTH_REQUIRED` → 앱 본인 확인 창). `deviceId` 는 앱 설치마다 만드는 UUID(일반 키체인, 비밀 아님)로 자격을 그 설치에 묶는다. 계정·설치당 1개, 다시 켜면 secret 교체.
- **저장**: 서버는 secret·deviceId 의 SHA-256 만 저장한다. 앱은 `credentialId` 를 일반 키체인, `secret` 을 `requireAuthentication` 키체인 항목(`WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`, iOS `biometryCurrentSet` — 얼굴·지문을 다시 등록하면 무효)에 둔다.
- **로그인** `POST /auth/quick-login {credentialId, secret, deviceId, device}` (공개). 앱이 생체 인증으로 secret 을 꺼내 보낸다. 성공하면 일반 로그인과 같은 새 세션(새 family) + **새 secret**(1회용 교체, 만료 90일로 다시 늘림)을 준다 → `AuthTokens & {quickLogin}`. 세션 발급과 secret 교체는 한 트랜잭션(같은 secret 동시 사용은 하나만 성공).
- **실패**는 모두 401 `QUICK_LOGIN_INVALID`(사유를 응답으로 구분하지 않는다): 없음·만료(행 삭제)·탈퇴 계정 · secret/deviceId 불일치(연속 5회면 삭제) · **이미 교체된 secret 재사용**(탈취로 보고 자격과 그 자격이 마지막으로 만든 family 를 폐기). 정지 계정은 403 `ACCOUNT_RESTRICTED`. 웹 기기는 403.
- **제한**: IP 20/분, 자격당 10/10분, 켜기 사용자당 10/시간.
- **기록**: 켜기 `QUICK_LOGIN_REGISTERED`, 끄기 `QUICK_LOGIN_REMOVED`, 실패 `QUICK_LOGIN_FAILED`(detail `reason: reuse·secret·device`, `locked`), 성공은 일반 로그인과 같이 `LOGIN`(detail `method: 'quick'`) + 새 기기 확인(`NEW_DEVICE` 알림·메일).
- **상태·다시 묶기·끄기**: `GET /auth/quick-login?deviceId=` → `{enabled, expiresAt}`, `PATCH /auth/quick-login {deviceId}` 는 비밀번호·소셜로 다시 로그인한 기기의 자격을 현재 family 에 묶는다(원격 로그아웃이 올바른 자격을 찾도록 — 앱이 로그인 직후 부른다), `DELETE /auth/quick-login {deviceId}`.
- **폐기**: §6. 앱은 설정 › 보안 토글로 끄면 서버·기기 모두 지우고, 비밀번호를 바꾸면 기기 자격을 지운다. 기기 무결성 위험(탈옥·루팅·후킹·변조)이 보이면 켜지 않는다. 만료 행은 쓰려 할 때 지운다 (정리 작업 없음).
- **앱 흐름**: 비밀번호·소셜로 로그인한 직후 이 기기에서 쓸 수 있고 아직 켜지 않았으면 계정마다 한 번 네이티브 Alert 로 켤지 묻는다(새 가입·시연 모드 제외). 설정 › 보안에 토글. 로그인 화면은 자격이 있으면 "Face ID로 로그인" 버튼을 보인다(자동으로 띄우지 않는다). 빠른 로그인 직후에는 앱 잠금(§9 앱 잠금)을 다시 묻지 않는다.
- Android 는 키체인 항목을 쓸 때도 생체 인증을 요구해 빠른 로그인 한 번에 지문 창이 두 번(꺼내기·새 secret 저장) 뜬다. 저장을 취소하면 자격을 끈다.

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

## 12. 로그인 화면 · 로그인 유지

### 앱 첫 화면 (로그인 → 둘러보기)

- 로그인하지 않은 채 앱을 열면 **로그인 화면이 첫 화면**이다 (`app/index.tsx` → `/login`). 로그인 방식 아래 **"둘러보기"** 로 로그인 없이 들어간다 (App Store 5.1.1 — 계정이 필요 없는 기능은 로그인 없이). 둘러보기 선택은 **이번 실행 동안만** 기억한다 — 다음 실행은 다시 로그인 화면부터 (첫 화면 목적이 로그인 안내이고, 둘러보기는 한 번 누르면 된다).
- 둘러보기 중 로그인이 필요한 동작(관심·입찰·구매·채팅·판매 등)은 지금처럼 `requireLogin()` 이 로그인 화면을 띄운다(왼쪽 위 닫기). 로그인하면 보던 화면으로 돌아간다.
- 로그인·가입·소셜 로그인 뒤: 첫 화면에서 로그인했으면 홈, 로그인해야 하는 딥링크로 열렸으면 그 화면(`components/entry-gate.tsx`).
- 로그아웃하거나 세션이 만료되면 로그인 화면이 다시 첫 화면이 된다 (빠른 로그인 버튼이 여기 보인다).
- 딥링크(docs/MOBILE_NAVIGATION.md §2): 공유받은 작품·경매·프로필 같은 **공개 화면은 로그인 화면 없이 바로** 연다(둘러보기로 들어온 것으로 본다). 로그인해야 하는 화면(채팅방·주문·알림·설정 등)은 로그인 화면을 띄우고 로그인 뒤 연다. 앱 시작의 세션 복구가 끝나기 전에 온 링크·알림도 복구 뒤에 연다.
- 약관 동의 화면·앱 잠금·스플래시·OTA 동작은 그대로다. 시연 모드(서버에 닿지 않을 때 기록한 관리자 계정으로 로그인)도 같은 로그인 화면에서 들어간다.

### 아이디 저장 · 자동 로그인 (앱)

- **아이디 저장**(기본 끔): 켜고 이메일로 로그인하면 이메일을 키체인(`hwaso.savedEmail`)에 두고 다음 로그인 화면에 채운다. 끄고 로그인하면 지운다.
- **자동 로그인**(기본 켬 = 기존 동작): 선택은 기기에 기억한다(`hwaso.autoLogin`). 끄고 로그인(이메일·소셜·빠른 로그인)하면 그 세션에 표시(`hwaso.session.ephemeral`)를 남긴다. 같은 실행 안에서는 백그라운드를 다녀와도 로그인 상태다. **다음 실행(앱 종료 후 다시 열기·긴급 OTA 재시작 포함)** 때는 세션을 이어 쓰지 않고, 저장한 refresh 토큰과 이 기기 푸시 토큰으로 `POST /auth/logout {refreshToken, pushToken}` 을 보내 서버 세션과 푸시를 끝낸 뒤 로그인 화면부터 시작한다. 오프라인이면 다음 실행 때 다시 보낸다. refresh 토큰은 이 정리를 위해 키체인에 남겨 둔다 (메모리에만 두면 서버 세션을 끝낼 수 없다).

### 아이디 저장 · 로그인 상태 유지 (웹)

- **아이디 저장**: `localStorage`(`hwaso.savedEmail`).
- **로그인 상태 유지**(기본 켬): 선택은 `localStorage`(`hwaso.keepSignedIn`). 끄면 로그인(이메일·소셜·가입) 직후 `POST /auth/session/persistence {persistent:false}`(CSRF 헤더 필요)로 `rt` 를 만료 없는 세션 쿠키로 다시 굽고 표시 쿠키 `rts=1`(같은 경로·httpOnly 세션 쿠키)을 둔다. refresh 회전도 `rts` 가 있으면 세션 쿠키로 굽는다. 브라우저를 닫으면 쿠키가 사라진다 — 서버 세션은 30일 뒤 만료된다(서버가 브라우저 종료를 알 수 없다). 브라우저의 "이전 탭 복원"은 세션 쿠키도 살려 둘 수 있다.
- 웹에는 생체 인증 로그인이 없다.

# AUTH

## 1. 토큰 모델

| 토큰         | 형식                               | 수명            | 저장 위치                                                                                         |
| ------------ | ---------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| Access       | JWT HS256 `{sub, role, sid, fam}`  | 15분            | Web: 메모리(Zustand) · Mobile: 메모리                                                             |
| Refresh      | 불투명 랜덤 32바이트 (base64url)   | 30일 (슬라이딩) | Web: `httpOnly Secure SameSite=Lax` 쿠키 `rt` (Path `/api/v1/auth`) · Mobile: `expo-secure-store` |
| Verification | JWT `{email, purpose}`             | 10분            | 클라이언트 메모리 (가입/재설정 단계 사이 전달)                                                    |
| Reauth       | JWT `{sub, sid, fam}` aud `reauth` | 5분             | 클라이언트 메모리. 민감 작업 요청의 `x-reauth-token` 헤더 (docs/SECURITY.md §계정 보안)           |

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

- 약관 동의는 비밀번호 단계에 필수 체크 1줄 (서비스 이용약관·개인정보 처리방침), 마케팅 수신은 선택.
- 판매자 정보(정산 계좌)는 **첫 상품 등록 시** 요청한다. 가입 단계에서 묻지 않는다.

## 5. 소셜 로그인

| Provider | 방식                                                    | 필요 설정                                                                         |
| -------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Google   | OAuth 2.0 Authorization Code + PKCE, OIDC id_token 검증 | `GOOGLE_CLIENT_ID/SECRET`                                                         |
| Apple    | Sign in with Apple, id_token(JWKS) 검증, `form_post`    | 웹: `APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY`, iOS 네이티브: `APPLE_BUNDLE_ID` |
| Kakao    | OAuth 2.0 Code → `/v2/user/me`                          | `KAKAO_CLIENT_ID/SECRET`                                                          |
| Naver    | OAuth 2.0 Code (+state) → `/v1/nid/me`                  | `NAVER_CLIENT_ID/SECRET`                                                          |

흐름 (Web·Mobile 공통, 서버가 code 교환):

1. `GET /auth/oauth/:provider/url?redirectUri=` → 서버가 `state`(Redis 10분, redirectUri 바인딩) 생성 후 인가 URL 반환. `redirectUri` 는 허용 목록만.
2. 사용자 인증 → provider 가 `redirectUri?code&state` 로 복귀 (Web: `/auth/callback/:provider`, Mobile: API 중계 `/auth/oauth/:provider/redirect` → `hwaso://auth/callback` via `expo-web-browser`, iOS Apple 은 네이티브 Sign in with Apple)
3. `POST /auth/oauth/:provider/callback {code, state, redirectUri}` → 서버가 state 1회 소비 검증 → 토큰 교환 → 사용자 정보 조회
4. `SocialAccount(provider, providerUserId)` 있으면 로그인. 없으면:
   - provider 가 **검증된 이메일**을 주고 같은 이메일의 계정이 있으면 → 연결하지 않고 `ACCOUNT_EXISTS` (이메일 로그인 후 설정에서 연결하도록 안내. 계정 탈취 방지)
   - 없으면 신규 가입 (emailVerifiedAt = provider 검증 시각, 닉네임 자동 생성 후 온보딩에서 수정)

환경 변수가 없는 provider 는 `/auth/providers` 응답에서 제외되어 버튼이 표시되지 않는다.

iOS 앱의 Apple 로그인은 웹 OAuth 가 아니라 시스템 Sign in with Apple 이다. 앱이 받은 `identityToken` 을 `POST /auth/oauth/apple/native` 로 보내면 서버가 Apple 공개키로 검증하며, 토큰 대상(aud)이 `APPLE_BUNDLE_ID`(앱 번들 ID, `app.config.ts` 의 `ios.bundleIdentifier`)여야 한다. 그래서 웹 키가 없어도 `APPLE_BUNDLE_ID` 만 있으면 `/auth/providers` 의 `appleNative` 가 `true` 가 되어 iOS 앱에 버튼이 보인다. 개발 모드에서는 Expo Go 로 실행한 토큰(aud `host.exp.Exponent`)도 허용한다. Apple Developer 에서 해당 App ID 에 Sign in with Apple 기능을 켜야 한다.

## 6. 세션 · 기기 관리

- 로그인/가입/소셜 시 `device: {name, platform}` 전달 → `Session` 1행.
- `GET /auth/sessions` : 기기명, 플랫폼, IP(마지막 옥텟 마스킹), 마지막 사용, 현재 기기 표시.
- 개별/전체 로그아웃, 비밀번호 변경·재설정 시 전체 세션 폐기. 폐기된 기기는 access 토큰도 즉시 거부되고 그 기기의 생체 재인증 키도 삭제된다.
- 로그인·가입·소셜 로그인은 `SecurityEvent` 에 기록한다. 이전 로그인 기록이 있는 계정이 최근 90일 동안 쓰지 않은 기기(플랫폼 + 기기명)로 로그인하면 `NEW_DEVICE` 를 남기고 인앱·푸시 알림(`SECURITY_NEW_DEVICE`, 끌 수 없는 system 분류)과 메일을 보낸다.
- 만료 세션은 Worker 가 매일 정리.

## 7. 탈퇴

- 확인: 비밀번호 또는 이메일 OTP(`DELETE_ACCOUNT`). 앱 세션은 여기에 더해 재인증 토큰(`x-reauth-token`)이 필요하다.
- 차단 조건: 진행 중 주문(결제~배송), LIVE 경매 판매/최고 입찰 중 → 409 + 안내.
- 처리: `User.status=DELETED`, email → `deleted+{id}@invalid`, passwordHash null, 프로필 익명화("탈퇴한 사용자"), 소셜 연결·세션·푸시 토큰 삭제. 주문/리뷰/입찰 기록은 거래 무결성과 법적 보관 의무로 익명 상태로 유지.

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

- 앱 잠금(선택): 설정에서 켜면 앱 실행/포그라운드 복귀 시 `expo-local-authentication` 으로 잠금 해제 후 SecureStore 의 refresh 토큰 사용 (로컬 잠금, 서버 변화 없음).
- 생체 재인증 키: 재인증 토큰으로 `POST /auth/reauth/biometric` 을 호출하면 서버가 32바이트 난수 secret 과 keyId 를 한 번만 내려준다. 앱은 secret 을 생체 인증으로 보호되는 SecureStore 항목에 저장하고, 민감 작업 때 생체 인증으로 꺼내 `POST /auth/reauth {method:'biometric', keyId, secret}` 로 보낸다. 서버는 SHA-256 해시만 저장하고 상수 시간으로 비교한다.
- 키는 기기 세션(family)당 1개 — refresh 회전에는 유지되고, 다시 등록하면 교체되며, 그 기기가 로그아웃·원격 로그아웃되면 삭제된다. 다른 기기의 키로는 재인증할 수 없다.

## 10. 공개 데모 모드

`DEMO_ACCOUNTS` 환경 변수(JSON 배열 `{ login, password, role, nickname? }`)가 있으면 데모 모드로 동작한다 (`apps/api/src/auth/demo.ts`). 계정 정보는 서버 환경 변수로만 두고 저장소에 커밋하지 않는다.

- 부팅 시 지정 계정을 만들거나 비밀번호·역할을 맞춘다. 판매자 역할은 데모용 정산 계좌(Seller)를 함께 만든다.
- 지정 계정만 로그인한다. 로그인 아이디는 이메일 형식이 아니어도 된다 (`loginIdSchema`).
- 누구나 아는 계정이므로 로그인 실패 잠금을 쓰지 않는다 (IP 단위 rate limit 은 유지).
- 가입·OTP·비밀번호 재설정/변경·탈퇴·소셜 로그인/연결·판매자 등록/수정은 `DEMO_DISABLED`(403).
- 실제 결제가 일어나지 않게 운영 모드에서도 모의 결제를 쓴다.

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

- 약관 동의는 비밀번호 단계에 필수 체크 1줄 (서비스 이용약관·개인정보 처리방침), 마케팅 수신은 선택.
- 판매자 정보(정산 계좌)는 **첫 상품 등록 시** 요청한다. 가입 단계에서 묻지 않는다.

## 5. 소셜 로그인

| Provider | 방식                                                    | 필요 설정                                    |
| -------- | ------------------------------------------------------- | -------------------------------------------- |
| Google   | OAuth 2.0 Authorization Code + PKCE, OIDC id_token 검증 | `GOOGLE_CLIENT_ID/SECRET`                    |
| Apple    | Sign in with Apple, id_token(JWKS) 검증, `form_post`    | `APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY` |
| Kakao    | OAuth 2.0 Code → `/v2/user/me`                          | `KAKAO_CLIENT_ID/SECRET`                     |
| Naver    | OAuth 2.0 Code (+state) → `/v1/nid/me`                  | `NAVER_CLIENT_ID/SECRET`                     |

흐름 (Web·Mobile 공통, 서버가 code 교환):

1. `GET /auth/oauth/:provider/url?redirectUri=` → 서버가 `state`(Redis 10분, redirectUri 바인딩) 생성 후 인가 URL 반환. `redirectUri` 는 허용 목록만.
2. 사용자 인증 → provider 가 `redirectUri?code&state` 로 복귀 (Web: `/auth/callback/:provider`, Mobile: API 중계 `/auth/oauth/:provider/redirect` → `hwaso://auth/callback` via `expo-web-browser`, iOS Apple 은 네이티브 Sign in with Apple)
3. `POST /auth/oauth/:provider/callback {code, state, redirectUri}` → 서버가 state 1회 소비 검증 → 토큰 교환 → 사용자 정보 조회
4. `SocialAccount(provider, providerUserId)` 있으면 로그인. 없으면:
   - provider 가 **검증된 이메일**을 주고 같은 이메일의 계정이 있으면 → 연결하지 않고 `ACCOUNT_EXISTS` (이메일 로그인 후 설정에서 연결하도록 안내. 계정 탈취 방지)
   - 없으면 신규 가입 (emailVerifiedAt = provider 검증 시각, 닉네임 자동 생성 후 온보딩에서 수정)

환경 변수가 없는 provider 는 `/auth/providers` 응답에서 제외되어 버튼이 표시되지 않는다.

## 6. 세션 · 기기 관리

- 로그인/가입/소셜 시 `device: {name, platform}` 전달 → `Session` 1행.
- `GET /auth/sessions` : 기기명, 플랫폼, IP(마지막 옥텟 마스킹), 마지막 사용, 현재 기기 표시.
- 개별/전체 로그아웃, 비밀번호 변경·재설정 시 전체 세션 폐기.
- 만료 세션은 Worker 가 매일 정리.

## 7. 탈퇴

- 확인: 비밀번호 또는 이메일 OTP(`DELETE_ACCOUNT`).
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

- 설정에서 켜면 앱 실행/포그라운드 복귀 시 `expo-local-authentication` 으로 잠금 해제 후 SecureStore 의 refresh 토큰 사용.
- 서버 인증 방식 변화 없음 (로컬 잠금).

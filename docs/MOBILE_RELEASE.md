# 앱 스토어 출시 체크리스트

앱(`apps/mobile`)은 EAS 로 빌드·제출한다. 서버·웹은 먼저 운영 환경에 올라가 있어야 한다.

## 1. 빌드 프로필 (`apps/mobile/eas.json`)

| 프로필        | 용도                               | API                         |
| ------------- | ---------------------------------- | --------------------------- |
| `development` | 개발 클라이언트 (시뮬레이터)       | 개발 PC (Metro 호스트 자동) |
| `preview`     | 내부 배포 (TestFlight·내부 테스트) | `api.staging.hwaso.kr`      |
| `production`  | 스토어 제출 (빌드 번호 자동 증가)  | `api.hwaso.kr`              |

```bash
pnpm --filter @shop/mobile exec eas build --profile production --platform all
pnpm --filter @shop/mobile exec eas submit --profile production --platform all
```

- `EAS_PROJECT_ID` 를 환경 변수로 넣어야 푸시 토큰이 발급된다 (`app.config.ts` → `extra.eas.projectId`).
- 번들 ID: `dev.efface.hwaso` (iOS·Android 동일). 바꾸면 웹 `APP_BUNDLE_ID` 도 함께 바꾼다.
- `submit.production.ios` 의 `ascAppId`·`appleTeamId` 는 App Store Connect 앱을 만든 뒤 채운다.

## 2. 자격 증명

- **푸시**: `eas credentials` 로 APNs 키(iOS)·FCM v1 서비스 계정(Android)을 등록한다. 서버는 Expo Push 로 보낸다.
- **Sign in with Apple**: iOS 는 시스템 로그인(`expo-apple-authentication`). 서버 `APPLE_*` 키는 docs/AUTH.md.
- **결제·본인인증**: 토스페이먼츠·포트원 키는 서버(`apps/api/.env`)에만 둔다. 앱은 웹 브리지(`/app-bridge/*`)로 결제창·인증창을 연다 (docs/MOBILE_NAVIGATION.md).

## 3. 유니버설 링크 · 앱 링크

웹 주소(작품·경매·프로필·채팅·주문)를 누르면 앱이 열린다. 웹 배포 환경 변수:

| 변수                  | 값                                           |
| --------------------- | -------------------------------------------- |
| `APPLE_TEAM_ID`       | Apple Developer 팀 ID                        |
| `ANDROID_CERT_SHA256` | Play 앱 서명 인증서 SHA-256 (여러 개면 쉼표) |
| `APP_BUNDLE_ID`       | `dev.efface.hwaso`                           |

설정하면 `/.well-known/apple-app-site-association`·`/.well-known/assetlinks.json` 이 제공된다.
`/app-bridge/*`·`/auth/*`·`/admin/*` 는 항상 웹에서 열리도록 제외돼 있다. 앱의 `APP_LINK_HOST`(기본 `hwaso.kr`)와 웹 도메인이 같아야 한다.

## 4. 스토어 등록 정보

개인정보·데이터 보안 설문, 연령 등급, 심사 메모, 운영 환경 점검은 docs/STORE_SUBMISSION.md 를 따른다.

- **개인정보처리방침 URL**: `https://hwaso.kr/privacy` / **지원 URL**: `https://hwaso.kr/support` (앱 › 마이 › 고객센터에도 있음)
- **계정 삭제**: 앱 › 설정 › 회원 탈퇴 (Apple 5.1.1(v) 요건), 웹 안내 `https://hwaso.kr/account-deletion` (Google Play 삭제 URL)
- **결제**: 실물 작품 거래라 인앱 결제 대상이 아니다 (Apple 3.1.3(e), Google Play 결제 정책 예외)
- **연령 등급**: 경매·거래 기능 — 성인 인증은 PASS 로 서버가 판정
- **심사 메모**: 심사용 테스트 계정(구매자·판매자)과 모의 결제가 켜진 스테이징 서버를 안내한다

## 5. 제출 전 확인

- [ ] 운영 API·웹·미디어 도메인 HTTPS 동작, `EXPO_PUBLIC_*` 가 운영 값
- [ ] 푸시 수신(실기기), 알림을 누르면 해당 화면으로 이동
- [ ] 로그인(이메일·소셜·Apple), 결제(카드·가상계좌), 본인인증, 주소 검색 브리지
- [ ] 유니버설 링크: 메모 앱에 작품 URL 을 붙여 눌렀을 때 앱이 열리는지
- [ ] 다크 모드·큰 글씨(시니어) 모드·VoiceOver/TalkBack 주요 흐름
- [ ] 오프라인에서 배너 표시, 연결되면 자동 재조회

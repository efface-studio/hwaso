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

- 푸시는 기기 토큰(iOS APNs·Android FCM)을 쓴다 — Expo 프로젝트 ID 는 푸시에 필요 없다. Android 빌드는 `GOOGLE_SERVICES_JSON`(Firebase `google-services.json` 경로, 저장소 밖)이 있어야 FCM 토큰이 발급된다.
- 번들 ID: `dev.efface.hwaso` (iOS·Android 동일). 바꾸면 웹 `APP_BUNDLE_ID` 도 함께 바꾼다.
- `submit.production.ios` 의 `ascAppId`·`appleTeamId` 는 App Store Connect 앱을 만든 뒤 채운다.

## 2. 자격 증명

- **푸시**: 서버가 직접 보낸다 (`apps/api/src/notifications/push.service.ts`).
  - iOS: APNs 토큰 인증 — `APNS_KEY_ID`·`APNS_TEAM_ID`(3NVCLTSP9V)·`APNS_PRIVATE_KEY`(.p8, 줄바꿈 `\n`)·`APNS_BUNDLE_ID`. 개발 서명 빌드 토큰은 샌드박스로 자동 재시도 후 기억한다.
  - Android: FCM HTTP v1 — `FCM_SERVICE_ACCOUNT`(서비스 계정 JSON 한 줄).
  - 보낸 사람 사진: iOS 알림 서비스 확장(`apps/mobile/targets/notification-service`)이 페이로드 `body.sender` 로 커뮤니케이션 알림을 만든다. 앱 ID 에 Communication Notifications 기능이 켜져 있어야 한다 (자동 서명이면 빌드 때 켜진다).
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

- **개인정보처리방침 URL**: `https://hwaso.kr/privacy` / **지원 URL**: `https://hwaso.kr/notices` (앱 › 마이 › 고객센터에도 있음)
- **계정 삭제**: 앱 › 설정 › 회원 탈퇴 (Apple 5.1.1(v) 요건)
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
- [ ] iPad 가로·세로 레이아웃(격자 열 수 자동 조정)

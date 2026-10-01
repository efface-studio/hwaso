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
- **스크린숏**: iPad 를 지원하므로(`ios.supportsTablet: true`) iPhone 6.9" 와 함께 **iPad 13"** 세로 스크린숏(2064 × 2752)이 필요하다. 심사도 iPad 에서 앱을 실행해 본다. 앱은 세로 전용이고 iPad 는 전체 화면만(`ios.requireFullScreen: true`, Split View·Slide Over 미지원)

## 5. OTA 업데이트

스토어 심사 없이 JS 번들·에셋만 바꾸는 업데이트는 EAS Update 대신 **자체 서버**(`apps/api` `ota` 모듈, Expo Updates 프로토콜 v1)로 내려준다. API 상세는 docs/API.md "OTA".

### 서버 설정 (`apps/api/.env`)

| 변수                 | 값                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `OTA_PUBLISH_TOKEN`  | 배포 스크립트 공유 비밀 (32자 이상, `openssl rand -hex 32`). 비우면 업로드·등록 API 가 503 |
| `OTA_SIGNING_KEY`    | 매니페스트 서명용 RSA 개인 키 PEM. 한 줄로 넣을 때 줄바꿈은 `\n`                           |
| `OTA_SIGNING_KEY_ID` | 서명 키 ID (기본 `main`) — 앱 `codeSigningMetadata.keyid` 와 같아야 한다                   |

서명 키 만들기 (개인 키는 서버에만, 인증서는 앱에 내장 — `apps/mobile/certs/certificate.pem`):

```bash
npx expo-updates codesigning:generate --key-output-directory ~/.config/hwaso/ota \
  --certificate-output-directory certs --certificate-validity-duration-years 20 --certificate-common-name "efface hwaso"
```

서명 키를 바꾸면 새 인증서를 넣은 스토어 빌드가 먼저 나가야 한다 (옛 앱은 새 키로 서명한 매니페스트를 거절한다).

### 앱 설정 (`apps/mobile/app.config.ts`)

- `updates.url` = `EXPO_PUBLIC_API_URL` + `/ota/manifest`. API 주소가 없는 빌드(개발 빌드)는 OTA 를 끈다.
- `runtimeVersion: { policy: 'fingerprint' }` — 네이티브 모듈·설정·패치가 바뀌면 런타임 버전이 저절로 바뀌어 옛 바이너리에 맞지 않는 번들이 내려가지 않는다. fingerprint 에는 앱 설정(환경 변수 포함)이 들어가므로 **배포는 스토어 빌드와 같은 소스·같은 `.env` 로** 해야 한다.
- `checkAutomatically: 'ON_LOAD'`, `fallbackToCacheTimeout: 0` — 실행을 기다리게 하지 않는다. 실행할 때 확인해 뒤에서 받아 두고 **다음 실행 때** 적용한다.
- `requestHeaders['expo-channel-name']` = `OTA_CHANNEL` (기본 `production`).
- 앱으로 돌아올 때도 15분에 한 번 다시 확인한다 (`src/lib/ota.tsx` `OtaSync`). 매니페스트 `extra.critical` 이 참인 업데이트(`--critical`)만 받는 즉시 안내하고 다시 시작한다.

### 배포 (`pnpm --filter @shop/mobile ota:publish`)

```bash
set -a; source ~/.config/hwaso/ota/publish.env; set +a
pnpm --filter @shop/mobile ota:publish -- --message "판매 탭 문구 수정"
```

옵션: `--platform ios|android|all` (기본 all) · `--critical` · `--rollout 1~100` · `--channel`. 주소는 `OTA_API_URL` 또는 `.env` 의 `EXPO_PUBLIC_API_URL`.

스크립트가 하는 일:

1. `expo export` 로 플랫폼별 번들·에셋을 만든다 (`dist-ota/`).
2. 각 파일을 `POST /ota/assets` 로 올린다 (`x-ota-publish-token`). 같은 파일은 같은 주소라 다시 올려도 무해하다.
3. `expo-updates runtimeversion:resolve` 로 런타임 버전을 계산하고, `expo config` 결과(`extra.expoClient`)와 함께 `POST /ota/updates` 로 등록한다.
4. 앱은 `platform`·`runtimeVersion`·`channel` 이 모두 같은 최신 ACTIVE 업데이트만 받는다.

관리자 앱 **운영 → 앱 업데이트** 에서 배포 기록·배포 비율·되돌리기를 다룬다.

### 점진 배포 · 되돌리기 (관리자 `/admin/ota`)

- `rolloutPercent` (1~100): 기기 ID(`eas-client-id`) 해시로 대상을 고른다. 같은 기기는 항상 같은 결과이고, 비율을 올리면 기존 대상은 그대로 포함된다. 대상이 아닌 기기는 그 이전 업데이트를 받는다.
- `PATCH /admin/ota/:id {status: "ROLLED_BACK"}`: 새 기기에 그 업데이트를 더 이상 내려주지 않는다. 이미 받은 기기는 더 오래된 업데이트를 적용하지 않으므로 그대로다 — 되돌리려면 아래 rollback 을 쓴다.
- `POST /admin/ota/rollback {target: "previous"}`: 최신 업데이트를 중단하고 직전 업데이트를 **새 ID·새 시각**으로 다시 낸다 (앱은 더 새로운 업데이트만 적용하므로 옛 행을 되살리지 않는다). 직전 것이 없으면 내장 번들로 되돌린다.
- `POST /admin/ota/rollback {target: "embedded"}`: 앱 바이너리에 내장된 번들로 되돌리는 지시를 낸다. 이미 내장 번들로 실행 중인 기기는 204.
- 모든 변경은 감사 로그(`ota.update`·`ota.rollback`)에 남는다.

## 6. 제출 전 확인

- [ ] 운영 API·웹·미디어 도메인 HTTPS 동작, `EXPO_PUBLIC_*` 가 운영 값
- [ ] 푸시 수신(실기기), 알림을 누르면 해당 화면으로 이동
- [ ] 로그인(이메일·소셜·Apple), 결제(카드·가상계좌), 본인인증, 주소 검색 브리지
- [ ] 유니버설 링크: 메모 앱에 작품 URL 을 붙여 눌렀을 때 앱이 열리는지
- [ ] 다크 모드·큰 글씨(시니어) 모드·VoiceOver/TalkBack 주요 흐름
- [ ] iPad(11"·13" 세로): 아래쪽 탭 바(아이폰과 같은 모양)·홈·검색·작품/경매 상세(13" 는 두 칸)·로그인·결제 흐름이 깨지지 않는지, 기기를 돌려도 세로로 남는지 (docs/MOBILE_NAVIGATION.md 「화면 폭과 배치」)
- [ ] 오프라인에서 배너 표시, 연결되면 자동 재조회
- [ ] OTA: 스테이징 채널에 업데이트를 내고 실기기에서 적용·되돌리기(previous·embedded) 확인, 서명 검증 실패 시 적용되지 않는지

# MOBILE NAVIGATION

Expo SDK 57 + **Expo Router** (React Navigation 7 기반 파일 라우팅). 코드: `apps/mobile/src/app` (화면), `apps/mobile/src/{components,lib,stores,theme}` (그 외).

## 1. 구조

```
src/app
├─ _layout.tsx            Root Stack (테마·쿼리·로그인 복구·스플래시)
├─ index.tsx              → /home 으로 이동
├─ (tabs)/_layout.tsx     NativeTabs — iOS 26 Liquid Glass / Android Material 3 탭 바
│  ├─ home/               Stack: 홈
│  ├─ auctions/           Stack: 진행 중 경매
│  ├─ sell/               Stack: 작품 등록
│  ├─ chat/               Stack: 채팅 목록 (탭 배지 = 안 읽은 수)
│  └─ my/                 Stack: 마이 · 설정(테마·시니어 모드)
├─ products/[id].tsx      작품 상세
├─ login.tsx              로그인 (아래에서 올라오는 화면, 닫고 둘러보기)
├─ consent.tsx            필수 동의 (약관·개인정보·만 14세 + 선택 마케팅)
└─ +not-found.tsx
```

- 탭 순서는 웹 하단 탭과 같다: 홈 · 경매 · 판매 · 채팅 · 마이 (검색은 홈 헤더).
- iOS 26 에서 마이 탭은 search 역할로 두어 오른쪽에 분리된 원형 버튼(프로필 사진 + "마이")으로 보인다. 아이패드도 아이폰과 같은 아래쪽 탭 바를 쓴다 — iPadOS 18+ 기본은 위쪽 탭 바(넓으면 사이드바)라서, `patches/react-native-screens@4.26.2.patch` 가 아이패드에서 탭 바 컨트롤러만 가로 compact 로 보게 하고(`traitOverrides.horizontalSizeClass`) 각 탭 화면에는 창의 실제 size class 를 돌려준다 (화면 내용·헤더·시트는 아이패드 동작 그대로).
- 각 탭 안에 native Stack 을 두어 큰 제목(iOS large title)·뒤로 가기를 OS 기본 동작으로 쓴다.
- 로그인 없이 둘러볼 수 있다: 홈·경매·검색·작품/경매/작가/사용자 상세·공지·고객센터·약관 (App Store 5.1.1(v)).
- 관심·팔로우·입찰·구매·채팅·문의·신고 같은 동작은 `requireLogin()` 이 `/login` 을 띄우고, 로그인하면 보던 화면으로 돌아온다. 채팅·판매 탭과 마이 탭은 비로그인 안내 화면을 보여준다.
- 동의가 남은 계정(`MeDto.consentRequired`)은 `/consent` 만 열린다 (소셜 첫 가입 등).
- 웹 미리보기(`pnpm --filter @shop/mobile web`)에서는 탭이 기본 구현으로 대체된다.

## 2. Deep Linking

scheme `hwaso://`, universal link `https://hwaso.kr` (`APP_LINK_HOST`). 파일 경로가 곧 웹 경로와 같은 딥링크가 된다.

| URL                        | 화면             |
| -------------------------- | ---------------- |
| `/products/:id`            | ProductDetail    |
| `/auctions/:id`            | AuctionLive      |
| `/artists/:id`             | ArtistDetail     |
| `/users/:id`               | UserProfile      |
| `/category/:slug`          | Category         |
| `/chat/:roomId`            | ChatRoom         |
| `/orders/:id`              | OrderDetail      |
| `/notifications`           | Notifications    |
| `/auth/callback/:provider` | 소셜 로그인 복귀 |

푸시 알림의 `data.link` 는 위 경로를 그대로 담고, 탭 시 `router.push(link)` 로 이동한다 (웹 홈 `/` 은 쌓인 화면을 닫고 홈 탭으로 — `openAppPath`) (앱이 꺼져 있었으면 마지막 알림 응답으로 이동). 지금 보고 있는 화면과 같은 링크의 알림은 배너를 띄우지 않는다.

`/report?type=USER|PRODUCT|REVIEW|MESSAGE&id=` 는 공용 신고 모달이다.

### 결제·주소 검색 (웹 브리지)

토스페이먼츠 결제창과 카카오 우편번호는 웹 JS SDK 라서, 앱은 인앱 브라우저(iOS ASWebAuthenticationSession · Android Custom Tabs)로 웹의 브리지 페이지를 연다.

1. 앱이 `/orders/:id/payments` 로 결제를 준비 → `PaymentRequestDto`
2. `{WEB}/app-bridge/pay?r=<요청 JSON>&return=hwaso://bridge` 를 연다 → 토스 결제창 (카드사 앱 전환도 브라우저가 처리)
3. 결제창 복귀 → `/app-bridge/done` 이 결과 쿼리(`paymentKey·orderId·amount` 또는 `code·message`)를 `hwaso://bridge` 로 넘긴다
4. 앱이 `/payments/confirm` 으로 승인 요청 — 금액 대조·승인은 서버가 한다
5. 키가 없는 개발 환경(mock)은 결제창 없이 바로 승인한다

우편번호는 `/app-bridge/postcode?return=hwaso://bridge` → `zipCode·address1` 을 돌려받는다.
본인인증(PASS)은 앱이 `/identity/prepare` 로 인증 ID 를 받아 `/app-bridge/identity?storeId&channelKey&id&return` 을 열고, 돌아온 `identityVerificationId` 로 `/identity/complete` 를 요청한다 (서버가 포트원에 다시 조회해 검증).
복귀 주소는 앱 스킴(`NEXT_PUBLIC_APP_SCHEME`, 기본 `hwaso`)만 허용한다 — 개발 중에만 Expo Go(`exp://`)·`http://localhost` 도 허용.

## 3. 네이티브 기능

| 기능                   | 패키지                                                 | 사용                                                                                                                                             |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Push                   | `expo-notifications`                                   | 첫 실행 때 스플래시 뒤 권한 요청(기기당 한 번), 미뤘으면 첫 채팅·입찰·관심·팔로우 뒤 안내 시트·설정, 토큰 → `/me/push-tokens` (로그아웃 시 해제) |
| Camera / Photo Library | `expo-image-picker` (카메라 + 앨범, 다중 선택 최대 20) | 상품 등록, 채팅 이미지                                                                                                                           |
| 이미지 압축            | `expo-image-manipulator`                               | 업로드 전 긴 변 2400px, JPEG 0.85 (서버에서 재처리). 원본은 한 번만 디코딩, 동시에 3장씩 업로드                                                  |
| Share                  | RN `Share`                                             | 상품/경매 공유 (웹 URL)                                                                                                                          |
| Secure Storage         | `expo-secure-store`                                    | refresh 토큰                                                                                                                                     |
| Biometric              | `expo-local-authentication`                            | 앱 잠금 해제 (설정)                                                                                                                              |
| Browser Auth           | `expo-web-browser` + `expo-auth-session`               | 소셜 로그인, 결제·우편번호 웹 브리지                                                                                                             |
| Haptics                | `expo-haptics`                                         | 입찰 성공/실패                                                                                                                                   |
| Image                  | `expo-image`                                           | 서버 이미지는 `MediaImage`(표시 폭에 맞는 파생본 + 메모리·디스크 캐시), 대표색 배경 — 아래 「성능」                                              |

## 4. Mobile UX

- 터치 타깃 최소 44×44, 주요 CTA 높이 52, 하단 고정.
- 목록: `FlatList` (가상화) + 무한 스크롤 + Pull to Refresh. 렌더링 설정은 아래 「성능」.
- 필터/정렬: 바텀시트 (`@gorhom/bottom-sheet`), 적용 버튼에 결과 수 표시.
- 상품 등록: 한 화면 한 질문. 사진 → 상품명 → 카테고리 → 가격 → 판매 방식 → 상세 정보(선택, 접힘) → 등록. 입력값은 단계 이동 시 로컬 저장(드래프트 복구).
- 숫자 입력은 `number-pad`, 날짜는 네이티브 DateTimePicker.
- 키보드: 루트에 `KeyboardProvider`(react-native-keyboard-controller). 입력칸이 있는 화면·시트는 `FormScroll`(KeyboardAwareScrollView)로 포커스된 입력칸을 키보드 위로 스크롤하고(여러 줄 입력칸은 커서만이 아니라 칸·도움말 전체가 보이게 여백을 더한다, 최대 240pt), 채팅 입력창은 라이브러리 `KeyboardAvoidingView`로 키보드 바로 위에 붙인다.
- 경매 화면: 포그라운드 복귀(`AppState`) 시 시간 재동기화 + 스냅샷 재조회. 입찰 버튼은 "최소 입찰가로 입찰" + 직접 입력 두 가지.
- 이미지 갤러리: 가로 페이징 + 탭 시 전체 화면 핀치 줌.

### 성능

- **이미지 파생본**: 서버는 폭 400·800·1600 의 WebP·AVIF 를 만든다(`apps/api` `media/image.ts`). 앱은 WebP 만 쓴다 — 서버 AVIF(q55)가 WebP(q82)보다 화질이 조금 낮다. 서버 이미지는 `MediaImage`(`components/ui/media-image.tsx`)로 그리고, 표시 폭(pt) × 화면 배율 이상인 가장 작은 파생본을 고른다(`imageWidthFor`, `lib/media.ts`). 필요 픽셀의 90% 이상이면 한 단계 작은 것으로 충분하다고 본다 — 예: 휴대폰 2열 카드(약 190pt × 3배)는 w800, 홈 가로 목록 카드(140pt × 3배 = 420px)는 w400, 상세 사진(휴대폰 폭 × 3배)은 w1600, 썸네일·아바타는 w400. 홈 작품 이미지 실측 평균은 w400 24KB · w800 90KB · w1600 344KB.
- **이미지 캐시**: `expo-image` 기본(`disk`)은 다시 그릴 때마다 디스크에서 읽어 디코딩하므로 `MediaImage` 는 `memory-disk` 를 쓴다(메모리는 OS 경고 시 비워진다). 같은 자리에서 다른 이미지로 바뀌면 이전 이미지를 남기지 않는다(`recyclingKey`). 로딩 전에는 대표색(`dominantColor`) 배경.
- **상세 미리 불러오기**: 작품 카드를 누르기 시작하면 상세 정보를(`prefetchProduct`, 신선한 캐시가 있으면 생략), 누르면 상세 첫 사진을 상세 크기로(`prefetchCover`, 두 칸 배치는 생략) 미리 받는다(`lib/product-query.ts`). 상세 사진은 w400 을 먼저 보여 준다(placeholder).
- **작품 그리드 렌더링**: `useGrid().listProps` — 처음엔 한 화면 + 1줄만 그리고(FlatList 기본 10줄 = 카드 20장 대신 휴대폰은 8장), 위아래 3화면씩만 유지한다(`windowSize` 7). `renderItem` 은 `useCardRenderer` 로 카드 폭이 같으면 같은 함수를 쓰고, 카드는 `memo` 라 목록을 다시 불러와도 바뀐 카드만 다시 그린다. 카드 높이는 작가 이름 유무·글자 크기에 따라 달라 `getItemLayout` 은 쓰지 않는다(폭이 고정인 홈 가로 목록·배너·갤러리만 쓴다).
- **시작**: 홈(`/home`)은 로그인 계정별로 다르므로(관심 표시·차단한 판매자 제외) 저장된 로그인 상태 복구가 끝난 뒤 한 번만 받는다 — 복구는 애니메이션 스플래시가 가리는 동안 끝난다. 복구 전에 손님으로 받아 둔 쿼리(딥 링크로 연 작품 등)만 복구 뒤 다시 받는다(`realtime-sync`). 홈은 서버 공통 캐시와 같은 60초 동안 다시 받지 않는다.

### 화면 폭과 배치 (아이패드)

iPad 를 지원한다 (`ios.supportsTablet: true`). 앱은 아이폰·아이패드·안드로이드 모두 **세로 전용**(`orientation: 'portrait'`)이고, 아이패드는 전체 화면만 쓴다(`ios.requireFullScreen: true` — Split View·Slide Over 없음. 멀티태스킹을 지원하려면 네 방향을 모두 지원해야 한다). 배치는 기기 종류가 아니라 **창 폭**(`useWindowDimensions`)으로 나눈다 — 아이패드 세로 폭은 744(mini) ~ 1032(13"). 기준은 `src/hooks/use-layout.ts` 한 곳에 둔다.

| 구간    | 창 폭      | 예                     |
| ------- | ---------- | ---------------------- |
| compact | 600 미만   | 휴대폰                 |
| regular | 600 ~ 1023 | 아이패드 mini·11" 세로 |
| wide    | 1024 이상  | 아이패드 13" 세로      |

- **글자·컨트롤 크기**: 태블릿(화면 짧은 변 600 이상)은 테마(`src/theme`)에서 `TABLET_SCALE`(1.2)를 곱한다 — 글자 크기·행간, 버튼·입력칸 높이(`controlHeight`), 최소 터치 영역(`touch`), 기본 아이콘 크기(`iconSize`). 고정 크기(홈 가로 목록 카드 폭, 탭 화면 제목·로고 등)는 `t.scale` 을 곱한다. 휴대폰은 1 이라 그대로다.
- **탭 바**: 아이패드도 아이폰과 같은 아래쪽 떠 있는 탭 바(위 「구조」 참고). 탭 아이콘·글자·마이 프로필 아이콘을 `TAB_BAR_SCALE`(1.2)배로 그린다. 탭 바 자체의 높이·폭은 시스템(UIKit)이 고정해 직접 키울 수 없고, 그 안에서 더 키우면 아이콘과 글자가 겹친다(2배에서 확인). 더 큰 탭 바가 필요하면 시스템 탭 바 대신 직접 그린 탭 바로 바꿔야 한다.
- **본문 폭**: 글·폼·목록 화면은 `readable`(최대 720, 가운데)을 스크롤의 `contentContainerStyle` 에 넣는다. `FormScroll` 과 한 열짜리 `List` 는 기본으로 적용하고(화면 전체 폭이 필요하면 `fullWidth`), 그 밖의 `ScrollView` 화면은 직접 넣는다. 휴대폰은 폭이 720 보다 좁아 그대로다. 가입·비밀번호 찾기는 `NARROW_WIDTH`(520), 로그인은 468.
- **화면 끝까지 닿는 바**(하단 구매·입찰·등록 버튼, 채팅 입력창): 배경과 구분선은 화면 폭 그대로 두고 `useReadableGutter()` 로 좌우 여백을 늘려 안의 내용만 본문 폭에 맞춘다.
- **작품 그리드**(검색 결과·카테고리·경매 목록·피드·프로필·관심·최근 본): 화면 폭을 다 쓰고 `useGrid` 가 열 수를 늘린다 — 600 미만 2열, 600~ 3열, 900~ 4열, 1200~ 5열 (큰 글씨 모드는 한 열 적게). 홈 가로 목록은 카드 폭이 고정이라 넓은 화면에서는 더 많이 보인다.
- **홈 배너**: 최대 900 폭으로 가운데 둔다 (넘김 단위가 배너 폭과 같게 목록 폭도 맞춘다).
- **작품·경매 상세**: 창 폭 900 이상(`SPLIT_MIN_WIDTH`, 아이패드 13" 세로)이면 두 칸 — 왼쪽은 사진(칸 크기에 맞춘 갤러리 / 경매는 작품 사진, 누르면 작품 상세), 오른쪽은 정보 스크롤과 하단 버튼(폭 380~480). 그보다 좁으면 한 칸이고, 사진 갤러리는 최대 720 × 640.
- **채팅방**: 말풍선 목록은 본문 폭, 상단 작품 줄·답장 줄·입력창은 같은 폭에 맞춘다.
- **시트**: 시스템 pageSheet 는 아이패드에서 가운데 폼 시트로 뜬다. 직접 그리는 아래 시트(작업 선택·알림 권한 안내)는 배경을 화면 전체에 깔고 패널은 본문 폭으로 가운데 둔다.
- 관리자 화면도 같은 규칙(목록·대시보드는 본문 폭)이다.

## 5. 상태

Web 과 동일: TanStack Query + Zustand, API 클라이언트는 `@shop/api-client` 공유. 오프라인 시 상단 배너 "연결이 끊겼습니다. 다시 연결 중…".

- 쿼리 기본값: `staleTime` 30초, `gcTime` 30분 (웹은 기본 5분). 탭을 오가거나 뒤로 돌아오면 캐시를 바로 그리고 뒤에서 갱신한다. 로그아웃 시 비활성 쿼리는 지운다 (`realtime-sync`).
- 쿼리 캐시는 디스크에 저장하지 않는다 — 첫 화면은 홈 한 번(압축 후 수 KB)이면 충분하고, 개인 데이터(채팅·주문)를 기기에 남기지 않기 위해서다.

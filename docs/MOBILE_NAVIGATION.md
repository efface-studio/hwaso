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
├─ login.tsx              로그인 (modal)
└─ +not-found.tsx
```

- 탭 순서는 웹 하단 탭과 같다: 홈 · 경매 · 판매 · 채팅 · 마이 (검색은 홈 헤더).
- 각 탭 안에 native Stack 을 두어 큰 제목(iOS large title)·뒤로 가기를 OS 기본 동작으로 쓴다.
- 로그인이 필요한 화면은 `/login` 모달을 띄우고 성공하면 닫힌다.
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

푸시 알림의 `data.link` 는 위 경로를 그대로 담고, 탭 시 `router.push(link)` 로 이동한다 (앱이 꺼져 있었으면 마지막 알림 응답으로 이동). 지금 보고 있는 화면과 같은 링크의 알림은 배너를 띄우지 않는다.

`/report?type=USER|PRODUCT|REVIEW|MESSAGE&id=` 는 공용 신고 모달이다.

### 결제·주소 검색 (웹 브리지)

토스페이먼츠 결제창과 카카오 우편번호는 웹 JS SDK 라서, 앱은 인앱 브라우저(iOS ASWebAuthenticationSession · Android Custom Tabs)로 웹의 브리지 페이지를 연다.

1. 앱이 `/orders/:id/payments` 로 결제를 준비 → `PaymentRequestDto`
2. `{WEB}/app-bridge/pay?r=<요청 JSON>&return=hwaso://bridge` 를 연다 → 토스 결제창 (카드사 앱 전환도 브라우저가 처리)
3. 결제창 복귀 → `/app-bridge/pay/done` 이 결과 쿼리(`paymentKey·orderId·amount` 또는 `code·message`)를 `hwaso://bridge` 로 넘긴다
4. 앱이 `/payments/confirm` 으로 승인 요청 — 금액 대조·승인은 서버가 한다
5. 키가 없는 개발 환경(mock)은 결제창 없이 바로 승인한다

우편번호는 `/app-bridge/postcode?return=hwaso://bridge` → `zipCode·address1` 을 돌려받는다.
복귀 주소는 앱 스킴(`NEXT_PUBLIC_APP_SCHEME`, 기본 `hwaso`)만 허용한다 — 개발 중에만 Expo Go(`exp://`)·`http://localhost` 도 허용.

## 3. 네이티브 기능

| 기능                   | 패키지                                                 | 사용                                                                          |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Push                   | `expo-notifications`                                   | 로그인 직후 권한 요청, Expo push token → `/me/push-tokens` (로그아웃 시 해제) |
| Camera / Photo Library | `expo-image-picker` (카메라 + 앨범, 다중 선택 최대 20) | 상품 등록, 채팅 이미지                                                        |
| 이미지 압축            | `expo-image-manipulator`                               | 업로드 전 긴 변 2400px, JPEG 0.85 (서버에서 재처리)                           |
| Share                  | RN `Share`                                             | 상품/경매 공유 (웹 URL)                                                       |
| Secure Storage         | `expo-secure-store`                                    | refresh 토큰                                                                  |
| Biometric              | `expo-local-authentication`                            | 앱 잠금 해제 (설정)                                                           |
| Browser Auth           | `expo-web-browser` + `expo-auth-session`               | 소셜 로그인, 결제·우편번호 웹 브리지                                          |
| Haptics                | `expo-haptics`                                         | 입찰 성공/실패                                                                |
| Image                  | `expo-image`                                           | 캐시, placeholder 색                                                          |

## 4. Mobile UX

- 터치 타깃 최소 44×44, 주요 CTA 높이 52, 하단 고정.
- 목록: `FlashList` (가상화) + 무한 스크롤 + Pull to Refresh.
- 필터/정렬: 바텀시트 (`@gorhom/bottom-sheet`), 적용 버튼에 결과 수 표시.
- 상품 등록: 한 화면 한 질문. 사진 → 상품명 → 카테고리 → 가격 → 판매 방식 → 상세 정보(선택, 접힘) → 등록. 입력값은 단계 이동 시 로컬 저장(드래프트 복구).
- 숫자 입력은 `number-pad`, 날짜는 네이티브 DateTimePicker.
- 경매 화면: 포그라운드 복귀(`AppState`) 시 시간 재동기화 + 스냅샷 재조회. 입찰 버튼은 "최소 입찰가로 입찰" + 직접 입력 두 가지.
- 이미지 갤러리: 가로 페이징 + 탭 시 전체 화면 핀치 줌.

## 5. 상태

Web 과 동일: TanStack Query + Zustand, API 클라이언트는 `@shop/api-client` 공유. 오프라인 시 상단 배너 "연결이 끊겼습니다. 다시 연결 중…".

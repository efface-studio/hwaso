# MOBILE NAVIGATION

Expo (React Native) + React Navigation 7 (`@react-navigation/native-stack`, `@react-navigation/bottom-tabs`). 코드: `apps/mobile/src/navigation`.

## 1. 구조

```
RootStack (native-stack)
├─ MainTabs (bottom-tabs)
│  ├─ HomeTab      → HomeStack:    Home
│  ├─ SearchTab    → SearchStack:  Search → SearchResults
│  ├─ SellTab      → (탭 누르면 SellFlow 모달을 연다, 자체 화면 없음)
│  ├─ AuctionTab   → AuctionStack: AuctionList
│  └─ MyTab        → MyStack:      My → Purchases / Sales / Bids / Wins / Favorites / Recent / Following / Settings / Devices / SellerDashboard / SellerOrders
├─ ProductDetail   {id}
├─ AuctionLive     {id}
├─ ArtistDetail    {id}
├─ UserProfile     {id}
├─ Category        {slug}
├─ ChatList
├─ ChatRoom        {roomId}
├─ Notifications
├─ OrderDetail     {id}
├─ Checkout        {orderIds}
├─ PaymentWebView  {…}            (PG 결제창)
├─ SellFlow        (modal, native-stack 중첩) Photos → Basics → Price → Details(선택) → Review
├─ AuthFlow        (modal) Login → SignupEmail → SignupCode → SignupPassword → SignupProfile · ForgotPassword
└─ ImageViewer     {images, index} (fullScreenModal, 핀치 줌)
```

- 탭: 홈 · 검색 · 판매 · 경매 · 마이 (lucide 아이콘 + 라벨, 높이 56 + safe-area).
- 헤더 우측: 알림(배지), 채팅.
- 로그인이 필요한 화면 진입 시 `AuthFlow` 모달을 띄우고 성공 후 원래 화면으로 복귀.

## 2. Deep Linking

scheme `shop://`, universal link `https://shop.efface.dev`. (웹 경로와 동일하게 맞춘다)

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

푸시 알림의 `data.link` 는 위 경로를 그대로 담고, 탭 시 `Linking` 으로 이동한다.

## 3. 네이티브 기능

| 기능                   | 패키지                                                 | 사용                                                                             |
| ---------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Push                   | `expo-notifications`                                   | 로그인 후 권한 요청(첫 입찰/관심 등록 시점), Expo push token → `/me/push-tokens` |
| Camera / Photo Library | `expo-image-picker` (카메라 + 앨범, 다중 선택 최대 20) | 상품 등록, 채팅 이미지                                                           |
| 이미지 압축            | `expo-image-manipulator`                               | 업로드 전 긴 변 2400px, JPEG 0.85 (서버에서 재처리)                              |
| Share                  | RN `Share`                                             | 상품/경매 공유 (웹 URL)                                                          |
| Secure Storage         | `expo-secure-store`                                    | refresh 토큰                                                                     |
| Biometric              | `expo-local-authentication`                            | 앱 잠금 해제 (설정)                                                              |
| Browser Auth           | `expo-web-browser` + `expo-auth-session`               | 소셜 로그인                                                                      |
| Haptics                | `expo-haptics`                                         | 입찰 성공/실패                                                                   |
| Image                  | `expo-image`                                           | 캐시, placeholder 색                                                             |

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

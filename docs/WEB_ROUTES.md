# WEB ROUTES

Next.js 16 App Router (`apps/web/src/app`). 렌더링: **SSR/ISR = 검색엔진 노출 필요 + 공개 데이터**, **CSR = 사용자별 데이터**.

| 경로                                                                               | 화면                                                                                                                        | 렌더링                                 | 인증                 |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------- |
| `/`                                                                                | 홈: 검색, 카테고리, 인기 상품, 오늘의 경매, 마감 임박, 신규 등록, 인기 작가, 추천 컬렉션, (로그인 시) 관심상품·최근 본 상품 | ISR 60s + CSR 개인화 섹션              | -                    |
| `/search?q=&…`                                                                     | 검색 결과 + 필터 + 정렬 (URL 이 필터 상태의 원천)                                                                           | SSR 첫 페이지 + 무한 스크롤            | -                    |
| `/category/[slug]`                                                                 | 카테고리 목록 + 필터                                                                                                        | ISR 60s                                | -                    |
| `/products/[id]`                                                                   | 상품 상세 (갤러리/줌, 정보, 판매자, 인증서·출처, 배송·반품, 문의)                                                           | ISR 60s + `generateMetadata` + JSON-LD | -                    |
| `/auctions`                                                                        | 경매 목록 (진행 중/예정/종료 탭, 마감 임박순)                                                                               | SSR                                    | -                    |
| `/auctions/[id]`                                                                   | 실시간 경매 (현재가, 타이머, 입찰 패널, 입찰 기록, 참여자 수)                                                               | SSR 스냅샷 + Socket 구독               | 입찰 시 U            |
| `/artists/[id]`                                                                    | 작가 소개 + 작품                                                                                                            | ISR                                    | -                    |
| `/users/[id]`                                                                      | 공개 프로필 (판매 상품, 리뷰, 팔로우)                                                                                       | SSR                                    | -                    |
| `/login`                                                                           | 로그인 (이메일 + 소셜)                                                                                                      | CSR                                    | 비로그인             |
| `/signup`                                                                          | 가입 스텝 (이메일 → 코드 → 비밀번호 → 닉네임 → 완료)                                                                        | CSR                                    | 비로그인             |
| `/forgot-password`                                                                 | 비밀번호 재설정 (이메일 → 코드 → 새 비밀번호)                                                                               | CSR                                    | -                    |
| `/auth/callback/[provider]`                                                        | 소셜 로그인 복귀 처리                                                                                                       | CSR                                    | -                    |
| `/sell`                                                                            | 상품 등록 (사진 → 기본 정보 → 가격·판매 방식 → 상세(선택) → 등록)                                                           | CSR                                    | U (판매자 등록 유도) |
| `/sell/[id]/edit`                                                                  | 상품 수정                                                                                                                   | CSR                                    | S                    |
| `/cart`                                                                            | 장바구니 (판매자별 그룹)                                                                                                    | CSR                                    | U                    |
| `/checkout`                                                                        | 배송지·쿠폰·결제수단 → PG 결제창                                                                                            | CSR                                    | U                    |
| `/checkout/success` · `/checkout/fail`                                             | PG 복귀 → `/payments/confirm`                                                                                               | CSR                                    | U                    |
| `/orders/[id]`                                                                     | 주문 상세 (상태 타임라인, 배송 추적, 취소/환불/구매확정, 리뷰 작성)                                                         | CSR                                    | U                    |
| `/chat` · `/chat/[roomId]`                                                         | 채팅 목록 / 대화 (데스크톱은 2단 레이아웃)                                                                                  | CSR                                    | U                    |
| `/notifications`                                                                   | 알림 목록                                                                                                                   | CSR                                    | U                    |
| `/my`                                                                              | 마이페이지 요약                                                                                                             | CSR                                    | U                    |
| `/my/purchases` · `/my/sales` · `/my/bids` · `/my/wins`                            | 구매/판매/입찰/낙찰 기록                                                                                                    | CSR                                    | U                    |
| `/my/favorites` · `/my/recent`                                                     | 관심상품 / 최근 본 상품                                                                                                     | CSR                                    | U                    |
| `/my/following`                                                                    | 팔로잉                                                                                                                      | CSR                                    | U                    |
| `/my/settings`                                                                     | 프로필, 비밀번호, 배송지, 알림(Web Push), 테마, 탈퇴                                                                        | CSR                                    | U                    |
| `/my/settings/devices`                                                             | 기기(세션) 관리                                                                                                             | CSR                                    | U                    |
| `/seller`                                                                          | 판매자 대시보드 (요약·통계)                                                                                                 | CSR                                    | S                    |
| `/seller/products` · `/seller/auctions` · `/seller/orders` · `/seller/settlements` | 상품/경매/주문·배송/정산 관리                                                                                               | CSR                                    | S                    |
| `/seller/auctions/new?productId=`                                                  | 경매 등록                                                                                                                   | CSR                                    | S                    |
| `/admin/*`                                                                         | 관리자 (대시보드, 회원, 판매자, 상품·검수, 경매, 정책, 주문, 결제, 정산, 신고, 카테고리, 배너, 공지, 쿠폰, 감사 로그)       | CSR, `noindex`                         | A                    |
| `/notices` · `/notices/[id]`                                                       | 공지사항                                                                                                                    | ISR                                    | -                    |
| `/terms` · `/privacy`                                                              | 약관                                                                                                                        | SSG                                    | -                    |
| `/sitemap.xml` · `/robots.txt`                                                     | SEO                                                                                                                         | 동적 생성                              | -                    |

## 레이아웃

- `app/layout.tsx`: 폰트(Pretendard, `next/font/local` self-host), 테마 스크립트, QueryClientProvider, 소켓 Provider, Toaster.
- `(shop)` 그룹: 헤더(로고 · 검색 · 카테고리 · 판매하기 · 알림 · 채팅 · 마이) + 푸터. 모바일(<768px)은 하단 탭 바 (홈 · 검색 · 판매 · 경매 · 마이) 로 전환.
- `(auth)` 그룹: 중앙 정렬 단일 폼, 헤더 최소화.
- `admin` : 좌측 사이드 내비 + 테이블 중심.

## 인증 가드

- Next `proxy.ts`(구 middleware)는 쿠키 존재 여부로 `/my`, `/sell`, `/seller`, `/admin`, `/checkout` 접근 시 `/login?next=` 로 보낸다. (UX 목적 — 실제 권한은 API 가 검증)
- 클라이언트 `useAuth()` 가 부팅 시 `/auth/refresh` 로 access 토큰 확보.

## 상태 관리

| 종류               | 도구                                                              |
| ------------------ | ----------------------------------------------------------------- |
| 서버 데이터        | TanStack Query (키: `['products', filters]`, `['auction', id]` …) |
| 인증 토큰 / 사용자 | Zustand `useAuthStore` (메모리)                                   |
| 실시간             | Socket 이벤트 → `queryClient.setQueryData` 로 캐시 갱신           |
| 필터/정렬          | URL searchParams (공유·뒤로가기 보존)                             |
| UI (토스트, 테마)  | Zustand                                                           |

## SEO

- `/products/[id]`: `generateMetadata` → title `"{상품명} - {작가} | 화소"`, description(설명 160자), `alternates.canonical`, OG image(대표 이미지 1600), JSON-LD `Product` + `Offer`(FIXED) / `AggregateOffer`(AUCTION: lowPrice=currentPrice) + `availability`.
- 삭제/숨김 상품 → 404, 판매 완료 → 200 + `SoldOut`.
- `sitemap.xml`: 활성 상품·카테고리·작가.

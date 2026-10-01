# WEB ROUTES

Next.js 16 App Router (`apps/web/src/app`). 렌더링: **SSR/ISR = 검색엔진 노출 필요 + 공개 데이터**, **CSR = 사용자별 데이터**.

| 경로                                                                                     | 화면                                                                                                                        | 렌더링                                 | 인증                 |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------- |
| `/`                                                                                      | 홈: 검색, 카테고리, 인기 상품, 오늘의 경매, 마감 임박, 신규 등록, 인기 작가, 추천 컬렉션, (로그인 시) 관심상품·최근 본 상품 | ISR 60s + CSR 개인화 섹션              | -                    |
| `/search?q=&…`                                                                           | 검색 결과 + 필터 + 정렬 (URL 이 필터 상태의 원천)                                                                           | SSR 첫 페이지¹ + 무한 스크롤           | -                    |
| `/category/[slug]`                                                                       | 카테고리 목록 + 필터                                                                                                        | ISR 60s + 첫 페이지 동봉¹              | -                    |
| `/products/[id]`                                                                         | 상품 상세 (갤러리/줌, 정보, 판매자, 인증서·출처, 배송·반품, 문의)                                                           | ISR 60s + `generateMetadata` + JSON-LD | -                    |
| `/auctions`                                                                              | 경매 목록 (진행 중/예정/종료 탭, 마감 임박순)                                                                               | SSR                                    | -                    |
| `/auctions/[id]`                                                                         | 실시간 경매 (현재가, 타이머, 입찰 패널, 입찰 기록, 참여자 수)                                                               | SSR 스냅샷 + Socket 구독               | 입찰 시 U            |
| `/artists/[id]`                                                                          | 작가 소개 + 작품                                                                                                            | ISR                                    | -                    |
| `/users/[id]`                                                                            | 공개 프로필 (판매 상품, 리뷰, 팔로우)                                                                                       | SSR                                    | -                    |
| `/login`                                                                                 | 로그인 (이메일 + 소셜)                                                                                                      | CSR                                    | 비로그인             |
| `/signup`                                                                                | 가입 스텝 (이메일 → 코드 → 비밀번호 → 닉네임 → 완료)                                                                        | CSR                                    | 비로그인             |
| `/forgot-password`                                                                       | 비밀번호 재설정 (이메일 → 코드 → 새 비밀번호)                                                                               | CSR                                    | -                    |
| `/auth/callback/[provider]`                                                              | 소셜 로그인 복귀 처리                                                                                                       | CSR                                    | -                    |
| `/sell`                                                                                  | 상품 등록 (사진 → 기본 정보 → 가격·판매 방식 → 상세(선택) → 등록)                                                           | CSR                                    | U (판매자 등록 유도) |
| `/sell/[id]/edit`                                                                        | 상품 수정                                                                                                                   | CSR                                    | S                    |
| `/cart`                                                                                  | 장바구니 (판매자별 그룹)                                                                                                    | CSR                                    | U                    |
| `/checkout`                                                                              | 배송지·쿠폰·결제수단 → PG 결제창                                                                                            | CSR                                    | U                    |
| `/checkout/success` · `/checkout/fail`                                                   | PG 복귀 → `/payments/confirm`                                                                                               | CSR                                    | U                    |
| `/app-bridge/pay` · `/app-bridge/identity` · `/app-bridge/postcode` · `/app-bridge/done` | 앱 전용: 토스 결제창·PASS 본인인증·우편번호를 열고 결과를 앱 스킴으로 복귀 (docs/MOBILE_NAVIGATION.md)                      | CSR                                    | P                    |
| `/orders/[id]`                                                                           | 주문 상세 (상태 타임라인, 배송 추적, 취소/환불/구매확정, 리뷰 작성)                                                         | CSR                                    | U                    |
| `/chat` · `/chat/[roomId]`                                                               | 채팅 목록 / 대화 (데스크톱은 2단 레이아웃)                                                                                  | CSR                                    | U                    |
| `/notifications`                                                                         | 알림 목록                                                                                                                   | CSR                                    | U                    |
| `/my`                                                                                    | 마이페이지 요약                                                                                                             | CSR                                    | U                    |
| `/my/purchases` · `/my/sales` · `/my/bids` · `/my/wins`                                  | 구매/판매/입찰/낙찰 기록                                                                                                    | CSR                                    | U                    |
| `/my/favorites` · `/my/recent`                                                           | 관심상품 / 최근 본 상품                                                                                                     | CSR                                    | U                    |
| `/my/following`                                                                          | 팔로잉                                                                                                                      | CSR                                    | U                    |
| `/my/settings`                                                                           | 프로필, 비밀번호, 배송지, 알림(Web Push), 테마, 탈퇴                                                                        | CSR                                    | U                    |
| `/my/settings/devices`                                                                   | 기기(세션) 관리                                                                                                             | CSR                                    | U                    |
| `/seller`                                                                                | 판매자 대시보드 (요약·통계)                                                                                                 | CSR                                    | S                    |
| `/seller/products` · `/seller/auctions` · `/seller/orders` · `/seller/settlements`       | 상품/경매/주문·배송/정산 관리                                                                                               | CSR                                    | S                    |
| `/seller/auctions/new?productId=`                                                        | 경매 등록                                                                                                                   | CSR                                    | S                    |
| `/admin/*`                                                                               | 관리자 (대시보드, 회원, 판매자, 상품·검수, 경매, 정책, 주문, 결제, 정산, 신고, 카테고리, 배너, 공지, 쿠폰, 감사·서버 로그)  | CSR, `noindex`                         | A                    |
| `/notices` · `/notices/[id]`                                                             | 공지사항                                                                                                                    | ISR                                    | -                    |
| `/terms` · `/privacy`                                                                    | 약관                                                                                                                        | SSG                                    | -                    |
| `/policy/refund`                                                                         | 청약철회·환불 안내                                                                                                          | SSG                                    | -                    |
| `/policies/[slug]`                                                                       | 앱 정책 주소 호환 — `/terms`·`/privacy`·`/policy/*` 로 308                                                                  | -                                      | -                    |
| `/support`                                                                               | 고객센터 (연락처·공지·정책·계정 삭제 안내)                                                                                  | SSG                                    | -                    |
| `/account-deletion`                                                                      | 계정 삭제 안내 (Google Play 공개 삭제 요청 URL)                                                                             | SSG                                    | -                    |
| `/consent`                                                                               | 필수 동의(약관·개인정보·만 14세) + 선택 마케팅 — `consentRequired` 회원은 여기로                                            | CSR                                    | U                    |
| `/sitemap.xml` · `/robots.txt`                                                           | SEO                                                                                                                         | 동적 생성                              | -                    |

¹ 목록 첫 페이지: `/search` 는 서버가 첫 페이지(24개)를 받아 HTML 에 바로 그린다 — 단, 서버 요청은 60초 캐시(`serverApi`)를 쓰므로 캐시 키가 끝없이 늘 수 있는 검색어·가격·시대/재질/지역 필터와 모르는 카테고리는 기존처럼 클라이언트에서 조회한다(탭 `신착`·`인기`, 카테고리·판매 방식·상태·인증 필터만 해당). `/category/[slug]` 는 정적(ISR) 화면이라 목록은 클라이언트가 그리지만(`useSearchParams` → Suspense), 필터 없는 첫 페이지를 RSC 로 함께 받아 API 왕복이 없다. 서버는 첫 페이지를 최대 2초(`SEED_TIMEOUT_MS`)만 기다리고, 넘거나 실패하면 기존처럼 클라이언트가 조회한다. 서버 사본은 비로그인 기준(관심 표시 없음)이라 로그인한 적 있는 브라우저(세션 힌트)는 마운트 때 다시 받는다. 조회 조건 ↔ URL 변환은 `components/search/search-params.ts` 하나로 서버·클라이언트가 함께 쓴다.

## 레이아웃

- `app/layout.tsx`: 폰트(Pretendard 가변 글꼴 dynamic subset CSS — `unicode-range` 조각을 화면 글자에 필요한 것만 받고 `font-display: swap`), 테마 스크립트, QueryClientProvider, 실시간 동기화(로그인 사용자만 socket.io 를 지연 로딩), Toaster.
- `(shop)` 그룹: 헤더(로고 · 검색 · 판매하기 · 알림 · 채팅 · 마이) + 탐색 탭(추천 · 경매 · 신착 · 인기)과 오른쪽 끝 "카테고리" 시트(대분류별 소분류 타일: 대표 작품 사진 · 작품 수) + 푸터. 모바일(<768px)은 하단 탭 바 (홈 · 검색 · 판매 · 경매 · 마이) 로 전환.
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

## 성능

측정·변경 기록 (2026-10, `next build && next start` + Lighthouse 12, 이슈 #240). 원칙은 "첫 화면에 필요 없는 JS 는 공통 번들에서 빼고, LCP 이미지는 HTML 에서 바로 찾게".

- **공통 번들에 zod 를 넣지 않는다**: `@shop/shared` 는 `sideEffects` 로 쓰지 않는 모듈을 버리지만, 모든 화면이 쓰는 `api-client` 가 zod 스키마가 있는 파일의 상수를 가져오면 zod 전체(약 100KB gzip)가 따라온다. 그래서 재인증 상수는 `reauth.ts`(zod 없음)에 둔다. 공용 상수·헬퍼는 zod 를 쓰지 않는 파일에 둘 것 — 폼 검증 스키마가 필요한 화면(로그인·판매 등)만 zod 를 받는다.
- **처음 열 때 불러오는 것** (`next/dynamic`, `ssr: false`): 카테고리 시트·검색 필터 시트(Radix Dialog), 상품 확대 보기(`product/zoom-viewer.tsx`), 신고 대화상자, 날짜 선택기(`ui/date-picker-lazy.tsx`, react-day-picker — 판매 화면 링크 미리 받기에서도 빠진다), socket.io(로그인 사용자). 누르기 전 `pointerenter`·`focus` 에서 미리 받는다.
- **이미지 `sizes`**: 데스크톱 2단(상세 갤러리·경매·홈 배너)은 페이지 최대 폭 1280 의 3/5 이므로 `(min-width: 1280px) 700px`(배너 740px) 상한을 둔다 — `60vw` 만 두면 넓은 화면(DPR 1)에서 1600 파생본을 고른다. LCP 이미지는 `priority`(eager + `fetchpriority=high`), 나머지는 lazy.
- **업로드**: 올리기 전에 브라우저에서 긴 변 2400px 로 줄이고(JPEG q0.85, PNG·WebP 는 투명도를 지키려 WebP q0.9, 더 커지면 원본) 3장씩 동시에 올린다 — `lib/upload.ts`, 앱 `apps/mobile/src/lib/upload.ts` 와 같은 규칙. GIF·HEIC 는 그대로 보내 서버가 처리한다. 줄여도 30MB 를 넘으면 보내지 않는다.
- 공개 페이지 서버 요청은 웹 서버 한 IP 에서 나가 API 전역 IP 한도(300/분)를 함께 쓴다 — 동적 렌더 화면에서 서버 요청을 늘릴 때는 캐시(`serverApi` 60초)를 쓰고 캐시 키가 무한히 늘지 않게 한다. 실패하면 `safe()` 로 null 을 받아 클라이언트 조회로 넘어간다.

## SEO

- `/products/[id]`: `generateMetadata` → title `"{상품명} - {작가} | 화소"`, description(설명 160자), `alternates.canonical`, OG image(대표 이미지 1600), JSON-LD `Product` + `Offer`(FIXED) / `AggregateOffer`(AUCTION: lowPrice=currentPrice) + `availability`.
- 삭제/숨김 상품 → 404, 판매 완료 → 200 + `SoldOut`.
- `sitemap.xml`: 활성 상품·카테고리·작가.

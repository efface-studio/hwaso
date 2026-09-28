# DESIGN SYSTEM

> **UI 가 작품보다 눈에 띄면 안 된다.**

기준: [ds.efface.dev](https://ds.efface.dev) 의 토큰 체계(bg / surface / fg / fg-dim / line / accent, Pretendard, 4px 간격 단위, ease-out-quart)를 따르고, 서비스 성격(이미지 중심 커머스)에 맞게 **메인 컬러를 차분한 초록**으로, radius·shadow 를 더 절제해 조정했다. 토큰 원본은 `packages/tokens` 하나이며 Web(CSS 변수, Tailwind v4 `@theme`) 과 Mobile(JS 객체) 이 같은 값을 쓴다.

## 1. Color

라이트/다크 두 테마. Web 은 `prefers-color-scheme` 기본 + 사용자 선택(`data-theme`) 저장, Mobile 은 시스템 설정 + 앱 설정.

| Token                  | Light       | Dark        | 용도                                             |
| ---------------------- | ----------- | ----------- | ------------------------------------------------ |
| `background`           | `#FFFFFF`   | `#0A0A0B`   | 페이지 배경                                      |
| `background-soft`      | `#FAFAFA`   | `#101013`   | 섹션 구분 배경, 이미지 로딩 영역                 |
| `surface`              | `#FFFFFF`   | `#141418`   | 시트·다이얼로그·팝오버                           |
| `surface-2`            | `#F5F5F5`   | `#1B1B21`   | 입력 배경(filled), hover                         |
| `foreground`           | `#0A0A0A`   | `#F6F6F7`   | 본문·제목                                        |
| `foreground-2`         | `#171717`   | `#EDEDEF`   | 보조 제목                                        |
| `muted`                | `#5C5C5C`   | `#9B9BA4`   | 설명, 메타 정보 (AA 대비 충족)                   |
| `faint`                | `#707070`   | `#8A8A93`   | placeholder, 비활성 (본문에 쓰지 않음)           |
| `border`               | `#E5E5E5`   | `#FFFFFF17` | 기본 구분선                                      |
| `border-soft`          | `#F0F0F0`   | `#FFFFFF0D` | 리스트 구분                                      |
| `border-strong`        | `#D4D4D4`   | `#FFFFFF29` | 입력 테두리, 포커스 전                           |
| `primary`              | `#2F7A58`   | `#5FAE86`   | 주요 CTA, 선택 상태, 링크                        |
| `primary-hover`        | `#276849`   | `#74BD97`   |                                                  |
| `primary-soft`         | `#2F7A5812` | `#5FAE8624` | 선택된 칩 배경                                   |
| `primary-foreground`   | `#FFFFFF`   | `#07140E`   | primary 위 텍스트                                |
| `secondary`            | `#0A0A0A`   | `#F6F6F7`   | 보조 강조 버튼(검정/흰색)                        |
| `secondary-foreground` | `#FFFFFF`   | `#0A0A0B`   |                                                  |
| `destructive`          | `#B91C1C`   | `#F0443A`   | 삭제, 오류, **경매 마감 임박**                   |
| `success`              | `#1F8A4C`   | `#4CC38A`   | 완료 상태                                        |
| `warning`              | `#B45309`   | `#F5A524`   | 주의                                             |
| `live`                 | `#B91C1C`   | `#F0443A`   | LIVE 배지 (destructive 와 동일 값)               |
| `live-foreground`      | `#FFFFFF`   | `#0A0A0B`   | LIVE 배지 글자 (다크는 밝은 채움 위 어두운 글자) |
| `focus-ring`           | `#2F7A58`   | `#5FAE86`   | 2px outline + 2px offset                         |

- 초록은 **너무 진하지도(#0B3D2A 류) 쨍하지도(#22C55E 류) 않은** 중채도 톤. `primary` on `background` 대비: Light 5.2:1, Dark 7.4:1 (WCAG AA).
- 색은 의미가 있을 때만: CTA · 선택 · 상태. 장식 목적의 색면·그라디언트 금지.
- 상품 이미지 뒤 배경은 항상 `background-soft` (작품 색을 왜곡하지 않는 무채색).

## 2. Typography

글꼴은 **Pretendard Variable 하나**. (ds.efface.dev 기본 sans 와 동일. Display 용 영문 서체를 섞지 않는다 — 한글 가독성·일관성 우선) 숫자는 `font-variant-numeric: tabular-nums` 로 가격·타이머 자릿수가 흔들리지 않게 한다.

| Token         | Size / Line              | Weight | Tracking | 용도                       |
| ------------- | ------------------------ | ------ | -------- | -------------------------- |
| `display`     | 40 / 48 (모바일 30 / 38) | 700    | -0.02em  | 경매 현재가 등 한 화면 1회 |
| `h1`          | 28 / 36 (모바일 22 / 30) | 700    | -0.015em | 페이지 제목                |
| `h2`          | 20 / 28                  | 700    | -0.01em  | 섹션 제목                  |
| `h3`          | 17 / 24                  | 600    | -0.005em | 카드 그룹, 폼 섹션         |
| `body`        | 15 / 24                  | 400    | 0        | 본문                       |
| `body-strong` | 15 / 24                  | 600    | 0        | 상품명(상세)               |
| `small`       | 13 / 20                  | 400    | 0        | 설명, 메타                 |
| `caption`     | 12 / 16                  | 400    | 0        | 보조 정보, 타임스탬프      |
| `label`       | 13 / 18                  | 500    | 0        | 폼 라벨, 칩, 탭            |
| `price`       | 16 / 22                  | 700    | -0.01em  | 카드 가격                  |
| `price-lg`    | 24 / 32                  | 700    | -0.015em | 상세 가격                  |

정보 계층 (상품 카드): **이미지 → 가격 → 작가 → 상품명 → 부가(남은 시간/판매 방식)**. 작가는 `small`+`muted`, 상품명은 `small`+`foreground` 1줄 말줄임, 가격은 `price`.

## 3. Spacing (4px 단위)

| Token | px  |
| ----- | --- |
| `xs`  | 4   |
| `sm`  | 8   |
| `md`  | 12  |
| `lg`  | 16  |
| `xl`  | 24  |
| `2xl` | 32  |
| `3xl` | 48  |
| `4xl` | 64  |

- 페이지 좌우 여백: 모바일 16, 태블릿 24, 데스크톱 32. 최대 폭 1280 (ds `container-page` 1400 보다 좁혀 작품 밀도 유지).
- 상품 그리드 gap: 모바일 가로 8 / 세로 24, 데스크톱 가로 16 / 세로 32.

## 4. Radius — 절제

| Token  | px   | 사용처                              |
| ------ | ---- | ----------------------------------- |
| `none` | 0    | **상품 이미지(기본)**, 갤러리, 배너 |
| `sm`   | 4    | 버튼, 입력, 칩, 배지, 카드 컨테이너 |
| `md`   | 6    | 드롭다운, 팝오버, 토스트            |
| `lg`   | 10   | 다이얼로그, 바텀시트 상단           |
| `full` | 9999 | 아바타, 토글 스위치 손잡이만        |

모든 요소에 큰 radius 를 일괄 적용하지 않는다. 작품 이미지는 모서리를 깎지 않는다 (작품의 형태 보존).

## 5. Shadow — elevation 이 필요할 때만

| Token  | 값                                                                   | 사용처                               |
| ------ | -------------------------------------------------------------------- | ------------------------------------ |
| `none` | none                                                                 | 카드, 버튼, 입력 (기본)              |
| `sm`   | `0 1px 2px rgb(0 0 0 / 0.06)`                                        | 고정 헤더 스크롤 시, 스티키 CTA 바   |
| `md`   | `0 8px 24px rgb(0 0 0 / 0.12)` (다크: `0 8px 24px rgb(0 0 0 / 0.5)`) | 팝오버, 드롭다운, 다이얼로그, 토스트 |

카드는 그림자 대신 여백과 `border` 로 구분한다.

## 6. Motion

| Token           | 값                                                |
| --------------- | ------------------------------------------------- |
| `duration-fast` | 120ms                                             |
| `duration-base` | 200ms                                             |
| `ease-out`      | `cubic-bezier(.25, 1, .5, 1)` (ds ease-out-quart) |

애니메이션은 **의미가 있을 때만**:

- 입찰 성공 / 가격 변경: 가격 텍스트 배경을 `primary-soft` 로 600ms 하이라이트 후 복귀
- 관심상품 토글: 아이콘 scale 1 → 1.15 → 1 (150ms)
- 장바구니 담기 / 저장: 토스트
- 시트·다이얼로그 열림/닫힘, 페이지 전환(모바일 네이티브 스택)
- **오버레이는 반드시 등장·퇴장 애니메이션** (팝업·모달·시트·메뉴·셀렉트·툴팁·토스트, `globals.css` 의 `animate-*`):
  - 배경 딤: `overlay-in/out` 페이드 200/160ms
  - 하단 시트·측면 패널: `sheet-in/out-{bottom,right,left}` 슬라이드 320~340ms `cubic-bezier(.32,.72,0,1)`, 닫힘 220ms
  - 다이얼로그·드롭다운·팝오버·셀렉트·툴팁: `pop-in/out` 페이드 + scale .96, 200/140ms (메뉴는 트리거 쪽이 기준점)
  - 토스트: `toast-in` 아래에서 12px 떠오름 260ms
  - 앱(RN)은 OS 기본 표현(pageSheet·slide)으로 같은 원칙을 지킨다
- `prefers-reduced-motion`·시니어 모드 시 전부 끔 (즉시 표시)

금지: 스크롤 등장 fade/slide, parallax, bounce, 무한 반복 장식 애니메이션.

## 7. Iconography

- `lucide-react` / `lucide-react-native` 단일 세트, stroke 1.5, 20/24px.
- 기능을 설명하는 아이콘만 (검색, 관심, 공유, 알림, 채팅, 뒤로, 필터, 카메라).
- **금지**: Sparkle, Wand, Bot/AI, 그라디언트 아이콘, 장식 이모지.

## 8. 컴포넌트

ds.efface.dev 의 컴포넌트 구성(buttons / inputs / form / chips / cards / lists / skeleton / auth / layout / banner)을 기준으로 삼고, 접근성 동작은 Web 은 Radix UI Primitives, Mobile 은 React Native 기본 + `@gorhom/bottom-sheet` 로 구현한다.

| 컴포넌트                  | Web (`apps/web/src/components/ui`)                                                              | Mobile (`apps/mobile/src/components/ui`)               | 비고                       |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------- |
| Button                    | ✓ variant: primary / secondary / outline / ghost / destructive · size: sm(32) / md(40) / lg(48) | ✓ 최소 높이 48                                         | 로딩 시 스피너 + 폭 유지   |
| IconButton                | ✓                                                                                               | ✓                                                      | 터치 타깃 44×44 이상       |
| Input / Textarea          | ✓ 라벨·도움말·오류 슬롯                                                                         | ✓                                                      | 오류는 `aria-describedby`  |
| PriceInput                | ✓ 천 단위 콤마, 정수만                                                                          | ✓ `number-pad`                                         |                            |
| Select / NativeSelect     | Radix Select                                                                                    | 네이티브 Picker 시트                                   |                            |
| DateTimeInput             | 커스텀 캘린더 팝오버 + 오전/오후·시·분 선택 (브라우저 기본 date/datetime 입력 금지)             | OS 기본 DateTimePicker(iOS compact·Android 다이얼로그) | 값은 `YYYY-MM-DD[THH:mm]`  |
| Checkbox / Radio / Switch | Radix                                                                                           | ✓                                                      |                            |
| Tabs                      | Radix                                                                                           | 상단 세그먼트                                          |                            |
| Dialog / Modal            | Radix Dialog                                                                                    | RN Modal                                               |                            |
| Drawer / Bottom Sheet     | Radix Dialog(side)                                                                              | @gorhom/bottom-sheet                                   | 모바일 필터 = 바텀시트     |
| Dropdown / Context Menu   | Radix DropdownMenu                                                                              | ActionSheet                                            |                            |
| Tooltip / Popover         | Radix                                                                                           | —                                                      | 모바일은 사용 안 함        |
| Toast                     | 자체 (Zustand 큐)                                                                               | 자체                                                   | 3초, 중요 오류는 수동 닫기 |
| Alert                     | ✓ info/success/warning/destructive                                                              | ✓                                                      |                            |
| Badge                     | ✓ (LIVE, 판매방식, 검수 상태)                                                                   | ✓                                                      |                            |
| Avatar                    | ✓                                                                                               | ✓                                                      |                            |
| Skeleton                  | ✓ ds skeleton-base/shine                                                                        | ✓                                                      | 이미지 비율 유지           |
| Progress                  | ✓ (업로드)                                                                                      | ✓                                                      |                            |
| Pagination                | ✓ (관리자 표)                                                                                   | —                                                      | 사용자 목록은 무한 스크롤  |
| Breadcrumb                | ✓ (카테고리, 상세)                                                                              | —                                                      |                            |
| Accordion                 | Radix                                                                                           | ✓                                                      | 상세 정보 접기             |
| Carousel                  | 자체 (scroll-snap)                                                                              | FlatList paging                                        | 상품 갤러리                |
| Table                     | ✓ (관리자·판매자)                                                                               | —                                                      |                            |
| Command / Search          | 자체 검색 + 자동완성 (listbox 패턴)                                                             | 검색 화면                                              |                            |
| DatePicker                | `<input type="datetime-local">`                                                                 | 네이티브 DateTimePicker                                | 경매 시작/종료             |

도메인 컴포넌트: `ProductCard`, `ProductGrid`, `AuctionCountdown`, `BidPanel`, `BidHistory`, `PriceTag`, `SaleTypeBadge`, `VerificationBadge`, `SellerSummary`, `ImageGallery`(+Zoom), `FilterPanel`/`FilterSheet`, `SortSelect`, `ImageUploader`, `EmptyState`.

## 9. 검수 표기 원칙 (신뢰)

인증서·출처 정보는 판매자가 제공한 정보다. 플랫폼이 확인하지 않은 정보를 공식 인증처럼 보이게 하지 않는다.

| verificationStatus | 표기                                                                |
| ------------------ | ------------------------------------------------------------------- |
| UNVERIFIED         | "판매자 제공 정보" (회색 텍스트, 배지 없음)                         |
| PENDING            | "검수 중" (outline 배지)                                            |
| VERIFIED           | "플랫폼 검수 완료" (primary 배지) + 검수일                          |
| REJECTED           | 표기 대신 판매자 제공 정보 섹션 숨김, 관리자 사유 판매자에게만 노출 |

## 10. 금지 목록 (AI 스타일 배제)

- 그라디언트 (배경·버튼·텍스트·아이콘 모두), 오브/글로우/네온, 3D 추상 도형
- Glassmorphism (반투명 카드, backdrop-blur, glowing border) — 예외 없음
- 거대한 중앙 Hero + 추상 카피("The future of …"). 홈 첫 화면은 **검색 + 카테고리 + 작품**
- 모든 요소 동일한 큰 radius, 모든 카드에 그림자, floating card
- Sparkle/Wand/AI 아이콘, 의미 없는 등장 애니메이션

## 11. 레이아웃 원칙

1. 상품이 UI 보다 중요하다 — 이미지가 카드 면적의 70% 이상.
2. 정보 구조가 장식보다 중요하다.
3. 사용자가 다음 행동을 즉시 알 수 있어야 한다 — 화면당 primary CTA 1개.
4. 상세 페이지: 데스크톱 좌 이미지(60%) / 우 정보·구매 패널(스티키). 모바일: 이미지 전폭 → 정보 → 하단 고정 CTA 바.
5. 모바일은 축소판이 아니다 — 하단 탭, 바텀시트 필터, 하단 고정 CTA, 전폭 이미지.

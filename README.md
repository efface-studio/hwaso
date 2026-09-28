# 화소(畫所)

> 작품과 사람이 만나는 곳

미술품 · 역사적 제품 · 골동품 · 컬렉터블 거래 마켓플레이스와 **실시간 온라인 경매** 플랫폼.
Web(Next.js) · iOS/Android(Expo) · API(NestJS) 모노레포.

## 문서

| 문서                                           | 내용                                                    |
| ---------------------------------------------- | ------------------------------------------------------- |
| [ARCHITECTURE](docs/ARCHITECTURE.md)           | 모노레포, 런타임 구성, 모듈, 이미지·검색·캐시           |
| [DATABASE](docs/DATABASE.md)                   | 엔티티, enum, 제약, 인덱스                              |
| [API](docs/API.md)                             | REST 엔드포인트, 에러 포맷, WebSocket 이벤트            |
| [AUCTION](docs/AUCTION.md)                     | 상태 머신, 입찰 동시성, 연장, 종료 워커, 타이머         |
| [AUTH](docs/AUTH.md)                           | 토큰, OTP, 소셜 로그인, 세션/기기, RBAC                 |
| [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md)         | 토큰(색·타이포·간격·radius·shadow), 컴포넌트, 금지 목록 |
| [WEB_ROUTES](docs/WEB_ROUTES.md)               | 웹 라우트, 렌더링 전략, SEO                             |
| [MOBILE_NAVIGATION](docs/MOBILE_NAVIGATION.md) | 모바일 내비게이션, 딥링크, 네이티브 기능                |
| [SECURITY](docs/SECURITY.md)                   | 위협별 대응                                             |
| [TESTING](docs/TESTING.md)                     | 테스트 계층과 필수 케이스                               |

## 로컬 실행

필요: Node 22+, pnpm 11, Docker.

```bash
pnpm install
pnpm infra:up                                   # PostgreSQL 5433 · Redis 6380 · RustFS 9000 · Mailpit 8025
cp apps/api/.env.example apps/api/.env          # 값 채우기 (키가 없는 연동은 개발용 모의 동작)
pnpm --filter @shop/api exec prisma migrate deploy
pnpm --filter @shop/api db:seed                 # 예시 작품·경매·계정
pnpm --filter @shop/api dev                     # API http://localhost:4000/api/v1
pnpm --filter @shop/web dev                     # 웹 http://localhost:3000
```

앱(Expo):

```bash
pnpm --filter @shop/mobile start                # Expo 개발 서버 — 개발 빌드 또는 에뮬레이터에서 열기
pnpm --filter @shop/mobile web                  # 브라우저 미리보기 (API WEB_ORIGIN 에 http://localhost:8081 추가)
```

앱은 개발 중 Metro 가 떠 있는 PC 주소로 API 를 찾는다. 배포 빌드는 `EXPO_PUBLIC_API_URL` 등을 EAS 프로필에 넣는다.

검사: `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`

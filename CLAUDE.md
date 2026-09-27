# CLAUDE.md

작업 규칙(이슈 → 브랜치 → PR, 커밋 컨벤션, 라벨, CI)은 AI-Markdown 공통 규칙을 따른다.

## 프로젝트 컨텍스트

- **프로젝트명**: Efface Shop — 미술품·컬렉터블 마켓플레이스 + 실시간 경매
- **스택**: pnpm monorepo · NestJS 11 / Prisma 6 / PostgreSQL 16 / Redis 7 / Socket.IO · Next.js 16 / Tailwind 4 / TanStack Query / Zustand · Expo / React Navigation
- **기본 브랜치**: `main`
- **설계 문서**: `docs/*.md` — 구현은 문서를 기준으로 하고, 동작이 바뀌면 문서도 함께 수정한다.
- **절대 원칙**: 경매 가격·상태·종료 시간·최고 입찰자는 서버만 결정한다 (docs/AUCTION.md).
- **로컬 포트**: PostgreSQL 5433 (3306 은 기존 MariaDB), Redis 6380, S3(RustFS) 9000/9001, Mailpit 8025

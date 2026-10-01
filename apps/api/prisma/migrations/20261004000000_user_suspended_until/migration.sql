-- 기간 정지: null 이면 영구 정지 (docs/API.md Admin)
ALTER TABLE "User" ADD COLUMN "suspendedUntil" TIMESTAMPTZ;

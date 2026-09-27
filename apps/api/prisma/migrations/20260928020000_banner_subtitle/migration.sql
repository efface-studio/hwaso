-- 배너 보조 문구와 글자 색
ALTER TABLE "Banner" ADD COLUMN "subtitle" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "tone" TEXT NOT NULL DEFAULT 'dark';

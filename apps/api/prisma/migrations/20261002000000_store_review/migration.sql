-- 스토어 심사 대응 (#202): 필수 동의 분리 · 마케팅 동의 일시 · Apple 토큰 폐기용 refresh 토큰

ALTER TABLE "User" ADD COLUMN "privacyAgreedAt" TIMESTAMPTZ,
  ADD COLUMN "ageConfirmedAt" TIMESTAMPTZ,
  ADD COLUMN "marketingAgreedAt" TIMESTAMPTZ;

-- 기존 가입자는 가입 시 약관 동의 화면에서 개인정보·연령을 함께 확인했으므로 같은 시각으로 채운다
-- (약관 동의 기록이 없는 계정만 다음 로그인 때 동의 화면을 거친다)
UPDATE "User"
SET "privacyAgreedAt" = "termsAgreedAt",
    "ageConfirmedAt" = "termsAgreedAt"
WHERE "termsAgreedAt" IS NOT NULL;

UPDATE "User"
SET "marketingAgreedAt" = COALESCE("termsAgreedAt", "createdAt")
WHERE "marketingOptIn" = true;

ALTER TABLE "SocialAccount" ADD COLUMN "refreshTokenEnc" TEXT,
  ADD COLUMN "tokenClientId" TEXT;

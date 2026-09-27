-- 약관 동의 시각, 본인인증(PASS) 결과
ALTER TABLE "User" ADD COLUMN "termsAgreedAt" TIMESTAMPTZ,
  ADD COLUMN "identityVerifiedAt" TIMESTAMPTZ,
  ADD COLUMN "ciHash" TEXT,
  ADD COLUMN "isAdult" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "verifiedNameMasked" TEXT,
  ADD COLUMN "phoneMasked" TEXT;

CREATE UNIQUE INDEX "User_ciHash_key" ON "User"("ciHash");

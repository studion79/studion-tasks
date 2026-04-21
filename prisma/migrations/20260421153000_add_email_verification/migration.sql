ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" DATETIME;

UPDATE "User"
SET "emailVerifiedAt" = CURRENT_TIMESTAMP
WHERE "emailVerifiedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "inviteToken" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "usedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationToken_tokenHash_key"
  ON "EmailVerificationToken"("tokenHash");

CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_idx"
  ON "EmailVerificationToken"("userId");

CREATE INDEX IF NOT EXISTS "EmailVerificationToken_expiresAt_idx"
  ON "EmailVerificationToken"("expiresAt");

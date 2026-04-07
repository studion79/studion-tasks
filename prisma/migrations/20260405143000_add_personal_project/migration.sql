ALTER TABLE "Project" ADD COLUMN "isPersonal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "personalOwnerId" TEXT;
CREATE INDEX IF NOT EXISTS "Project_isPersonal_idx" ON "Project"("isPersonal");
CREATE UNIQUE INDEX IF NOT EXISTS "Project_personalOwnerId_key" ON "Project"("personalOwnerId");

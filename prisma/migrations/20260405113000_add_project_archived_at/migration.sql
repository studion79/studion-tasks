ALTER TABLE "Project" ADD COLUMN "archivedAt" DATETIME;
CREATE INDEX "Project_archivedAt_idx" ON "Project"("archivedAt");

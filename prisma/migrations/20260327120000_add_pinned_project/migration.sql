-- Add isPinned to ProjectMember for per-user project pinning
ALTER TABLE "ProjectMember" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;

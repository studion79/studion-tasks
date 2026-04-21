ALTER TABLE "UserProjectGroup" ADD COLUMN "description" TEXT;
ALTER TABLE "ProjectMember" ADD COLUMN "projectOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Group" ADD COLUMN "parentId" TEXT;
CREATE INDEX "Group_projectId_parentId_position_idx" ON "Group"("projectId", "parentId", "position");

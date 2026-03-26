-- CreateTable
CREATE TABLE "ProjectLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectAId" TEXT NOT NULL,
    "projectBId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectLink_projectAId_fkey" FOREIGN KEY ("projectAId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectLink_projectBId_fkey" FOREIGN KEY ("projectBId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectLink_projectAId_projectBId_key" ON "ProjectLink"("projectAId", "projectBId");

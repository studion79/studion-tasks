CREATE TABLE "UserProjectGroup" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "position"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserProjectGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "ProjectMember" ADD COLUMN "userGroupId" TEXT REFERENCES "UserProjectGroup"("id") ON DELETE SET NULL;

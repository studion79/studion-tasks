CREATE TABLE IF NOT EXISTS "UserNotificationSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "dndEnabled" BOOLEAN NOT NULL DEFAULT false,
  "dndStart" TEXT NOT NULL DEFAULT '22:00',
  "dndEnd" TEXT NOT NULL DEFAULT '08:00',
  "dndWeekendsOnly" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserNotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserNotificationSettings_userId_key" ON "UserNotificationSettings"("userId");

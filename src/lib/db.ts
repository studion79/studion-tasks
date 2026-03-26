import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/generated/prisma";
import path from "path";

function createPrisma() {
  const dbUrl =
    process.env.LIBSQL_DATABASE_URL ??
    `file:${path.resolve(process.cwd(), "prisma/dev.db")}`;
  const adapter = new PrismaLibSql({ url: dbUrl });
  return new PrismaClient({ adapter } as never);
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

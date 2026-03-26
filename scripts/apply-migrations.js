#!/usr/bin/env node
const { PrismaLibSql } = require("@prisma/adapter-libsql");
const { PrismaClient } = require("../src/generated/prisma");
const path = require("path");
const fs = require("fs");

async function run() {
  const dbUrl =
    process.env.LIBSQL_DATABASE_URL ??
    "file:" + path.resolve(__dirname, "../prisma/dev.db");
  const migrationsDir = path.resolve(__dirname, "../prisma/migrations");
  const adapter = new PrismaLibSql({ url: dbUrl });
  const prisma = new PrismaClient({ adapter });

  const migrations = fs.readdirSync(migrationsDir).sort();
  for (const migration of migrations) {
    const sqlPath = path.join(migrationsDir, migration, "migration.sql");
    if (!fs.existsSync(sqlPath)) continue;
    const sql = fs.readFileSync(sqlPath, "utf8");
    const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt + ";");
      } catch (e) {
        const harmless = ["already exists", "duplicate column", "table already exists"];
        if (!harmless.some((msg) => e.message.includes(msg))) throw e;
      }
    }
    console.log("Applied:", migration);
  }
  await prisma.$disconnect();
  console.log("Database ready.");
}

run().catch((e) => { console.error(e.message); process.exit(1); });

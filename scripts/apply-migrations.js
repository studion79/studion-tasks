#!/usr/bin/env node
const { PrismaLibSql } = require("@prisma/adapter-libsql");
const { PrismaClient } = require("../src/generated/prisma");
const path = require("path");
const fs = require("fs");

const AVAILABLE_COLUMNS = [
  { type: "OWNER", label: "Owner", defaultActive: true },
  { type: "STATUS", label: "Status", defaultActive: true },
  { type: "DUE_DATE", label: "Due date", defaultActive: true },
  { type: "PRIORITY", label: "Priority", defaultActive: true },
  { type: "TIMELINE", label: "Timeline", defaultActive: false },
  { type: "BUDGET", label: "Budget", defaultActive: false },
  { type: "NOTES", label: "Notes", defaultActive: false },
];

const AVAILABLE_VIEWS = [
  { type: "SPREADSHEET", label: "Spreadsheet" },
  { type: "CARDS", label: "Cards" },
  { type: "KANBAN", label: "Kanban" },
  { type: "CALENDAR", label: "Calendar" },
];

const AVAILABLE_WIDGETS = [
  { type: "TASK_OVERVIEW", defaultActive: true },
  { type: "BY_STATUS", defaultActive: true },
  { type: "BY_OWNER", defaultActive: false },
  { type: "OVERDUE", defaultActive: true },
  { type: "BY_DUE_DATE", defaultActive: false },
  { type: "PRIORITY_BREAKDOWN", defaultActive: false },
  { type: "COMPLETION_BY_GROUP", defaultActive: false },
  { type: "BUDGET_TOTAL", defaultActive: false },
  { type: "BURNDOWN", defaultActive: false },
  { type: "VELOCITY", defaultActive: false },
];

function personalProjectData(name) {
  return {
    name,
    isPersonal: true,
    columns: {
      create: AVAILABLE_COLUMNS.map((col, index) => ({
        type: col.type,
        label: col.label,
        position: index,
        isActive: col.defaultActive,
      })),
    },
    views: {
      create: AVAILABLE_VIEWS.map((v, index) => ({
        type: v.type,
        name: v.label,
        isDefault: v.type === "SPREADSHEET",
        position: index,
      })),
    },
    dashboardWidgets: {
      create: AVAILABLE_WIDGETS.map((widget, index) => ({
        type: widget.type,
        position: index,
        isActive: widget.defaultActive,
      })),
    },
    groups: {
      create: [
        { name: "To do", color: "#6366f1", position: 0 },
        { name: "In progress", color: "#f59e0b", position: 1 },
        { name: "Done", color: "#10b981", position: 2 },
      ],
    },
  };
}

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

  // Idempotent backfill for personal projects.
  const users = await prisma.user.findMany({
    select: { id: true },
  });
  for (const user of users) {
    const existing = await prisma.project.findFirst({
      where: { personalOwnerId: user.id },
      select: { id: true },
    });
    if (existing) continue;
    const project = await prisma.project.create({
      data: {
        ...personalProjectData("Personnel"),
        personalOwnerId: user.id,
      },
      select: { id: true },
    });
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: user.id, role: "ADMIN" },
    });
    console.log("Backfilled personal project for user:", user.id);
  }
  await prisma.$disconnect();
  console.log("Database ready.");
}

run().catch((e) => { console.error(e.message); process.exit(1); });

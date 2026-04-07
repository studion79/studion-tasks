#!/usr/bin/env node
/**
 * Seed second showcase project for demo database pack.
 * Usage: node scripts/seed-demo-second.js
 */

const { PrismaLibSql } = require("@prisma/adapter-libsql");
const { PrismaClient } = require("../src/generated/prisma");
const path = require("path");

const dbUrl =
  process.env.LIBSQL_DATABASE_URL ??
  "file:" + path.resolve(__dirname, "../prisma/dev.db");

const adapter = new PrismaLibSql({ url: dbUrl });
const prisma = new PrismaClient({ adapter });

const today = new Date();
today.setHours(0, 0, 0, 0);

function d(offsetDays) {
  const date = new Date(today);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function tl(startOffset, endOffset) {
  return JSON.stringify({ start: d(startOffset), end: d(endOffset) });
}

function rec(frequency, interval) {
  return JSON.stringify({ frequency, interval });
}

async function main() {
  console.log("🌱 Création du 2e projet de démonstration…");

  const project = await prisma.project.create({
    data: {
      name: "Production Campagne Brand Film",
      description: "Projet démo orienté production audiovisuelle, validation client, budget et dépendances.",
    },
  });
  const pid = project.id;

  const cols = await Promise.all([
    prisma.projectColumn.create({ data: { projectId: pid, type: "STATUS", label: "Statut", position: 0, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "PRIORITY", label: "Priorité", position: 1, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "OWNER", label: "Responsable", position: 2, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "DUE_DATE", label: "Échéance", position: 3, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "TIMELINE", label: "Période", position: 4, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "BUDGET", label: "Budget", position: 5, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "NOTES", label: "Notes", position: 6, isActive: true } }),
  ]);
  const col = Object.fromEntries(cols.map((c) => [c.type, c]));

  await Promise.all([
    prisma.projectView.create({ data: { projectId: pid, type: "SPREADSHEET", name: "Tableur", isDefault: true, position: 0 } }),
    prisma.projectView.create({ data: { projectId: pid, type: "KANBAN", name: "Kanban", position: 1 } }),
    prisma.projectView.create({ data: { projectId: pid, type: "CARDS", name: "Fiches", position: 2 } }),
    prisma.projectView.create({ data: { projectId: pid, type: "CALENDAR", name: "Calendrier", position: 3 } }),
    prisma.projectView.create({ data: { projectId: pid, type: "GANTT", name: "Gantt", position: 4 } }),
    prisma.projectView.create({ data: { projectId: pid, type: "TIMELINE", name: "Échéancier", position: 5 } }),
  ]);

  const widgets = [
    "TASK_OVERVIEW","BY_STATUS","BY_OWNER","OVERDUE","BY_DUE_DATE",
    "PRIORITY_BREAKDOWN","COMPLETION_BY_GROUP","BUDGET_TOTAL","BURNDOWN","VELOCITY",
  ];
  await Promise.all(
    widgets.map((type, index) =>
      prisma.projectDashboardWidget.create({ data: { projectId: pid, type, position: index, isActive: true } })
    )
  );

  async function createTask(groupId, data, position) {
    const task = await prisma.task.create({
      data: {
        groupId,
        parentId: data.parentId ?? null,
        title: data.title,
        position,
        archivedAt: data.archived ? new Date() : null,
        completedAt: data.status === "DONE" ? new Date() : null,
        recurrence: data.recurrence ?? null,
      },
    });

    const rows = [];
    if (data.status) rows.push({ taskId: task.id, columnId: col.STATUS.id, value: data.status });
    if (data.priority) rows.push({ taskId: task.id, columnId: col.PRIORITY.id, value: data.priority });
    if (data.owner) rows.push({ taskId: task.id, columnId: col.OWNER.id, value: data.owner });
    if (data.due) rows.push({ taskId: task.id, columnId: col.DUE_DATE.id, value: data.due });
    if (data.timeline) rows.push({ taskId: task.id, columnId: col.TIMELINE.id, value: data.timeline });
    if (data.budget != null) rows.push({ taskId: task.id, columnId: col.BUDGET.id, value: String(data.budget) });
    if (data.notes) rows.push({ taskId: task.id, columnId: col.NOTES.id, value: data.notes });
    if (rows.length > 0) await prisma.taskFieldValue.createMany({ data: rows });

    return task;
  }

  const g1 = await prisma.group.create({ data: { projectId: pid, name: "Pré-production", color: "#0ea5e9", position: 0 } });
  const g2 = await prisma.group.create({ data: { projectId: pid, name: "Tournage", color: "#8b5cf6", position: 1 } });
  const g3 = await prisma.group.create({ data: { projectId: pid, name: "Post-production", color: "#10b981", position: 2 } });
  const g4 = await prisma.group.create({ data: { projectId: pid, name: "Livraison & Diffusion", color: "#f59e0b", position: 3 } });

  const t1 = await createTask(g1.id, {
    title: "Validation du scénario V3",
    status: "DONE",
    priority: "HIGH",
    owner: "Camille",
    due: d(-12),
    timeline: tl(-20, -12),
    notes: "Version validée client le 12/03.",
  }, 0);

  const t2 = await createTask(g1.id, {
    title: "Repérage décor principal",
    status: "IN_PROGRESS",
    priority: "HIGH",
    owner: "Félix",
    due: d(3),
    timeline: tl(-2, 3),
    budget: 2200,
  }, 1);

  const t3 = await createTask(g1.id, {
    title: "Contrats prestataires",
    status: "BLOCKED",
    priority: "URGENT",
    owner: "Alice",
    due: d(2),
    notes: "Bloqué en attente signature juridique.",
  }, 2);

  await createTask(g1.id, {
    title: "Point prod hebdomadaire",
    status: "IN_PROGRESS",
    priority: "LOW",
    owner: "Camille",
    recurrence: rec("weekly", 1),
  }, 3);

  const t4 = await createTask(g2.id, {
    title: "Jour 1 tournage studio",
    status: "NOT_STARTED",
    priority: "URGENT",
    owner: "Félix",
    due: d(7),
    timeline: tl(7, 7),
    budget: 8200,
  }, 0);

  const t5 = await createTask(g2.id, {
    title: "Jour 2 tournage extérieur",
    status: "NOT_STARTED",
    priority: "HIGH",
    owner: "Félix",
    due: d(8),
    timeline: tl(8, 8),
    budget: 5900,
  }, 1);

  const t6 = await createTask(g3.id, {
    title: "Montage cut principal",
    status: "NOT_STARTED",
    priority: "HIGH",
    owner: "Nina",
    due: d(15),
    timeline: tl(9, 15),
    budget: 4600,
  }, 0);

  await createTask(g3.id, {
    title: "Sélection takes",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    owner: "Nina",
    due: d(11),
    parentId: t6.id,
  }, 0);

  await createTask(g3.id, {
    title: "Sound design",
    status: "NOT_STARTED",
    priority: "MEDIUM",
    owner: "Paul",
    due: d(16),
    parentId: t6.id,
  }, 1);

  await createTask(g3.id, {
    title: "Color grading",
    status: "NOT_STARTED",
    priority: "MEDIUM",
    owner: "Paul",
    due: d(17),
    parentId: t6.id,
  }, 2);

  const t7 = await createTask(g4.id, {
    title: "Validation client finale",
    status: "NOT_STARTED",
    priority: "URGENT",
    owner: "Camille",
    due: d(20),
    timeline: tl(18, 20),
  }, 0);

  await createTask(g4.id, {
    title: "Export masters 4K et social",
    status: "NOT_STARTED",
    priority: "HIGH",
    owner: "Nina",
    due: d(22),
    timeline: tl(21, 22),
  }, 1);

  await createTask(g4.id, {
    title: "Archive projet 2026",
    status: "DONE",
    priority: "LOW",
    owner: "Alice",
    due: d(-2),
    archived: true,
    notes: "Exemple de tâche terminée puis archivée.",
  }, 2);

  await Promise.all([
    prisma.taskDependency.create({ data: { blockerId: t1.id, blockedId: t4.id } }),
    prisma.taskDependency.create({ data: { blockerId: t2.id, blockedId: t4.id } }),
    prisma.taskDependency.create({ data: { blockerId: t3.id, blockedId: t4.id } }),
    prisma.taskDependency.create({ data: { blockerId: t4.id, blockedId: t5.id } }),
    prisma.taskDependency.create({ data: { blockerId: t5.id, blockedId: t6.id } }),
    prisma.taskDependency.create({ data: { blockerId: t6.id, blockedId: t7.id } }),
  ]);

  await Promise.all([
    prisma.comment.create({ data: { taskId: t2.id, content: "Repérage A validé, option B en backup.", author: "Félix" } }),
    prisma.comment.create({ data: { taskId: t3.id, content: "Juridique relance le fournisseur demain matin.", author: "Alice" } }),
    prisma.comment.create({ data: { taskId: t6.id, content: "Pré-montage prêt à 60%, besoin des prises drone.", author: "Nina" } }),
  ]);

  console.log("✅ 2e projet démo créé:", pid);
}

main()
  .catch((e) => {
    console.error("❌ Erreur seed second projet:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

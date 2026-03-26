#!/usr/bin/env node
/**
 * Met à jour le projet "Lancement Produit v2.0" :
 *   1. Ajoute les 5 nouveaux widgets dashboard
 *   2. Renseigne completedAt sur les tâches DONE avec des dates étalées
 *
 * Usage: node scripts/update-demo.js
 */

const { PrismaLibSql } = require("@prisma/adapter-libsql");
const { PrismaClient } = require("../src/generated/prisma");
const path = require("path");

const dbUrl =
  process.env.LIBSQL_DATABASE_URL ??
  "file:" + path.resolve(__dirname, "../prisma/dev.db");

const adapter = new PrismaLibSql({ url: dbUrl });
const prisma = new PrismaClient({ adapter });

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  // ── Trouver le projet ────────────────────────────────────────────────────
  const project = await prisma.project.findFirst({
    where: { name: "Lancement Produit v2.0" },
    include: {
      dashboardWidgets: true,
      columns: true,
      groups: {
        include: {
          tasks: { include: { fieldValues: { include: { column: true } } } },
        },
      },
    },
  });

  if (!project) {
    console.error("❌  Projet 'Lancement Produit v2.0' introuvable. Lance d'abord: node scripts/seed-demo.js");
    process.exit(1);
  }

  console.log("📦  Projet trouvé:", project.id);

  // ── 1. Ajouter les nouveaux widgets ──────────────────────────────────────
  const existingTypes = project.dashboardWidgets.map((w) => w.type);
  const newWidgets = [
    { type: "PRIORITY_BREAKDOWN",  position: 5 },
    { type: "COMPLETION_BY_GROUP", position: 6 },
    { type: "BUDGET_TOTAL",        position: 7 },
    { type: "BURNDOWN",            position: 8 },
    { type: "VELOCITY",            position: 9 },
  ];

  let addedWidgets = 0;
  for (const w of newWidgets) {
    if (!existingTypes.includes(w.type)) {
      await prisma.projectDashboardWidget.create({
        data: { projectId: project.id, type: w.type, position: w.position, isActive: true },
      });
      addedWidgets++;
    }
  }
  console.log(`  ✓ ${addedWidgets} nouveau(x) widget(s) ajouté(s) (${5 - addedWidgets} déjà présent(s))`);

  // ── 2. Backfill completedAt sur les tâches DONE ───────────────────────
  const statusCol = project.columns.find((c) => c.type === "STATUS");
  if (!statusCol) {
    console.log("  ⚠  Colonne STATUS introuvable, skip completedAt");
    return;
  }

  const allTasks = project.groups.flatMap((g) => g.tasks);
  const doneTasks = allTasks.filter((t) =>
    t.fieldValues.some((fv) => fv.column.type === "STATUS" && fv.value === "DONE")
  );

  console.log(`  ✓ ${doneTasks.length} tâches DONE trouvées`);

  // Étaler les dates sur les 5 dernières semaines pour un beau burndown
  let updatedCount = 0;
  for (let i = 0; i < doneTasks.length; i++) {
    const t = doneTasks[i];
    if (t.completedAt) continue; // déjà renseigné

    // Répartir les completedAt de façon progressive
    const weeksAgo = Math.floor((doneTasks.length - i - 1) / Math.max(1, Math.ceil(doneTasks.length / 5)));
    const daysOffset = weeksAgo * 7 + Math.floor(Math.random() * 5);
    const completedAt = daysAgo(daysOffset);

    await prisma.task.update({
      where: { id: t.id },
      data: { completedAt },
    });
    updatedCount++;
  }

  console.log(`  ✓ completedAt renseigné sur ${updatedCount} tâche(s)`);
  console.log("✅  Mise à jour terminée !");
}

main()
  .catch((e) => { console.error("❌ Erreur:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());

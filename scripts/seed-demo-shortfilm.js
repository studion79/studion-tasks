#!/usr/bin/env node
/**
 * Seed script — Base de démonstration "Court-métrage"
 * Usage: node scripts/seed-demo-shortfilm.js
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
  const dt = new Date(today);
  dt.setDate(dt.getDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
}

function tl(startOffset, endOffset) {
  return JSON.stringify({ start: d(startOffset), end: d(endOffset) });
}

function rec(frequency, interval) {
  return JSON.stringify({ frequency, interval });
}

async function main() {
  console.log("🌱 Création du projet démo court-métrage...");

  const project = await prisma.project.create({
    data: {
      name: "Court-métrage — Nuit Blanche",
      description:
        "Base de démonstration complète de production de court-métrage: prépa, tournage, post-prod, diffusion.",
    },
  });
  const pid = project.id;

  const cols = await Promise.all([
    prisma.projectColumn.create({ data: { projectId: pid, type: "STATUS", label: "Statut", position: 0, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "PRIORITY", label: "Priorité", position: 1, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "OWNER", label: "Responsable", position: 2, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "DUE_DATE", label: "Echéance", position: 3, isActive: true } }),
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
    prisma.projectView.create({ data: { projectId: pid, type: "TIMELINE", name: "Echéancier", position: 5 } }),
  ]);

  const widgets = [
    "TASK_OVERVIEW",
    "BY_STATUS",
    "BY_OWNER",
    "OVERDUE",
    "BY_DUE_DATE",
    "PRIORITY_BREAKDOWN",
    "COMPLETION_BY_GROUP",
    "BUDGET_TOTAL",
    "BURNDOWN",
    "VELOCITY",
  ];
  await Promise.all(
    widgets.map((type, index) =>
      prisma.projectDashboardWidget.create({
        data: { projectId: pid, type, position: index, isActive: true },
      })
    )
  );

  async function createTask(groupId, data, position) {
    const task = await prisma.task.create({
      data: {
        groupId,
        parentId: data.parentId ?? null,
        title: data.title,
        position,
        recurrence: data.recurrence ?? null,
        archivedAt: data.archived ? new Date() : null,
        completedAt: data.status === "DONE" ? new Date() : null,
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

  const groups = await Promise.all([
    prisma.group.create({ data: { projectId: pid, name: "Développement", color: "#6366f1", position: 0 } }),
    prisma.group.create({ data: { projectId: pid, name: "Pré-production", color: "#0ea5e9", position: 1 } }),
    prisma.group.create({ data: { projectId: pid, name: "Administratif & Financement", color: "#a855f7", position: 2 } }),
    prisma.group.create({ data: { projectId: pid, name: "Tournage", color: "#f59e0b", position: 3 } }),
    prisma.group.create({ data: { projectId: pid, name: "Post-production image", color: "#22c55e", position: 4 } }),
    prisma.group.create({ data: { projectId: pid, name: "Post-production son", color: "#14b8a6", position: 5 } }),
    prisma.group.create({ data: { projectId: pid, name: "Livraison & Diffusion", color: "#ef4444", position: 6 } }),
    prisma.group.create({ data: { projectId: pid, name: "Communication", color: "#f97316", position: 7 } }),
  ]);

  const groupByName = Object.fromEntries(groups.map((g) => [g.name, g]));
  const taskIdByKey = new Map();
  let totalTasks = 0;

  const phaseTasks = [
    {
      group: "Développement",
      tasks: [
        { key: "dev_script_v1", title: "Ecriture scénario V1", status: "DONE", priority: "HIGH", owner: "Camille", due: d(-46), timeline: tl(-55, -46), notes: "Version de travail validée en interne." },
        { key: "dev_script_v2", title: "Réécriture scénario V2", status: "DONE", priority: "HIGH", owner: "Camille", due: d(-38), timeline: tl(-45, -38) },
        { key: "dev_script_v3", title: "Version dialoguée V3", status: "DONE", priority: "HIGH", owner: "Camille", due: d(-31), timeline: tl(-37, -31) },
        { key: "dev_note_intention", title: "Note d'intention réalisateur", status: "DONE", priority: "MEDIUM", owner: "Félix", due: d(-33), timeline: tl(-39, -33) },
        { key: "dev_decoupage", title: "Découpage technique", status: "IN_PROGRESS", priority: "URGENT", owner: "Félix", due: d(-2), timeline: tl(-9, -1), budget: 1200 },
        { key: "dev_storyboard", title: "Storyboard complet", status: "IN_PROGRESS", priority: "HIGH", owner: "Alice", due: d(2), timeline: tl(-5, 2), budget: 1800 },
        { key: "dev_pitch_pack", title: "Dossier artistique", status: "DONE", priority: "MEDIUM", owner: "Camille", due: d(-28), timeline: tl(-35, -28) },
      ],
    },
    {
      group: "Pré-production",
      tasks: [
        { key: "prep_reperage_1", title: "Repérage décor #1", status: "DONE", priority: "HIGH", owner: "Félix", due: d(-14), timeline: tl(-19, -14), budget: 600 },
        { key: "prep_reperage_2", title: "Repérage décor #2", status: "DONE", priority: "HIGH", owner: "Félix", due: d(-10), timeline: tl(-13, -10), budget: 700 },
        { key: "prep_casting", title: "Casting comédiens", status: "DONE", priority: "HIGH", owner: "Julie", due: d(-8), timeline: tl(-16, -8), budget: 2500 },
        { key: "prep_casting_confirm", title: "Validation distribution finale", status: "IN_PROGRESS", priority: "HIGH", owner: "Julie", due: d(1), timeline: tl(-2, 1) },
        { key: "prep_plan_travail", title: "Plan de travail tournage", status: "IN_PROGRESS", priority: "URGENT", owner: "Félix", due: d(3), timeline: tl(-1, 3) },
        { key: "prep_logistique", title: "Plan logistique équipe", status: "NOT_STARTED", priority: "MEDIUM", owner: "Alice", due: d(5), timeline: tl(2, 5), budget: 900 },
        { key: "prep_hmc", title: "Validation costumes / maquillage", status: "NOT_STARTED", priority: "MEDIUM", owner: "Nina", due: d(4), timeline: tl(1, 4), budget: 1600 },
        { key: "prep_accessoires", title: "Liste accessoires plateau", status: "NOT_STARTED", priority: "MEDIUM", owner: "Paul", due: d(6), timeline: tl(3, 6), budget: 950 },
        { key: "prep_catering", title: "Organisation catering", status: "NOT_STARTED", priority: "LOW", owner: "Alice", due: d(5), timeline: tl(3, 5), budget: 1100 },
        { key: "prep_brief_security", title: "Brief sécurité plateau", status: "NOT_STARTED", priority: "HIGH", owner: "Félix", due: d(6), timeline: tl(5, 6) },
      ],
    },
    {
      group: "Administratif & Financement",
      tasks: [
        { key: "adm_budget_global", title: "Construction budget global", status: "DONE", priority: "HIGH", owner: "Camille", due: d(-20), timeline: tl(-30, -20), budget: 50000 },
        { key: "adm_devis_presta", title: "Collecte devis prestataires", status: "DONE", priority: "HIGH", owner: "Alice", due: d(-12), timeline: tl(-18, -12) },
        { key: "adm_contrats_artistes", title: "Contrats artistes", status: "IN_PROGRESS", priority: "URGENT", owner: "Alice", due: d(1), timeline: tl(-4, 1) },
        { key: "adm_contrats_tech", title: "Contrats techniciens", status: "IN_PROGRESS", priority: "HIGH", owner: "Alice", due: d(2), timeline: tl(-3, 2) },
        { key: "adm_assurance", title: "Attestation assurance tournage", status: "NOT_STARTED", priority: "URGENT", owner: "Camille", due: d(3), timeline: tl(1, 3) },
        { key: "adm_autorisation", title: "Autorisations de tournage", status: "NOT_STARTED", priority: "HIGH", owner: "Alice", due: d(4), timeline: tl(1, 4) },
        { key: "adm_fdc", title: "Dossier financement complémentaire", status: "NOT_STARTED", priority: "MEDIUM", owner: "Camille", due: d(12), timeline: tl(7, 12) },
        { key: "adm_cloture", title: "Pré-clôture comptable prod", status: "NOT_STARTED", priority: "LOW", owner: "Alice", due: d(40), timeline: tl(35, 40) },
      ],
    },
    {
      group: "Tournage",
      tasks: [
        { key: "shoot_j1", title: "Jour 1 - Appartement", status: "NOT_STARTED", priority: "URGENT", owner: "Félix", due: d(7), timeline: tl(7, 7), budget: 6200 },
        { key: "shoot_j2", title: "Jour 2 - Rue de nuit", status: "NOT_STARTED", priority: "URGENT", owner: "Félix", due: d(8), timeline: tl(8, 8), budget: 7100 },
        { key: "shoot_j3", title: "Jour 3 - Café", status: "NOT_STARTED", priority: "HIGH", owner: "Félix", due: d(9), timeline: tl(9, 9), budget: 5400 },
        { key: "shoot_broll", title: "Plans de coupe & inserts", status: "NOT_STARTED", priority: "MEDIUM", owner: "Paul", due: d(10), timeline: tl(10, 10), budget: 2200 },
        { key: "shoot_pickups", title: "Journée retakes", status: "NOT_STARTED", priority: "MEDIUM", owner: "Félix", due: d(14), timeline: tl(14, 14), budget: 3500 },
        { key: "shoot_data_backup", title: "Sauvegarde rushes quotidienne", status: "IN_PROGRESS", priority: "HIGH", owner: "Nina", recurrence: rec("daily", 1), notes: "Double sauvegarde SSD + NAS." },
        { key: "shoot_callsheet", title: "Envoi call sheet", status: "IN_PROGRESS", priority: "MEDIUM", owner: "Alice", recurrence: rec("daily", 1), notes: "Envoi chaque veille avant 20h." },
      ],
    },
    {
      group: "Post-production image",
      tasks: [
        { key: "post_sync", title: "Synchro image/son", status: "NOT_STARTED", priority: "HIGH", owner: "Nina", due: d(13), timeline: tl(11, 13) },
        { key: "post_derush", title: "Dérushage complet", status: "NOT_STARTED", priority: "HIGH", owner: "Nina", due: d(16), timeline: tl(13, 16) },
        { key: "post_montage_v1", title: "Montage V1", status: "NOT_STARTED", priority: "HIGH", owner: "Nina", due: d(20), timeline: tl(16, 20), budget: 3800 },
        { key: "post_montage_v2", title: "Montage V2 après retours", status: "NOT_STARTED", priority: "MEDIUM", owner: "Nina", due: d(25), timeline: tl(21, 25), budget: 2100 },
        { key: "post_etalo", title: "Etalonnage final", status: "NOT_STARTED", priority: "HIGH", owner: "Paul", due: d(29), timeline: tl(26, 29), budget: 2600 },
        { key: "post_titres", title: "Habillage titres et cartons", status: "NOT_STARTED", priority: "LOW", owner: "Julie", due: d(30), timeline: tl(28, 30), budget: 900 },
        { key: "post_export_master", title: "Export master image", status: "NOT_STARTED", priority: "HIGH", owner: "Nina", due: d(31), timeline: tl(30, 31) },
      ],
    },
    {
      group: "Post-production son",
      tasks: [
        { key: "sound_edit", title: "Montage son direct", status: "NOT_STARTED", priority: "HIGH", owner: "Paul", due: d(24), timeline: tl(18, 24), budget: 1800 },
        { key: "sound_design", title: "Sound design", status: "NOT_STARTED", priority: "MEDIUM", owner: "Paul", due: d(28), timeline: tl(24, 28), budget: 2000 },
        { key: "sound_foley", title: "Session bruitages", status: "NOT_STARTED", priority: "MEDIUM", owner: "Paul", due: d(27), timeline: tl(25, 27), budget: 1300 },
        { key: "sound_mix", title: "Mixage final 5.1 / stéréo", status: "NOT_STARTED", priority: "URGENT", owner: "Paul", due: d(31), timeline: tl(29, 31), budget: 2400 },
        { key: "sound_m&e", title: "Export M&E", status: "NOT_STARTED", priority: "LOW", owner: "Paul", due: d(33), timeline: tl(31, 33), budget: 700 },
      ],
    },
    {
      group: "Livraison & Diffusion",
      tasks: [
        { key: "deliv_qc", title: "Contrôle qualité master", status: "NOT_STARTED", priority: "HIGH", owner: "Nina", due: d(34), timeline: tl(33, 34) },
        { key: "deliv_dcp", title: "Fabrication DCP", status: "NOT_STARTED", priority: "URGENT", owner: "Nina", due: d(36), timeline: tl(34, 36), budget: 950 },
        { key: "deliv_st", title: "Sous-titres FR/EN", status: "NOT_STARTED", priority: "MEDIUM", owner: "Julie", due: d(37), timeline: tl(35, 37), budget: 650 },
        { key: "deliv_presskit", title: "Dossier de presse", status: "NOT_STARTED", priority: "MEDIUM", owner: "Camille", due: d(38), timeline: tl(35, 38), budget: 800 },
        { key: "deliv_festivals", title: "Soumissions festivals (lot 1)", status: "NOT_STARTED", priority: "HIGH", owner: "Camille", due: d(42), timeline: tl(38, 42), budget: 1200 },
        { key: "deliv_festivals_2", title: "Soumissions festivals (lot 2)", status: "NOT_STARTED", priority: "LOW", owner: "Camille", due: d(56), timeline: tl(52, 56), budget: 1200 },
        { key: "deliv_archive", title: "Archivage final projet", status: "NOT_STARTED", priority: "LOW", owner: "Alice", due: d(60), timeline: tl(57, 60), notes: "Arborescence livrable + back-up cloud + NAS." },
      ],
    },
    {
      group: "Communication",
      tasks: [
        { key: "com_keyvisual", title: "Création key visual", status: "NOT_STARTED", priority: "MEDIUM", owner: "Julie", due: d(26), timeline: tl(22, 26), budget: 900 },
        { key: "com_teaser", title: "Montage teaser", status: "NOT_STARTED", priority: "MEDIUM", owner: "Nina", due: d(32), timeline: tl(28, 32), budget: 1100 },
        { key: "com_bts", title: "Sélection photos BTS", status: "NOT_STARTED", priority: "LOW", owner: "Paul", due: d(23), timeline: tl(15, 23) },
        { key: "com_social_plan", title: "Planning publication réseaux", status: "NOT_STARTED", priority: "LOW", owner: "Camille", due: d(39), timeline: tl(35, 39) },
        { key: "com_pr", title: "Relances presse spécialisée", status: "NOT_STARTED", priority: "MEDIUM", owner: "Camille", due: d(45), timeline: tl(40, 45) },
        { key: "com_newsletter", title: "Newsletter annonce sortie", status: "NOT_STARTED", priority: "LOW", owner: "Alice", due: d(43), timeline: tl(41, 43) },
        { key: "com_weekly_point", title: "Point communication hebdomadaire", status: "IN_PROGRESS", priority: "LOW", owner: "Camille", recurrence: rec("weekly", 1) },
      ],
    },
  ];

  for (const phase of phaseTasks) {
    const group = groupByName[phase.group];
    for (let i = 0; i < phase.tasks.length; i++) {
      const t = phase.tasks[i];
      const created = await createTask(group.id, t, i);
      taskIdByKey.set(t.key, created.id);
      totalTasks += 1;
    }
  }

  // Subtasks
  const subtasks = [
    { parent: "prep_plan_travail", key: "prep_plan_travail_j1", title: "Version plan travail J1", status: "IN_PROGRESS", priority: "HIGH", owner: "Félix", due: d(2) },
    { parent: "prep_plan_travail", key: "prep_plan_travail_j2", title: "Version plan travail J2", status: "NOT_STARTED", priority: "HIGH", owner: "Félix", due: d(3) },
    { parent: "prep_plan_travail", key: "prep_plan_travail_j3", title: "Version plan travail J3", status: "NOT_STARTED", priority: "MEDIUM", owner: "Félix", due: d(4) },
    { parent: "post_montage_v1", key: "post_montage_structure", title: "Assemblage structure narrative", status: "NOT_STARTED", priority: "HIGH", owner: "Nina", due: d(18) },
    { parent: "post_montage_v1", key: "post_montage_rythme", title: "Travail rythme et transitions", status: "NOT_STARTED", priority: "MEDIUM", owner: "Nina", due: d(19) },
    { parent: "post_montage_v2", key: "post_v2_retours_prod", title: "Intégration retours production", status: "NOT_STARTED", priority: "MEDIUM", owner: "Nina", due: d(24) },
    { parent: "post_v2_retours_prod", key: "post_v2_retours_client", title: "Intégration retours client", status: "NOT_STARTED", priority: "MEDIUM", owner: "Nina", due: d(25) },
    { parent: "deliv_festivals", key: "deliv_festivals_locarno", title: "Soumission Locarno", status: "NOT_STARTED", priority: "LOW", owner: "Camille", due: d(42) },
    { parent: "deliv_festivals", key: "deliv_festivals_clermont", title: "Soumission Clermont-Ferrand", status: "NOT_STARTED", priority: "LOW", owner: "Camille", due: d(43) },
  ];

  for (let i = 0; i < subtasks.length; i++) {
    const s = subtasks[i];
    const parentId = taskIdByKey.get(s.parent);
    if (!parentId) continue;
    const groupId = (await prisma.task.findUnique({ where: { id: parentId }, select: { groupId: true } }))?.groupId;
    if (!groupId) continue;
    const created = await createTask(groupId, { ...s, parentId }, i);
    taskIdByKey.set(s.key, created.id);
    totalTasks += 1;
  }

  const dependencies = [
    ["dev_script_v3", "dev_decoupage"],
    ["dev_decoupage", "dev_storyboard"],
    ["dev_storyboard", "prep_plan_travail"],
    ["prep_casting", "prep_casting_confirm"],
    ["prep_casting_confirm", "prep_plan_travail"],
    ["prep_reperage_2", "prep_plan_travail"],
    ["adm_contrats_artistes", "shoot_j1"],
    ["adm_contrats_tech", "shoot_j1"],
    ["adm_assurance", "shoot_j1"],
    ["adm_autorisation", "shoot_j2"],
    ["prep_plan_travail", "shoot_j1"],
    ["prep_logistique", "shoot_j1"],
    ["prep_hmc", "shoot_j1"],
    ["prep_accessoires", "shoot_j1"],
    ["shoot_j1", "shoot_j2"],
    ["shoot_j2", "shoot_j3"],
    ["shoot_j3", "shoot_broll"],
    ["shoot_broll", "shoot_pickups"],
    ["shoot_pickups", "post_sync"],
    ["post_sync", "post_derush"],
    ["post_derush", "post_montage_v1"],
    ["post_montage_v1", "post_montage_v2"],
    ["post_montage_v2", "post_etalo"],
    ["post_montage_v2", "sound_edit"],
    ["sound_edit", "sound_design"],
    ["sound_design", "sound_foley"],
    ["sound_foley", "sound_mix"],
    ["post_etalo", "post_export_master"],
    ["sound_mix", "deliv_qc"],
    ["post_export_master", "deliv_qc"],
    ["deliv_qc", "deliv_dcp"],
    ["deliv_dcp", "deliv_st"],
    ["deliv_st", "deliv_presskit"],
    ["deliv_presskit", "deliv_festivals"],
    ["deliv_festivals", "deliv_festivals_2"],
    ["deliv_festivals_2", "deliv_archive"],
    ["post_montage_v1", "com_teaser"],
    ["com_keyvisual", "com_social_plan"],
    ["com_teaser", "com_social_plan"],
    ["com_social_plan", "com_pr"],
  ];

  let depCount = 0;
  for (const [blockerKey, blockedKey] of dependencies) {
    const blockerId = taskIdByKey.get(blockerKey);
    const blockedId = taskIdByKey.get(blockedKey);
    if (!blockerId || !blockedId) continue;
    try {
      await prisma.taskDependency.create({
        data: { blockerId, blockedId },
      });
      depCount += 1;
    } catch {
      // Ignore duplicate relation edge
    }
  }

  const comments = [
    ["dev_decoupage", "Découpage validé à 80%, il manque la séquence 12.", "Félix"],
    ["prep_casting_confirm", "On attend le retour de l'agent principal.", "Julie"],
    ["adm_contrats_artistes", "Contrat lead envoyé pour signature électronique.", "Alice"],
    ["shoot_j1", "Prévoir 2 plans de sécurité en plus.", "Félix"],
    ["post_montage_v1", "Le rythme du premier acte est encore trop lent.", "Camille"],
    ["sound_mix", "Pré-mix stéréo prêt, mix 5.1 demain.", "Paul"],
    ["deliv_dcp", "Vérifier checksum après fabrication.", "Nina"],
    ["deliv_festivals", "Priorité aux festivals avec deadline fin de mois.", "Camille"],
  ];

  for (const [taskKey, content, author] of comments) {
    const taskId = taskIdByKey.get(taskKey);
    if (!taskId) continue;
    await prisma.comment.create({ data: { taskId, content, author } });
  }

  console.log(`✅ Projet créé: ${pid}`);
  console.log(`   Tâches: ${totalTasks}`);
  console.log(`   Dépendances: ${depCount}`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur seed court-métrage:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

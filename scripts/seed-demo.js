#!/usr/bin/env node
/**
 * Seed script — Projet de démonstration complet
 * Usage: node scripts/seed-demo.js
 */

const { PrismaLibSql } = require("@prisma/adapter-libsql");
const { PrismaClient } = require("../src/generated/prisma");
const path = require("path");

const dbUrl =
  process.env.LIBSQL_DATABASE_URL ??
  "file:" + path.resolve(__dirname, "../prisma/dev.db");

const adapter = new PrismaLibSql({ url: dbUrl });
const prisma = new PrismaClient({ adapter });

// ── Date helpers ──────────────────────────────────────────────────────────────
const today = new Date();
today.setHours(0, 0, 0, 0);

function d(offsetDays) {
  const r = new Date(today);
  r.setDate(r.getDate() + offsetDays);
  return r.toISOString().slice(0, 10);
}

function tl(startOffset, endOffset) {
  return JSON.stringify({ start: d(startOffset), end: d(endOffset) });
}

function rec(frequency, interval) {
  return JSON.stringify({ frequency, interval });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱  Création du projet de démonstration…");

  // ── Project ──────────────────────────────────────────────────────────────
  const project = await prisma.project.create({
    data: {
      name: "Lancement Produit v2.0",
      description:
        "Projet de démonstration complet — de la stratégie jusqu'au lancement en production.",
    },
  });
  const pid = project.id;
  console.log("  ✓ Projet créé:", pid);

  // ── Columns ──────────────────────────────────────────────────────────────
  const cols = await Promise.all([
    prisma.projectColumn.create({ data: { projectId: pid, type: "STATUS",   label: "Statut",       position: 0, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "PRIORITY", label: "Priorité",     position: 1, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "OWNER",    label: "Responsable",  position: 2, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "DUE_DATE", label: "Échéance",     position: 3, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "TIMELINE", label: "Période",      position: 4, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "BUDGET",   label: "Budget (€)",   position: 5, isActive: true } }),
    prisma.projectColumn.create({ data: { projectId: pid, type: "NOTES",    label: "Notes",        position: 6, isActive: true } }),
  ]);
  const col = Object.fromEntries(cols.map((c) => [c.type, c]));
  console.log("  ✓ 7 colonnes créées");

  // ── Views ─────────────────────────────────────────────────────────────────
  await Promise.all([
    prisma.projectView.create({ data: { projectId: pid, type: "SPREADSHEET", name: "Tableau",      isDefault: true, position: 0 } }),
    prisma.projectView.create({ data: { projectId: pid, type: "KANBAN",      name: "Kanban",        position: 1 } }),
    prisma.projectView.create({ data: { projectId: pid, type: "CARDS",       name: "Fiches",        position: 2 } }),
    prisma.projectView.create({ data: { projectId: pid, type: "CALENDAR",    name: "Calendrier",    position: 3 } }),
    prisma.projectView.create({ data: { projectId: pid, type: "GANTT",       name: "Gantt",         position: 4 } }),
    prisma.projectView.create({ data: { projectId: pid, type: "TIMELINE",    name: "Échéancier",    position: 5 } }),
  ]);
  console.log("  ✓ 6 vues créées");

  // ── Dashboard widgets ─────────────────────────────────────────────────────
  await Promise.all([
    prisma.projectDashboardWidget.create({ data: { projectId: pid, type: "TASK_OVERVIEW",       position: 0, isActive: true } }),
    prisma.projectDashboardWidget.create({ data: { projectId: pid, type: "BY_STATUS",           position: 1, isActive: true } }),
    prisma.projectDashboardWidget.create({ data: { projectId: pid, type: "OVERDUE",             position: 2, isActive: true } }),
    prisma.projectDashboardWidget.create({ data: { projectId: pid, type: "BY_OWNER",            position: 3, isActive: true } }),
    prisma.projectDashboardWidget.create({ data: { projectId: pid, type: "BY_DUE_DATE",         position: 4, isActive: true } }),
    prisma.projectDashboardWidget.create({ data: { projectId: pid, type: "PRIORITY_BREAKDOWN",  position: 5, isActive: true } }),
    prisma.projectDashboardWidget.create({ data: { projectId: pid, type: "COMPLETION_BY_GROUP", position: 6, isActive: true } }),
    prisma.projectDashboardWidget.create({ data: { projectId: pid, type: "BUDGET_TOTAL",        position: 7, isActive: true } }),
    prisma.projectDashboardWidget.create({ data: { projectId: pid, type: "BURNDOWN",            position: 8, isActive: true } }),
    prisma.projectDashboardWidget.create({ data: { projectId: pid, type: "VELOCITY",            position: 9, isActive: true } }),
  ]);
  console.log("  ✓ 10 widgets dashboard créés");

  // ── Helper: create task + field values ────────────────────────────────────
  async function createTask(groupId, data, position) {
    const task = await prisma.task.create({
      data: {
        groupId,
        parentId:    data.parentId   ?? null,
        title:       data.title,
        position:    position,
        recurrence:  data.recurrence ?? null,
        archivedAt:  data.archived   ? new Date() : null,
        completedAt: data.status === "DONE" ? new Date() : null,
      },
    });

    const fvData = [];
    if (data.status)   fvData.push({ taskId: task.id, columnId: col.STATUS.id,   value: data.status });
    if (data.priority) fvData.push({ taskId: task.id, columnId: col.PRIORITY.id, value: data.priority });
    if (data.owner)    fvData.push({ taskId: task.id, columnId: col.OWNER.id,    value: data.owner });
    if (data.due)      fvData.push({ taskId: task.id, columnId: col.DUE_DATE.id, value: data.due });
    if (data.timeline) fvData.push({ taskId: task.id, columnId: col.TIMELINE.id, value: data.timeline });
    if (data.budget)   fvData.push({ taskId: task.id, columnId: col.BUDGET.id,   value: String(data.budget) });
    if (data.notes)    fvData.push({ taskId: task.id, columnId: col.NOTES.id,    value: data.notes });

    if (fvData.length) {
      await prisma.taskFieldValue.createMany({ data: fvData });
    }

    return task;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 1 — Stratégie & Cadrage
  // ══════════════════════════════════════════════════════════════════════════
  const g1 = await prisma.group.create({ data: { projectId: pid, name: "Stratégie & Cadrage", color: "#6366f1", position: 0 } });

  const t1_1 = await createTask(g1.id, {
    title: "Définir les objectifs Q2",
    status: "DONE", priority: "HIGH", owner: "Sophie",
    due: d(-30), timeline: tl(-45, -15),
    notes: "Objectifs validés en comité de direction. OKR alignés avec la roadmap annuelle.",
  }, 0);

  const t1_2 = await createTask(g1.id, {
    title: "Analyse de marché et concurrence",
    status: "DONE", priority: "HIGH", owner: "Marc",
    due: d(-20), timeline: tl(-35, -10),
    notes: "Rapport complet disponible. 3 concurrents directs identifiés, 2 opportunités de positionnement.",
  }, 1);

  const t1_3 = await createTask(g1.id, {
    title: "Roadmap produit v2",
    status: "IN_PROGRESS", priority: "URGENT", owner: "Sophie",
    due: d(-5), timeline: tl(-15, 5),
    notes: "En cours de validation. Points ouverts : prioritisation des features Q3.",
  }, 2);

  const t1_4 = await createTask(g1.id, {
    title: "Validation budget annuel",
    status: "DONE", priority: "MEDIUM", owner: "Alex",
    due: d(-25), budget: 180000,
    notes: "Budget approuvé. Répartition : 40% dev, 25% marketing, 20% design, 15% opérations.",
  }, 3);

  await createTask(g1.id, {
    title: "Réunion de kick-off projet",
    status: "DONE", priority: "MEDIUM", owner: "Sophie",
    due: d(-28),
    notes: "Toute l'équipe présente. CR disponible dans Notion.",
  }, 4);

  await createTask(g1.id, {
    title: "Rédaction du cahier des charges",
    status: "DONE", priority: "HIGH", owner: "Marc",
    due: d(-22), timeline: tl(-30, -22),
  }, 5);

  console.log("  ✓ Groupe 1 : Stratégie & Cadrage (6 tâches)");

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 2 — Design & UX
  // ══════════════════════════════════════════════════════════════════════════
  const g2 = await prisma.group.create({ data: { projectId: pid, name: "Design & UX", color: "#8b5cf6", position: 1 } });

  const t2_1 = await createTask(g2.id, {
    title: "Maquettes interface principale",
    status: "IN_PROGRESS", priority: "HIGH", owner: "Julie",
    due: d(7), timeline: tl(-20, 7), budget: 4500,
    notes: "Écrans desktop et mobile. Version desktop à 80%, mobile en cours.",
  }, 0);

  const t2_2 = await createTask(g2.id, {
    title: "Design system & composants",
    status: "IN_PROGRESS", priority: "HIGH", owner: "Julie",
    due: d(14), timeline: tl(-10, 14), budget: 3000,
    notes: "Bibliothèque Figma en cours. Tokens de couleur et typographie définis.",
  }, 1);

  await createTask(g2.id, {
    title: "Tests utilisateurs — Round 1",
    status: "NOT_STARTED", priority: "MEDIUM", owner: "Marc",
    due: d(21), timeline: tl(15, 21),
    notes: "Panel de 8 utilisateurs recruté. Guide de test à finaliser.",
  }, 2);

  await createTask(g2.id, {
    title: "Révision maquettes post-tests",
    status: "NOT_STARTED", priority: "MEDIUM", owner: "Julie",
    due: d(28), timeline: tl(22, 28),
  }, 3);

  await createTask(g2.id, {
    title: "Prototype interactif Figma",
    status: "NOT_STARTED", priority: "LOW", owner: "Julie",
    due: d(35), timeline: tl(29, 35),
  }, 4);

  await createTask(g2.id, {
    title: "Audit accessibilité WCAG 2.1",
    status: "NOT_STARTED", priority: "MEDIUM", owner: "Marc",
    due: d(40), timeline: tl(36, 40),
    notes: "Viser niveau AA minimum.",
  }, 5);

  console.log("  ✓ Groupe 2 : Design & UX (6 tâches)");

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 3 — Développement
  // ══════════════════════════════════════════════════════════════════════════
  const g3 = await prisma.group.create({ data: { projectId: pid, name: "Développement", color: "#10b981", position: 2 } });

  const t3_1 = await createTask(g3.id, {
    title: "Setup environnement & CI/CD",
    status: "DONE", priority: "HIGH", owner: "Alex",
    due: d(-20), timeline: tl(-30, -20),
    notes: "Pipeline GitHub Actions opérationnel. Déploiements staging automatiques.",
  }, 0);

  const t3_2 = await createTask(g3.id, {
    title: "API authentification & rôles",
    status: "DONE", priority: "HIGH", owner: "Alex",
    due: d(-10), timeline: tl(-20, -10), budget: 6000,
    notes: "JWT + refresh tokens. Rôles ADMIN/MEMBER implémentés.",
  }, 1);

  const t3_3 = await createTask(g3.id, {
    title: "Module tableau de bord",
    status: "IN_PROGRESS", priority: "HIGH", owner: "Alex",
    due: d(10), timeline: tl(-5, 10), budget: 12000,
    notes: "Widgets KPI, graphiques statut et budget. Export PDF à intégrer.",
  }, 2);

  // Subtasks for t3_3
  await createTask(g3.id, { title: "Composants graphiques (Chart.js)", status: "DONE",        priority: "HIGH",   owner: "Alex",  parentId: t3_3.id }, 0);
  await createTask(g3.id, { title: "Widget KPIs et métriques",         status: "IN_PROGRESS", priority: "HIGH",   owner: "Alex",  parentId: t3_3.id }, 1);
  await createTask(g3.id, { title: "Export PDF du dashboard",           status: "NOT_STARTED", priority: "MEDIUM", owner: "Nina",  parentId: t3_3.id }, 2);

  const t3_4 = await createTask(g3.id, {
    title: "Intégration paiements Stripe",
    status: "NOT_STARTED", priority: "URGENT", owner: "Nina",
    due: d(20), timeline: tl(11, 20), budget: 8000,
    notes: "Stripe Connect pour les abonnements. Webhooks à tester en sandbox.",
  }, 3);

  const t3_5 = await createTask(g3.id, {
    title: "Tests unitaires & E2E",
    status: "NOT_STARTED", priority: "HIGH", owner: "Nina",
    due: d(30), timeline: tl(21, 30),
    notes: "Couverture cible : 80% backend, 60% frontend. Playwright pour E2E.",
  }, 4);

  // Subtasks for t3_5
  await createTask(g3.id, { title: "Tests backend (Jest)",     status: "NOT_STARTED", priority: "HIGH",   owner: "Nina", parentId: t3_5.id }, 0);
  await createTask(g3.id, { title: "Tests frontend (Vitest)",  status: "NOT_STARTED", priority: "HIGH",   owner: "Nina", parentId: t3_5.id }, 1);
  await createTask(g3.id, { title: "Tests E2E (Playwright)",   status: "NOT_STARTED", priority: "MEDIUM", owner: "Alex", parentId: t3_5.id }, 2);

  const t3_6 = await createTask(g3.id, {
    title: "Optimisation performances & cache",
    status: "NOT_STARTED", priority: "MEDIUM", owner: "Alex",
    due: d(38), timeline: tl(31, 38),
    notes: "Cible : LCP < 2s, INP < 200ms. Mettre en place Redis pour le cache.",
  }, 5);

  await createTask(g3.id, {
    title: "Correction bugs QA",
    status: "BLOCKED", priority: "URGENT", owner: "Nina",
    due: d(5),
    notes: "Bloqué en attente du rapport QA complet. 12 bugs P1 identifiés.",
  }, 6);

  await createTask(g3.id, {
    title: "Revue de code hebdomadaire",
    status: "IN_PROGRESS", priority: "LOW", owner: "Alex",
    recurrence: rec("weekly", 1),
    notes: "Chaque vendredi 14h. PR review + retours techniques.",
  }, 7);

  console.log("  ✓ Groupe 3 : Développement (8 tâches + sous-tâches)");

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 4 — Marketing & Communication
  // ══════════════════════════════════════════════════════════════════════════
  const g4 = await prisma.group.create({ data: { projectId: pid, name: "Marketing & Communication", color: "#f59e0b", position: 3 } });

  const t4_1 = await createTask(g4.id, {
    title: "Stratégie de contenu Q2",
    status: "IN_PROGRESS", priority: "HIGH", owner: "Marc",
    due: d(5), timeline: tl(-10, 5), budget: 2000,
    notes: "Blog, réseaux sociaux, emailing. Calendrier éditorial en cours.",
  }, 0);

  const t4_2 = await createTask(g4.id, {
    title: "Landing page v2.0",
    status: "NOT_STARTED", priority: "HIGH", owner: "Julie",
    due: d(25), timeline: tl(15, 25), budget: 5000,
    notes: "Refonte complète. A/B test prévu sur le hero et le CTA principal.",
  }, 1);

  await createTask(g4.id, {
    title: "Campagne email pre-launch",
    status: "NOT_STARTED", priority: "MEDIUM", owner: "Marc",
    due: d(40), timeline: tl(30, 40), budget: 3000,
    notes: "Séquence de 5 emails. Segmentation par profil utilisateur.",
  }, 2);

  await createTask(g4.id, {
    title: "Newsletter mensuelle",
    status: "IN_PROGRESS", priority: "LOW", owner: "Marc",
    recurrence: rec("monthly", 1),
    notes: "Envoi le 1er de chaque mois. ~4 200 abonnés actifs.",
  }, 3);

  await createTask(g4.id, {
    title: "Contenu réseaux sociaux (lancement)",
    status: "NOT_STARTED", priority: "LOW", owner: "Sophie",
    due: d(45),
    notes: "LinkedIn, Twitter/X, Instagram. Kit de visuels à créer.",
  }, 4);

  await createTask(g4.id, {
    title: "Communiqué de presse",
    status: "NOT_STARTED", priority: "HIGH", owner: "Sophie",
    due: d(48),
    notes: "Distribution via Cision. Liste de 25 journalistes tech ciblés.",
  }, 5);

  await createTask(g4.id, {
    title: "Webinar de démonstration produit",
    status: "NOT_STARTED", priority: "MEDIUM", owner: "Marc",
    due: d(55), timeline: tl(50, 55), budget: 1500,
    notes: "Zoom. Objectif : 200 inscrits. Replay disponible ensuite.",
  }, 6);

  await createTask(g4.id, {
    title: "Rapport marketing hebdomadaire",
    status: "IN_PROGRESS", priority: "LOW", owner: "Marc",
    recurrence: rec("weekly", 1),
    notes: "KPIs : trafic, leads, conversions. Partagé chaque lundi matin.",
  }, 7);

  console.log("  ✓ Groupe 4 : Marketing & Communication (8 tâches)");

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 5 — Lancement
  // ══════════════════════════════════════════════════════════════════════════
  const g5 = await prisma.group.create({ data: { projectId: pid, name: "Lancement", color: "#ef4444", position: 4 } });

  const t5_1 = await createTask(g5.id, {
    title: "Plan de déploiement production",
    status: "NOT_STARTED", priority: "URGENT", owner: "Alex",
    due: d(45), timeline: tl(40, 45),
    notes: "Runbook complet. Rollback plan défini. Fenêtre de maintenance : dimanche 2h-6h.",
  }, 0);

  const t5_2 = await createTask(g5.id, {
    title: "Migration données production",
    status: "NOT_STARTED", priority: "URGENT", owner: "Nina",
    due: d(48), timeline: tl(46, 48),
    notes: "Script de migration testé en staging. Backup complet avant exécution.",
  }, 1);

  await createTask(g5.id, {
    title: "Réunion Go / No-Go",
    status: "NOT_STARTED", priority: "HIGH", owner: "Sophie",
    due: d(50),
    notes: "Checklist de 30 critères. Présence de toute l'équipe requise.",
  }, 2);

  const t5_4 = await createTask(g5.id, {
    title: "Mise en production",
    status: "NOT_STARTED", priority: "URGENT", owner: "Alex",
    due: d(52), timeline: tl(52, 52),
    notes: "Déploiement blue-green. Monitoring intensif les 48h suivantes.",
  }, 3);

  await createTask(g5.id, {
    title: "Post-mortem & retour d'expérience",
    status: "NOT_STARTED", priority: "MEDIUM", owner: "Sophie",
    due: d(65), timeline: tl(60, 65),
    notes: "Réunion blameless. Format : ce qui a bien marché / points d'amélioration / actions.",
  }, 4);

  await createTask(g5.id, {
    title: "Support utilisateurs post-lancement",
    status: "NOT_STARTED", priority: "HIGH", owner: "Nina",
    recurrence: rec("weekly", 1),
    notes: "Astreinte H+48 post-lancement. Zendesk configuré.",
  }, 5);

  await createTask(g5.id, {
    title: "Monitoring & alertes production",
    status: "NOT_STARTED", priority: "HIGH", owner: "Alex",
    due: d(53), timeline: tl(52, 56),
    notes: "Sentry, Datadog. Alertes Slack pour erreurs P0/P1.",
  }, 6);

  console.log("  ✓ Groupe 5 : Lancement (7 tâches)");

  // ── Dependencies ──────────────────────────────────────────────────────────
  await Promise.all([
    prisma.taskDependency.create({ data: { blockerId: t3_2.id, blockedId: t3_3.id } }), // API auth → Dashboard
    prisma.taskDependency.create({ data: { blockerId: t3_3.id, blockedId: t3_4.id } }), // Dashboard → Paiements
    prisma.taskDependency.create({ data: { blockerId: t3_4.id, blockedId: t3_5.id } }), // Paiements → Tests
    prisma.taskDependency.create({ data: { blockerId: t3_5.id, blockedId: t3_6.id } }), // Tests → Optim
    prisma.taskDependency.create({ data: { blockerId: t2_1.id, blockedId: t4_2.id } }), // Maquettes → Landing page
    prisma.taskDependency.create({ data: { blockerId: t5_1.id, blockedId: t5_4.id } }), // Plan deploy → Mise en prod
    prisma.taskDependency.create({ data: { blockerId: t1_3.id, blockedId: t2_1.id } }), // Roadmap → Maquettes
    prisma.taskDependency.create({ data: { blockerId: t4_1.id, blockedId: t4_2.id } }), // Stratégie contenu → Landing
  ]);
  console.log("  ✓ 8 dépendances créées");

  // ── Comments ──────────────────────────────────────────────────────────────
  await Promise.all([
    prisma.comment.create({ data: { taskId: t1_3.id, content: "J'ai mis à jour la section Q3 avec les nouvelles priorités. Besoin d'une relecture avant validation.", author: "Sophie" } }),
    prisma.comment.create({ data: { taskId: t1_3.id, content: "Lu. Quelques ajustements sur les estimations de delivery, je reviens dessus demain.", author: "Marc" } }),
    prisma.comment.create({ data: { taskId: t3_3.id, content: "Les graphiques Chart.js sont intégrés. Le widget KPIs est en cours, ETA vendredi.", author: "Alex" } }),
    prisma.comment.create({ data: { taskId: t3_4.id, content: "Sandbox Stripe configurée. Les webhooks fonctionnent en local, reste les tests d'intégration.", author: "Nina" } }),
    prisma.comment.create({ data: { taskId: t2_1.id, content: "Version mobile en cours. Le menu navigation pose un problème sur petits écrans, je teste différentes approches.", author: "Julie" } }),
    prisma.comment.create({ data: { taskId: t4_1.id, content: "Calendrier éditorial partagé dans Notion. 12 articles planifiés pour Q2.", author: "Marc" } }),
  ]);
  console.log("  ✓ 6 commentaires créés");

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log("\n✅  Projet de démonstration créé avec succès !");
  console.log("   Projet ID :", pid);
  console.log("   → Ouvre l'application et cherche « Lancement Produit v2.0 »\n");
}

main()
  .catch((e) => { console.error("❌ Erreur :", e); process.exit(1); })
  .finally(() => prisma.$disconnect());

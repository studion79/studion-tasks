#!/usr/bin/env node
/**
 * Seed one showcase project for festival organization.
 * Goal: rich dataset with nested groups, dependencies, recurrence,
 * reminders, subtasks, comments, automations, archived/completed tasks.
 *
 * Usage:
 *   node scripts/seed-demo-festival.js
 */

const path = require("path");
const bcrypt = require("bcryptjs");
const { PrismaLibSql } = require("@prisma/adapter-libsql");
const { PrismaClient } = require("../src/generated/prisma");

const dbUrl = process.env.LIBSQL_DATABASE_URL ?? "file:" + path.resolve(__dirname, "../prisma/dev.db");
const adapter = new PrismaLibSql({ url: dbUrl });
const prisma = new PrismaClient({ adapter });

const PROJECT_COLUMNS = [
  { type: "STATUS", label: "Statut", isActive: true },
  { type: "PRIORITY", label: "Priorite", isActive: true },
  { type: "OWNER", label: "Assigne a", isActive: true },
  { type: "DUE_DATE", label: "Date d'echeance", isActive: true },
  { type: "TIMELINE", label: "Periode", isActive: true },
  { type: "BUDGET", label: "Budget", isActive: true },
  { type: "NOTES", label: "Notes", isActive: true },
];

const PROJECT_VIEWS = [
  { type: "SPREADSHEET", name: "Tableur", isDefault: true },
  { type: "CARDS", name: "Fiches" },
  { type: "KANBAN", name: "Kanban" },
  { type: "CALENDAR", name: "Agenda" },
  { type: "GANTT", name: "Gantt" },
  { type: "TIMELINE", name: "Echeancier" },
];

const DASHBOARD_WIDGETS = [
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

const NOTIF_TYPES = ["TASK_ASSIGNED", "COMMENT_ADDED", "MENTIONED", "DUE_DATE_SOON", "OVERDUE", "DAILY_SUMMARY", "AUTOMATION"];

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateAt(base, dayOffset, hh = 9, mm = 0) {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d;
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function ymdhm(date) {
  return date.toISOString().slice(0, 16);
}

function timeline(start, end) {
  return JSON.stringify({ start: ymdhm(start), end: ymdhm(end) });
}

function recurrence(frequency, interval, endDate = null) {
  return JSON.stringify({ frequency, interval, endDate });
}

function ownerByIndex(index) {
  const pool = [
    "Lina MARTIN",
    "Theo ROBERT",
    "Camille DUMONT",
    "Nolan PETIT",
    "Sarah MOREL",
    "Adam ROUX",
    "Julie BERNARD",
    "Noah MERCIER",
    "Eva GIRARD",
  ];
  return pool[index % pool.length];
}

async function createProjectSkeleton(name, description) {
  const project = await prisma.project.create({ data: { name, description } });

  for (let i = 0; i < PROJECT_COLUMNS.length; i++) {
    const c = PROJECT_COLUMNS[i];
    await prisma.projectColumn.create({
      data: {
        projectId: project.id,
        type: c.type,
        label: c.label,
        position: i,
        isActive: c.isActive,
      },
    });
  }

  for (let i = 0; i < PROJECT_VIEWS.length; i++) {
    const v = PROJECT_VIEWS[i];
    await prisma.projectView.create({
      data: {
        projectId: project.id,
        type: v.type,
        name: v.name,
        isDefault: Boolean(v.isDefault),
        position: i,
      },
    });
  }

  for (let i = 0; i < DASHBOARD_WIDGETS.length; i++) {
    await prisma.projectDashboardWidget.create({
      data: {
        projectId: project.id,
        type: DASHBOARD_WIDGETS[i],
        position: i,
        isActive: true,
      },
    });
  }

  return project;
}

async function getProjectColumnMap(projectId) {
  const columns = await prisma.projectColumn.findMany({
    where: { projectId },
    select: { id: true, type: true },
  });
  return Object.fromEntries(columns.map((c) => [c.type, c.id]));
}

async function createTask({
  projectColumnMap,
  groupId,
  parentId = null,
  title,
  position,
  status,
  priority,
  ownerName,
  due,
  periodStart,
  periodEnd,
  budget,
  notes,
  recurrenceValue,
  archivedAt = null,
  completedAt = null,
  reminderOffsetMinutes = null,
}) {
  const task = await prisma.task.create({
    data: {
      groupId,
      parentId,
      title,
      position,
      archivedAt,
      completedAt,
      recurrence: recurrenceValue ?? null,
      reminderOffsetMinutes,
      reminderSentFor: null,
    },
  });

  const values = [];
  if (status) values.push({ taskId: task.id, columnId: projectColumnMap.STATUS, value: status });
  if (priority) values.push({ taskId: task.id, columnId: projectColumnMap.PRIORITY, value: priority });
  if (ownerName) values.push({ taskId: task.id, columnId: projectColumnMap.OWNER, value: ownerName });
  if (due) values.push({ taskId: task.id, columnId: projectColumnMap.DUE_DATE, value: ymdhm(due) });
  if (periodStart && periodEnd) values.push({ taskId: task.id, columnId: projectColumnMap.TIMELINE, value: timeline(periodStart, periodEnd) });
  if (budget != null) values.push({ taskId: task.id, columnId: projectColumnMap.BUDGET, value: String(budget) });
  if (notes) values.push({ taskId: task.id, columnId: projectColumnMap.NOTES, value: notes });
  if (values.length) await prisma.taskFieldValue.createMany({ data: values });

  return task;
}

async function seedFestivalProject(base, users) {
  const project = await createProjectSkeleton(
    "Festival Horizon 2026 - Organisation complete",
    "Projet de demonstration festival: programmation, logistique, billetterie, securite, communication, dependances, recurrence et pilotage budget."
  );

  const groupDefs = [
    ["direction", "Direction du festival", "#4f46e5", 0, null],
    ["gouvernance", "Gouvernance", "#6366f1", 0, "direction"],
    ["partenaires", "Budget et partenaires", "#818cf8", 1, "direction"],
    ["prog", "Programmation artistique", "#db2777", 1, null],
    ["scene_main", "Scene principale", "#ec4899", 0, "prog"],
    ["scene_decouverte", "Scene decouverte", "#f472b6", 1, "prog"],
    ["prod", "Logistique et production", "#0891b2", 2, null],
    ["site", "Site et infrastructures", "#06b6d4", 0, "prod"],
    ["tech", "Technique scene", "#22d3ee", 1, "prod"],
    ["securite", "Securite et secours", "#0ea5e9", 2, "prod"],
    ["com", "Communication et billetterie", "#f59e0b", 3, null],
    ["digital", "Marketing digital", "#fbbf24", 0, "com"],
    ["presse", "Relations presse", "#f59e0b", 1, "com"],
    ["ticketing", "Billetterie", "#f97316", 2, "com"],
    ["xp", "Experience public", "#16a34a", 4, null],
    ["food", "Food et boissons", "#22c55e", 0, "xp"],
    ["benevoles", "Benevoles", "#4ade80", 1, "xp"],
    ["post", "Post-evenement", "#64748b", 5, null],
  ];

  const groups = {};
  for (const [key, name, color, position, parentKey] of groupDefs) {
    groups[key] = await prisma.group.create({
      data: {
        projectId: project.id,
        name,
        color,
        position,
        parentId: parentKey ? groups[parentKey].id : null,
      },
    });
  }

  const col = await getProjectColumnMap(project.id);

  const taskBlueprints = [
    // Gouvernance (6)
    { key: "fes_01", g: "gouvernance", t: "Kickoff comite organisateur", d: -21, h: 10, status: "DONE", pr: "HIGH", done: true, budget: 0, notes: "Objectifs, capacite, programmation preliminaire." },
    { key: "fes_02", g: "gouvernance", t: "Point de coordination quotidien", d: 0, h: 9, status: "WORKING", pr: "MEDIUM", rec: ["daily", 1, ymd(dateAt(base, 40))], rem: 20 },
    { key: "fes_03", g: "gouvernance", t: "Validation retroplanning global", d: 2, h: 11, status: "NOT_STARTED", pr: "HIGH", budget: 0 },
    { key: "fes_04", g: "gouvernance", t: "Comite risques et decisions", d: 5, h: 17, status: "NOT_STARTED", pr: "HIGH", rec: ["weekly", 1, ymd(dateAt(base, 50))] },
    { key: "fes_05", g: "gouvernance", t: "Revue performance J-7", d: 14, h: 16, status: "NOT_STARTED", pr: "MEDIUM", budget: 0 },
    { key: "fes_06", g: "gouvernance", t: "Debrief direction J+1", d: 22, h: 10, status: "NOT_STARTED", pr: "LOW", dueOnly: true },

    // Budget et partenaires (5)
    { key: "fes_07", g: "partenaires", t: "Finaliser budget previsionnel", d: 3, h: 15, status: "WORKING", pr: "HIGH", budget: 180000 },
    { key: "fes_08", g: "partenaires", t: "Signer contrat sponsor principal", d: 4, h: 12, status: "STUCK", pr: "HIGH", notes: "Attente validation service legal sponsor.", rem: 60, budget: 90000 },
    { key: "fes_09", g: "partenaires", t: "Boucler partenariats boisson", d: 8, h: 14, status: "NOT_STARTED", pr: "MEDIUM", budget: 35000 },
    { key: "fes_10", g: "partenaires", t: "Valider assurance evenement", d: 7, h: 11, status: "NOT_STARTED", pr: "HIGH", budget: 12000 },
    { key: "fes_11", g: "partenaires", t: "Projection cashflow semaine evenement", d: 10, h: 10, status: "NOT_STARTED", pr: "MEDIUM", budget: 0 },

    // Scene principale (5)
    { key: "fes_12", g: "scene_main", t: "Confirmer tete d'affiche samedi soir", d: 6, h: 18, status: "WORKING", pr: "HIGH", budget: 55000 },
    { key: "fes_13", g: "scene_main", t: "Verifier rider technique artistes", d: 7, h: 13, status: "NOT_STARTED", pr: "HIGH", budget: 0 },
    { key: "fes_14", g: "scene_main", t: "Caler horaires balances", d: 9, h: 16, status: "NOT_STARTED", pr: "MEDIUM", budget: 0, timelineOnly: true },
    { key: "fes_15", g: "scene_main", t: "Validation setlist finale", d: 13, h: 19, status: "NOT_STARTED", pr: "MEDIUM", budget: 0 },
    { key: "fes_16", g: "scene_main", t: "Brief regie ouverture portes", d: 16, h: 17, status: "NOT_STARTED", pr: "HIGH", rem: 30 },

    // Scene decouverte (4)
    { key: "fes_17", g: "scene_decouverte", t: "Selection finale groupes locaux", d: 5, h: 14, status: "WORKING", pr: "MEDIUM", budget: 9000 },
    { key: "fes_18", g: "scene_decouverte", t: "Contractualiser cachets decouverte", d: 8, h: 15, status: "NOT_STARTED", pr: "MEDIUM", budget: 14000 },
    { key: "fes_19", g: "scene_decouverte", t: "Definir animateur scene secondaire", d: 11, h: 12, status: "NOT_STARTED", pr: "LOW", budget: 3500 },
    { key: "fes_20", g: "scene_decouverte", t: "Coordonner backline partage", d: 12, h: 10, status: "NOT_STARTED", pr: "MEDIUM", budget: 4500 },

    // Site et infrastructures (5)
    { key: "fes_21", g: "site", t: "Plan implantation zone festival", d: 4, h: 11, status: "WORKING", pr: "HIGH", budget: 6000 },
    { key: "fes_22", g: "site", t: "Installation scenes et barriérage", d: 15, h: 8, status: "NOT_STARTED", pr: "HIGH", budget: 30000, timelineOnly: true },
    { key: "fes_23", g: "site", t: "Validation alimentation electrique", d: 11, h: 9, status: "NOT_STARTED", pr: "HIGH", budget: 12000 },
    { key: "fes_24", g: "site", t: "Controle signaletique public", d: 14, h: 10, status: "NOT_STARTED", pr: "MEDIUM", budget: 5000 },
    { key: "fes_25", g: "site", t: "Test eclairage cheminements nuit", d: 15, h: 22, status: "NOT_STARTED", pr: "MEDIUM", budget: 2500 },

    // Technique scene (4)
    { key: "fes_26", g: "tech", t: "Reception materiel son/lumiere", d: 13, h: 8, status: "NOT_STARTED", pr: "HIGH", budget: 42000 },
    { key: "fes_27", g: "tech", t: "Check micros HF et frequencies", d: 15, h: 13, status: "NOT_STARTED", pr: "HIGH", budget: 0 },
    { key: "fes_28", g: "tech", t: "Simulation panne alimentation", d: 15, h: 19, status: "NOT_STARTED", pr: "MEDIUM", budget: 0 },
    { key: "fes_29", g: "tech", t: "Preset console FOH et monitor", d: 16, h: 11, status: "NOT_STARTED", pr: "MEDIUM", budget: 0, timelineOnly: true },

    // Securite (4)
    { key: "fes_30", g: "securite", t: "Validation plan securite prefectoral", d: 8, h: 9, status: "STUCK", pr: "HIGH", notes: "Attente retour prefectoral sur flux parking." },
    { key: "fes_31", g: "securite", t: "Formation secouristes et agents SSIAP", d: 12, h: 14, status: "NOT_STARTED", pr: "HIGH", budget: 6200 },
    { key: "fes_32", g: "securite", t: "Simulation evacuation foule", d: 15, h: 16, status: "NOT_STARTED", pr: "HIGH", budget: 0 },
    { key: "fes_33", g: "securite", t: "Brief securite ouverture", d: 16, h: 18, status: "NOT_STARTED", pr: "HIGH", rem: 30, dueOnly: true },

    // Marketing digital (4)
    { key: "fes_34", g: "digital", t: "Lancer campagne social ads", d: 1, h: 10, status: "WORKING", pr: "MEDIUM", budget: 12000, rec: ["weekly", 1, ymd(dateAt(base, 35))] },
    { key: "fes_35", g: "digital", t: "Publier teaser video officiel", d: 3, h: 18, status: "NOT_STARTED", pr: "HIGH", budget: 2500 },
    { key: "fes_36", g: "digital", t: "Plan de contenu J-10 a J+2", d: 6, h: 11, status: "NOT_STARTED", pr: "MEDIUM", budget: 0, timelineOnly: true },
    { key: "fes_37", g: "digital", t: "Reporting campagne acquisition", d: 17, h: 11, status: "NOT_STARTED", pr: "LOW", budget: 0 },

    // Relations presse (3)
    { key: "fes_38", g: "presse", t: "Envoyer communique annonce line-up", d: 2, h: 9, status: "DONE", pr: "MEDIUM", done: true, budget: 0 },
    { key: "fes_39", g: "presse", t: "Organiser conference de presse", d: 10, h: 15, status: "NOT_STARTED", pr: "MEDIUM", budget: 2000 },
    { key: "fes_40", g: "presse", t: "Accreditations media sur site", d: 15, h: 12, status: "NOT_STARTED", pr: "HIGH", budget: 0 },

    // Billetterie (3)
    { key: "fes_41", g: "ticketing", t: "Activer ventes early bird", d: -12, h: 10, status: "DONE", pr: "MEDIUM", done: true, budget: 0, archived: true },
    { key: "fes_42", g: "ticketing", t: "Controler pics de charge billetterie", d: 5, h: 17, status: "WORKING", pr: "MEDIUM", rec: ["daily", 1, ymd(dateAt(base, 20))] },
    { key: "fes_43", g: "ticketing", t: "Procedure scan billets aux entrees", d: 14, h: 16, status: "NOT_STARTED", pr: "HIGH", budget: 0 },

    // Food and benevoles (3)
    { key: "fes_44", g: "food", t: "Selection food trucks et emplacements", d: 7, h: 11, status: "NOT_STARTED", pr: "MEDIUM", budget: 0 },
    { key: "fes_45", g: "benevoles", t: "Affectation benevoles par zone", d: 13, h: 10, status: "NOT_STARTED", pr: "HIGH", budget: 0 },
    { key: "fes_46", g: "benevoles", t: "Brief benevoles accueil public", d: 16, h: 9, status: "NOT_STARTED", pr: "HIGH", budget: 0, dueOnly: true },

    // Post-event (2)
    { key: "fes_47", g: "post", t: "Collecte feedback exposants et public", d: 20, h: 11, status: "NOT_STARTED", pr: "MEDIUM", budget: 0 },
    { key: "fes_48", g: "post", t: "Bilan financier final et lessons learned", d: 28, h: 10, status: "NOT_STARTED", pr: "HIGH", budget: 0 },
  ];

  const positionByGroup = new Map();
  const tasks = {};
  for (let i = 0; i < taskBlueprints.length; i++) {
    const bp = taskBlueprints[i];
    const position = positionByGroup.get(bp.g) ?? 0;
    positionByGroup.set(bp.g, position + 1);

    const due = bp.timelineOnly ? null : dateAt(base, bp.d, bp.h ?? 9, bp.m ?? 0);
    const periodStart = bp.dueOnly ? null : dateAt(base, bp.d - 1, Math.max((bp.h ?? 9) - 2, 6), bp.m ?? 0);
    const periodEnd = bp.dueOnly ? null : dateAt(base, bp.d, bp.h ?? 9, bp.m ?? 0);

    tasks[bp.key] = await createTask({
      projectColumnMap: col,
      groupId: groups[bp.g].id,
      title: bp.t,
      position,
      status: bp.status,
      priority: bp.pr,
      ownerName: ownerByIndex(i),
      due,
      periodStart,
      periodEnd,
      budget: bp.budget ?? null,
      notes: bp.notes ?? "",
      recurrenceValue: bp.rec ? recurrence(bp.rec[0], bp.rec[1], bp.rec[2]) : null,
      archivedAt: bp.archived ? dateAt(base, bp.d + 1, 8, 0) : null,
      completedAt: bp.done ? dateAt(base, bp.d, (bp.h ?? 9) + 1, bp.m ?? 0) : null,
      reminderOffsetMinutes: bp.rem ?? null,
    });
  }

  // Subtasks to showcase checklist/subtask behavior.
  const subA = await createTask({
    projectColumnMap: col,
    groupId: groups.site.id,
    parentId: tasks.fes_22.id,
    title: "Verifier plan anti-boue zones public",
    position: 0,
    status: "WORKING",
    priority: "MEDIUM",
    ownerName: "Lina MARTIN",
    due: dateAt(base, 15, 9, 30),
    periodStart: null,
    periodEnd: null,
  });

  const subB = await createTask({
    projectColumnMap: col,
    groupId: groups.site.id,
    parentId: tasks.fes_22.id,
    title: "Recontroler barriers PMR",
    position: 1,
    status: "NOT_STARTED",
    priority: "HIGH",
    ownerName: "Theo ROBERT",
    due: dateAt(base, 15, 10, 30),
    periodStart: null,
    periodEnd: null,
  });

  const subC = await createTask({
    projectColumnMap: col,
    groupId: groups.securite.id,
    parentId: tasks.fes_32.id,
    title: "Test message evacuation ecrans geants",
    position: 0,
    status: "NOT_STARTED",
    priority: "HIGH",
    ownerName: "Camille DUMONT",
    due: dateAt(base, 15, 16, 30),
    periodStart: null,
    periodEnd: null,
  });

  const subD = await createTask({
    projectColumnMap: col,
    groupId: groups.ticketing.id,
    parentId: tasks.fes_43.id,
    title: "Calibrer scanners entree nord",
    position: 0,
    status: "NOT_STARTED",
    priority: "MEDIUM",
    ownerName: "Nolan PETIT",
    due: dateAt(base, 14, 17, 0),
    periodStart: null,
    periodEnd: null,
  });

  await prisma.taskDependency.createMany({
    data: [
      { blockerId: tasks.fes_01.id, blockedId: tasks.fes_03.id },
      { blockerId: tasks.fes_03.id, blockedId: tasks.fes_21.id },
      { blockerId: tasks.fes_07.id, blockedId: tasks.fes_12.id },
      { blockerId: tasks.fes_08.id, blockedId: tasks.fes_12.id },
      { blockerId: tasks.fes_10.id, blockedId: tasks.fes_30.id },
      { blockerId: tasks.fes_17.id, blockedId: tasks.fes_18.id },
      { blockerId: tasks.fes_21.id, blockedId: tasks.fes_22.id },
      { blockerId: tasks.fes_22.id, blockedId: tasks.fes_26.id },
      { blockerId: tasks.fes_23.id, blockedId: tasks.fes_26.id },
      { blockerId: tasks.fes_26.id, blockedId: tasks.fes_27.id },
      { blockerId: tasks.fes_27.id, blockedId: tasks.fes_16.id },
      { blockerId: tasks.fes_30.id, blockedId: tasks.fes_32.id },
      { blockerId: tasks.fes_32.id, blockedId: tasks.fes_33.id },
      { blockerId: subC.id, blockedId: tasks.fes_33.id },
      { blockerId: tasks.fes_34.id, blockedId: tasks.fes_35.id },
      { blockerId: tasks.fes_35.id, blockedId: tasks.fes_39.id },
      { blockerId: tasks.fes_40.id, blockedId: tasks.fes_16.id },
      { blockerId: tasks.fes_42.id, blockedId: tasks.fes_43.id },
      { blockerId: subD.id, blockedId: tasks.fes_43.id },
      { blockerId: tasks.fes_45.id, blockedId: tasks.fes_46.id },
      { blockerId: tasks.fes_16.id, blockedId: tasks.fes_47.id },
      { blockerId: tasks.fes_47.id, blockedId: tasks.fes_48.id },
      { blockerId: subA.id, blockedId: subB.id },
    ],
  });

  await prisma.comment.createMany({
    data: [
      { taskId: tasks.fes_08.id, content: "Le sponsor demande visibilite logo sur scene secondaire.", author: "Julie BERNARD" },
      { taskId: tasks.fes_12.id, content: "Artiste confirme sous reserve d'horaire de balance.", author: "Sarah MOREL" },
      { taskId: tasks.fes_22.id, content: "Prevoir renfort structures si meteo vent > 60 km/h.", author: "Theo ROBERT" },
      { taskId: tasks.fes_30.id, content: "Point prefectoral de jeudi deplace a 14h.", author: "Camille DUMONT" },
      { taskId: tasks.fes_35.id, content: "Le teaser final part demain matin apres validation legale.", author: "Eva GIRARD" },
      { taskId: tasks.fes_43.id, content: "Repeter procedure scan en mode degrade hors-ligne.", author: "Nolan PETIT" },
      { taskId: tasks.fes_47.id, content: "Questionnaire NPS deja prepare dans l'outil CRM.", author: "Lina MARTIN" },
    ],
  });

  await prisma.automation.createMany({
    data: [
      {
        projectId: project.id,
        name: "Alerte blocage task",
        isActive: true,
        trigger: JSON.stringify({ field: "STATUS", value: "STUCK" }),
        action: JSON.stringify({ type: "NOTIFY_OWNER" }),
      },
      {
        projectId: project.id,
        name: "Rappel priorite haute",
        isActive: true,
        trigger: JSON.stringify({ field: "PRIORITY", value: "HIGH" }),
        action: JSON.stringify({ type: "NOTIFY_OWNER" }),
      },
    ],
  });

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: u.id,
        role: i < 2 ? "ADMIN" : "MEMBER",
        isPinned: i === 0,
        projectOrder: 0,
      },
    });
  }

  return {
    project,
    taskCount: taskBlueprints.length + 4,
    keyTaskId: tasks.fes_22.id,
  };
}

async function main() {
  console.log("Seeding festival showcase project...");

  const base = startOfDay();
  const demoPassword = "FestivalDemo2026!";
  const hashed = await bcrypt.hash(demoPassword, 10);

  const userRows = [
    { email: "lina.martin.festival@studio-n.fr", name: "Lina MARTIN" },
    { email: "theo.robert.festival@studio-n.fr", name: "Theo ROBERT" },
    { email: "camille.dumont.festival@studio-n.fr", name: "Camille DUMONT" },
    { email: "nolan.petit.festival@studio-n.fr", name: "Nolan PETIT" },
    { email: "sarah.morel.festival@studio-n.fr", name: "Sarah MOREL" },
    { email: "adam.roux.festival@studio-n.fr", name: "Adam ROUX" },
    { email: "julie.bernard.festival@studio-n.fr", name: "Julie BERNARD" },
  ];

  const users = [];
  for (const row of userRows) {
    const user = await prisma.user.create({
      data: {
        email: row.email,
        name: row.name,
        password: hashed,
      },
    });
    users.push(user);
    for (const type of NOTIF_TYPES) {
      await prisma.userNotificationPreference.create({
        data: { userId: user.id, type, enabled: true },
      });
    }
  }

  const festival = await seedFestivalProject(base, users);

  await prisma.notification.createMany({
    data: [
      {
        userId: users[0].id,
        type: "TASK_ASSIGNED",
        message: "Nouvelle tache assignee: Installation scenes et barrierage",
        taskId: festival.keyTaskId,
        projectId: festival.project.id,
        isRead: false,
      },
      {
        userId: users[0].id,
        type: "DAILY_SUMMARY",
        message: "Point du matin: 26 taches actives, 5 echeances du jour, 2 points bloquants.",
        taskId: null,
        projectId: festival.project.id,
        isRead: false,
      },
    ],
  });

  console.log("Done.");
  console.log(`Festival tasks: ${festival.taskCount}`);
  console.log("Demo account:");
  console.log("  email    : lina.martin.festival@studio-n.fr");
  console.log("  password : FestivalDemo2026!");
  console.log("Owner values are fictional names (not IDs).");
}

main()
  .catch((error) => {
    console.error("Seed error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

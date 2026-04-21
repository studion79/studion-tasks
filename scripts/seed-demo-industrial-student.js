#!/usr/bin/env node
/**
 * Seed 2 showcase projects in one DB:
 * 1) Industrial production program
 * 2) Engineering student exam planning
 *
 * Constraints:
 * - At least 30 tasks per project
 * - OWNER values are fictional names (not user IDs)
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
    "Emma RENAUD",
    "Lucas MARCHAL",
    "Nora DELMAS",
    "Hugo VERNIER",
    "Maya GARNIER",
    "Leo FAURE",
    "Ines BRUNET",
    "Noa PERRIN",
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

async function seedIndustrialProject(base, users) {
  const project = await createProjectSkeleton(
    "Programme Industrie 4.0 - Ligne Assemblage",
    "Projet de demonstration complet: production industrielle, sous-categories, dependances, recurrence, planning heure, budget et suivi qualite."
  );

  const groupDefs = [
    ["pilotage", "Pilotage programme", "#4f46e5", 0, null],
    ["kpi", "KPI et reporting", "#6366f1", 0, "pilotage"],
    ["risques", "Risques et conformite", "#818cf8", 1, "pilotage"],
    ["industrialisation", "Industrialisation", "#0891b2", 1, null],
    ["process", "Process station", "#06b6d4", 0, "industrialisation"],
    ["qualite", "Qualite production", "#22c55e", 1, "industrialisation"],
    ["maintenance", "Maintenance preventive", "#16a34a", 2, "industrialisation"],
    ["deploiement", "Deploiement usines", "#f97316", 2, null],
    ["formation", "Formation operateurs", "#fb923c", 0, "deploiement"],
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
    // KPI (6)
    { key: "ind_01", g: "kpi", t: "Kickoff comite de pilotage", d: -18, h: 10, status: "DONE", pr: "HIGH", budget: 0, notes: "Objectifs cadence et qualite alignes.", done: true },
    { key: "ind_02", g: "kpi", t: "Point quotidien performance ligne", d: 1, h: 8, m: 30, status: "WORKING", pr: "MEDIUM", rec: ["daily", 1, ymd(dateAt(base, 45))], rem: 15 },
    { key: "ind_03", g: "kpi", t: "Revue hebdomadaire TRS", d: 3, h: 11, status: "NOT_STARTED", pr: "MEDIUM", rec: ["weekly", 1, ymd(dateAt(base, 75))], rem: 30 },
    { key: "ind_04", g: "kpi", t: "Consolidation KPI multi-sites", d: 5, h: 16, status: "NOT_STARTED", pr: "HIGH", budget: 1800 },
    { key: "ind_05", g: "kpi", t: "Reunion pilotage fournisseurs", d: 7, h: 15, status: "NOT_STARTED", pr: "HIGH", budget: 2200 },
    { key: "ind_06", g: "kpi", t: "Bilan fin de mois direction", d: 12, h: 9, status: "NOT_STARTED", pr: "HIGH", budget: 0 },

    // Risques (5)
    { key: "ind_07", g: "risques", t: "Mise a jour AMDEC process", d: 4, h: 14, status: "WORKING", pr: "HIGH", budget: 3200 },
    { key: "ind_08", g: "risques", t: "Audit ISO 9001 interne", d: 9, h: 10, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "ind_09", g: "risques", t: "Validation plan de continuite", d: 6, h: 17, status: "STUCK", pr: "HIGH", notes: "Attente retour DSI sur PRA.", rem: 60 },
    { key: "ind_10", g: "risques", t: "Test alerte securite machine", d: 2, h: 13, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "ind_11", g: "risques", t: "Risque fournisseur critique", d: 1, h: 16, status: "WORKING", pr: "HIGH" },

    // Process (6)
    { key: "ind_12", g: "process", t: "Deployer module MES station A3", d: 3, h: 17, m: 30, status: "WORKING", pr: "HIGH", budget: 18500, rem: 30 },
    { key: "ind_13", g: "process", t: "Calibration capteurs vision", d: 2, h: 18, status: "NOT_STARTED", pr: "HIGH", budget: 6400 },
    { key: "ind_14", g: "process", t: "Optimisation cycle convoyeur", d: 5, h: 11, status: "NOT_STARTED", pr: "MEDIUM", budget: 7200 },
    { key: "ind_15", g: "process", t: "Qualification lot pilote", d: 7, h: 19, status: "NOT_STARTED", pr: "HIGH", budget: 9800 },
    { key: "ind_16", g: "process", t: "Mise en place SPC ligne", d: 8, h: 15, status: "NOT_STARTED", pr: "MEDIUM", budget: 5100 },
    { key: "ind_17", g: "process", t: "Validation procedure rollback MES", d: 2, h: 14, status: "NOT_STARTED", pr: "HIGH", budget: 0 },

    // Qualite (5)
    { key: "ind_18", g: "qualite", t: "Plan de controle Poka-Yoke", d: 4, h: 16, status: "STUCK", pr: "HIGH", notes: "Capteurs retardes chez le fournisseur." },
    { key: "ind_19", g: "qualite", t: "Revue non-conformites hebdo", d: 1, h: 9, status: "WORKING", pr: "MEDIUM", rec: ["weekly", 1, ymd(dateAt(base, 60))] },
    { key: "ind_20", g: "qualite", t: "Verification dossiers FAI", d: 6, h: 14, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "ind_21", g: "qualite", t: "Validation MSA gauge R&R", d: 10, h: 15, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "ind_22", g: "qualite", t: "Audit poste emballage", d: 11, h: 10, status: "NOT_STARTED", pr: "LOW" },

    // Maintenance (4)
    { key: "ind_23", g: "maintenance", t: "Campagne vibration moteur M2", d: -5, h: 15, status: "DONE", pr: "LOW", done: true, archived: true },
    { key: "ind_24", g: "maintenance", t: "Plan lubrification trimestriel", d: 13, h: 8, status: "NOT_STARTED", pr: "LOW", rec: ["monthly", 1, ymd(dateAt(base, 180))] },
    { key: "ind_25", g: "maintenance", t: "Verification stock pieces critiques", d: 2, h: 12, status: "WORKING", pr: "MEDIUM" },
    { key: "ind_26", g: "maintenance", t: "Maintenance preventive robot R7", d: 9, h: 7, status: "NOT_STARTED", pr: "MEDIUM" },

    // Formation (4)
    { key: "ind_27", g: "formation", t: "Former chefs equipe poste nuit", d: 10, h: 18, status: "NOT_STARTED", pr: "LOW" },
    { key: "ind_28", g: "formation", t: "Atelier securite changement serie", d: 4, h: 10, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "ind_29", g: "formation", t: "Validation habilitations machine", d: 3, h: 9, status: "WORKING", pr: "HIGH" },
    { key: "ind_30", g: "formation", t: "Simulation arret urgence multi-postes", d: 6, h: 16, status: "NOT_STARTED", pr: "MEDIUM" },

    // Deploiement (4)
    { key: "ind_31", g: "deploiement", t: "Preparation deploiement usine Lyon", d: 12, h: 11, status: "NOT_STARTED", pr: "HIGH", budget: 14000 },
    { key: "ind_32", g: "deploiement", t: "Checklist migration donnees", d: 8, h: 13, status: "NOT_STARTED", pr: "HIGH" },
    { key: "ind_33", g: "deploiement", t: "Go/No-Go comite deploiement", d: 14, h: 15, status: "NOT_STARTED", pr: "HIGH" },
    { key: "ind_34", g: "deploiement", t: "Retour experience deploiement", d: 21, h: 10, status: "NOT_STARTED", pr: "MEDIUM" },
  ];

  const positionByGroup = new Map();
  const tasks = {};
  for (let i = 0; i < taskBlueprints.length; i++) {
    const bp = taskBlueprints[i];
    const position = positionByGroup.get(bp.g) ?? 0;
    positionByGroup.set(bp.g, position + 1);

    const due = dateAt(base, bp.d, bp.h ?? 9, bp.m ?? 0);
    const periodStart = dateAt(base, bp.d - 1, Math.max((bp.h ?? 9) - 2, 6), bp.m ?? 0);
    const periodEnd = dateAt(base, bp.d, bp.h ?? 9, bp.m ?? 0);

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

  await prisma.taskDependency.createMany({
    data: [
      { blockerId: tasks.ind_01.id, blockedId: tasks.ind_12.id },
      { blockerId: tasks.ind_17.id, blockedId: tasks.ind_12.id },
      { blockerId: tasks.ind_18.id, blockedId: tasks.ind_08.id },
      { blockerId: tasks.ind_12.id, blockedId: tasks.ind_31.id },
      { blockerId: tasks.ind_13.id, blockedId: tasks.ind_15.id },
      { blockerId: tasks.ind_15.id, blockedId: tasks.ind_33.id },
      { blockerId: tasks.ind_09.id, blockedId: tasks.ind_33.id },
      { blockerId: tasks.ind_29.id, blockedId: tasks.ind_31.id },
      { blockerId: tasks.ind_03.id, blockedId: tasks.ind_06.id },
      { blockerId: tasks.ind_19.id, blockedId: tasks.ind_20.id },
      { blockerId: tasks.ind_25.id, blockedId: tasks.ind_26.id },
      { blockerId: tasks.ind_31.id, blockedId: tasks.ind_34.id },
    ],
  });

  await prisma.comment.createMany({
    data: [
      { taskId: tasks.ind_12.id, content: "Fenetre de migration confirmee mardi 22:00.", author: "Emma RENAUD" },
      { taskId: tasks.ind_18.id, content: "Fournisseur capteurs annonce un retard de 48h.", author: "Nora DELMAS" },
      { taskId: tasks.ind_31.id, content: "Le site Lyon demande un support local pendant 3 jours.", author: "Lucas MARCHAL" },
    ],
  });

  await prisma.automation.create({
    data: {
      projectId: project.id,
      name: "Alerte blocage qualite",
      isActive: true,
      trigger: JSON.stringify({ field: "STATUS", value: "STUCK" }),
      action: JSON.stringify({ type: "NOTIFY_OWNER" }),
    },
  });

  // Members for visibility in app (owners remain fictional names)
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: u.id,
        role: i === 0 ? "ADMIN" : "MEMBER",
        isPinned: i === 0,
        projectOrder: 0,
      },
    });
  }

  return { project, taskCount: taskBlueprints.length, keyTaskId: tasks.ind_12.id };
}

async function seedStudentProject(base, users) {
  const project = await createProjectSkeleton(
    "Revision Examens - Etudiant Ingenieur",
    "Projet de demonstration complet: revisions d'examens, creneaux horaires, dependances, recurrence, sous-categories et suivi des priorites."
  );

  const groupDefs = [
    ["orga", "Organisation examens", "#f59e0b", 0, null],
    ["tronc", "Tronc commun", "#2563eb", 1, null],
    ["maths", "Maths appliquees", "#3b82f6", 0, "tronc"],
    ["meca", "Mecanique des structures", "#60a5fa", 1, "tronc"],
    ["specialite", "Specialite", "#7c3aed", 2, null],
    ["auto", "Automatique", "#8b5cf6", 0, "specialite"],
    ["info", "Informatique industrielle", "#a78bfa", 1, "specialite"],
    ["oral", "Oral et soutenance", "#ec4899", 3, null],
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
    // Organisation (6)
    { key: "stu_01", g: "orga", t: "Construire planning revision 6 semaines", d: -5, h: 19, status: "DONE", pr: "HIGH", done: true },
    { key: "stu_02", g: "orga", t: "Bloquer creneaux bibliotheque", d: 1, h: 8, status: "WORKING", pr: "MEDIUM" },
    { key: "stu_03", g: "orga", t: "Planifier pauses et sport", d: 2, h: 20, status: "NOT_STARTED", pr: "LOW", rec: ["weekly", 1, ymd(dateAt(base, 56))] },
    { key: "stu_04", g: "orga", t: "Revue hebdo progression", d: 3, h: 18, status: "NOT_STARTED", pr: "MEDIUM", rec: ["weekly", 1, ymd(dateAt(base, 49))] },
    { key: "stu_05", g: "orga", t: "Preparer kit examen (docs, carte)", d: 12, h: 17, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "stu_06", g: "orga", t: "Verif horaires officiels examens", d: 7, h: 10, status: "NOT_STARTED", pr: "HIGH" },

    // Maths (6)
    { key: "stu_07", g: "maths", t: "Annales probabilites - sujet 1", d: 1, h: 21, status: "WORKING", pr: "HIGH", rem: 20 },
    { key: "stu_08", g: "maths", t: "Annales probabilites - sujet 2", d: 3, h: 21, status: "NOT_STARTED", pr: "HIGH" },
    { key: "stu_09", g: "maths", t: "Annales probabilites - sujet 3", d: 5, h: 21, status: "NOT_STARTED", pr: "HIGH" },
    { key: "stu_10", g: "maths", t: "Exercices diagonalisation", d: 2, h: 18, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "stu_11", g: "maths", t: "Fiche methodes integrales", d: 4, h: 17, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "stu_12", g: "maths", t: "Quiz flash maths 15min", d: 0, h: 7, m: 45, status: "WORKING", pr: "LOW", rec: ["daily", 1, ymd(dateAt(base, 40))], rem: 5 },

    // Meca (5)
    { key: "stu_13", g: "meca", t: "Fiches RDM chapitres 2-5", d: 4, h: 18, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "stu_14", g: "meca", t: "Exercices torseur complet", d: 6, h: 20, status: "NOT_STARTED", pr: "HIGH" },
    { key: "stu_15", g: "meca", t: "Resoudre DM poutres hyperstatiques", d: 8, h: 19, status: "NOT_STARTED", pr: "HIGH" },
    { key: "stu_16", g: "meca", t: "Session correction avec binome", d: 9, h: 16, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "stu_17", g: "meca", t: "Mise en forme formulaire RDM", d: 10, h: 14, status: "NOT_STARTED", pr: "LOW" },

    // Automatique (6)
    { key: "stu_18", g: "auto", t: "Finaliser TP asservissement non lineaire", d: 2, h: 23, status: "STUCK", pr: "HIGH", notes: "Convergence Simulink instable." },
    { key: "stu_19", g: "auto", t: "Verifier discretisation correcteur", d: 2, h: 14, status: "WORKING", pr: "HIGH" },
    { key: "stu_20", g: "auto", t: "Serie Bode et Nyquist", d: 5, h: 18, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "stu_21", g: "auto", t: "Fiche stabilite lyapunov", d: 7, h: 18, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "stu_22", g: "auto", t: "QCM capteurs actionneurs", d: 11, h: 13, status: "NOT_STARTED", pr: "LOW" },
    { key: "stu_23", g: "auto", t: "Oral blanc automatique", d: 13, h: 17, status: "NOT_STARTED", pr: "HIGH", rem: 60 },

    // Info indus (5)
    { key: "stu_24", g: "info", t: "Revision protocoles Modbus et CAN", d: 3, h: 19, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "stu_25", g: "info", t: "Exercice RTOS ordonnancement", d: 4, h: 20, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "stu_26", g: "info", t: "TP API OPC-UA mini projet", d: 6, h: 19, status: "NOT_STARTED", pr: "HIGH" },
    { key: "stu_27", g: "info", t: "Fiche cybers ecurite OT", d: 9, h: 17, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "stu_28", g: "info", t: "Drill debug automate", d: 12, h: 15, status: "NOT_STARTED", pr: "LOW" },

    // Oral (4)
    { key: "stu_29", g: "oral", t: "Simulation orale avec binome", d: 5, h: 16, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "stu_30", g: "oral", t: "Preparation slides soutenance", d: 10, h: 18, status: "NOT_STARTED", pr: "MEDIUM" },
    { key: "stu_31", g: "oral", t: "Examen automatique", d: 14, h: 9, status: "NOT_STARTED", pr: "HIGH", noPeriod: true },
    { key: "stu_32", g: "oral", t: "Archivage notes session precedente", d: -3, h: 11, status: "DONE", pr: "LOW", done: true, archived: true },
  ];

  const positionByGroup = new Map();
  const tasks = {};
  for (let i = 0; i < taskBlueprints.length; i++) {
    const bp = taskBlueprints[i];
    const position = positionByGroup.get(bp.g) ?? 0;
    positionByGroup.set(bp.g, position + 1);

    const due = dateAt(base, bp.d, bp.h ?? 9, bp.m ?? 0);
    const periodStart = bp.noPeriod ? null : dateAt(base, bp.d - 1, Math.max((bp.h ?? 9) - 2, 6), bp.m ?? 0);
    const periodEnd = bp.noPeriod ? null : due;

    tasks[bp.key] = await createTask({
      projectColumnMap: col,
      groupId: groups[bp.g].id,
      title: bp.t,
      position,
      status: bp.status,
      priority: bp.pr,
      ownerName: ownerByIndex(i + 2),
      due,
      periodStart,
      periodEnd,
      budget: null,
      notes: bp.notes ?? "",
      recurrenceValue: bp.rec ? recurrence(bp.rec[0], bp.rec[1], bp.rec[2]) : null,
      archivedAt: bp.archived ? dateAt(base, bp.d + 1, 8, 0) : null,
      completedAt: bp.done ? dateAt(base, bp.d, (bp.h ?? 9) + 1, bp.m ?? 0) : null,
      reminderOffsetMinutes: bp.rem ?? null,
    });
  }

  // 3 subtasks to showcase feature
  const subA = await createTask({
    projectColumnMap: col,
    groupId: groups.auto.id,
    parentId: tasks.stu_18.id,
    title: "Comparer poles attendus vs observes",
    position: 0,
    status: "DONE",
    priority: "MEDIUM",
    ownerName: "Maya GARNIER",
    due: dateAt(base, 1, 22, 0),
    periodStart: null,
    periodEnd: null,
    completedAt: dateAt(base, 1, 22, 10),
  });

  const subB = await createTask({
    projectColumnMap: col,
    groupId: groups.auto.id,
    parentId: tasks.stu_18.id,
    title: "Valider marge de phase minimale",
    position: 1,
    status: "WORKING",
    priority: "HIGH",
    ownerName: "Lucas MARCHAL",
    due: dateAt(base, 2, 16, 0),
    periodStart: null,
    periodEnd: null,
  });

  const subC = await createTask({
    projectColumnMap: col,
    groupId: groups.maths.id,
    parentId: tasks.stu_07.id,
    title: "Relire correction exercice 4",
    position: 0,
    status: "NOT_STARTED",
    priority: "LOW",
    ownerName: "Nora DELMAS",
    due: dateAt(base, 1, 22, 30),
    periodStart: null,
    periodEnd: null,
  });

  await prisma.taskDependency.createMany({
    data: [
      { blockerId: tasks.stu_01.id, blockedId: tasks.stu_07.id },
      { blockerId: tasks.stu_07.id, blockedId: tasks.stu_08.id },
      { blockerId: tasks.stu_08.id, blockedId: tasks.stu_09.id },
      { blockerId: tasks.stu_19.id, blockedId: tasks.stu_18.id },
      { blockerId: tasks.stu_18.id, blockedId: tasks.stu_23.id },
      { blockerId: tasks.stu_13.id, blockedId: tasks.stu_15.id },
      { blockerId: tasks.stu_24.id, blockedId: tasks.stu_26.id },
      { blockerId: tasks.stu_26.id, blockedId: tasks.stu_30.id },
      { blockerId: tasks.stu_06.id, blockedId: tasks.stu_31.id },
      { blockerId: tasks.stu_23.id, blockedId: tasks.stu_31.id },
      { blockerId: subA.id, blockedId: subB.id },
      { blockerId: subB.id, blockedId: tasks.stu_23.id },
      { blockerId: subC.id, blockedId: tasks.stu_08.id },
    ],
  });

  await prisma.comment.createMany({
    data: [
      { taskId: tasks.stu_18.id, content: "Essayer un pas de 20ms pour stabiliser la reponse.", author: "Emma RENAUD" },
      { taskId: tasks.stu_07.id, content: "Bonne progression, continuer sur sujet 2 demain.", author: "Lucas MARCHAL" },
      { taskId: tasks.stu_31.id, content: "Salle B-204 confirmee sur la convocation.", author: "Nora DELMAS" },
    ],
  });

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: u.id,
        role: i === 0 ? "ADMIN" : "MEMBER",
        isPinned: i === 0,
        projectOrder: 1,
      },
    });
  }

  return { project, taskCount: taskBlueprints.length + 3, keyTaskId: tasks.stu_18.id };
}

async function main() {
  console.log("Seeding industrial + student showcase projects (expanded)...");

  const base = startOfDay();
  const demoPassword = "DemoTask2026!";
  const hashed = await bcrypt.hash(demoPassword, 10);

  // Minimal user set to allow project visibility after DB import.
  const userRows = [
    { email: "lea.martin.demo@studio-n.fr", name: "Lea MARTIN" },
    { email: "hugo.bernard.demo@studio-n.fr", name: "Hugo BERNARD" },
    { email: "ines.leroy.demo@studio-n.fr", name: "Ines LEROY" },
    { email: "yanis.moreau.demo@studio-n.fr", name: "Yanis MOREAU" },
    { email: "clara.petit.demo@studio-n.fr", name: "Clara PETIT" },
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

  const industrial = await seedIndustrialProject(base, users);
  const student = await seedStudentProject(base, users);

  await prisma.projectLink.create({
    data: {
      projectAId: industrial.project.id,
      projectBId: student.project.id,
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: users[0].id,
        type: "TASK_ASSIGNED",
        message: "Nouvelle tache assignee: Deployer module MES station A3",
        taskId: industrial.keyTaskId,
        projectId: industrial.project.id,
        isRead: false,
      },
      {
        userId: users[0].id,
        type: "DAILY_SUMMARY",
        message: "Point du matin: 18 taches actives, 4 echeances aujourd'hui, 2 blocages.",
        taskId: null,
        projectId: student.project.id,
        isRead: false,
      },
    ],
  });

  console.log("Done.");
  console.log(`Industrial tasks: ${industrial.taskCount}`);
  console.log(`Student tasks: ${student.taskCount}`);
  console.log("Demo account:");
  console.log("  email    : lea.martin.demo@studio-n.fr");
  console.log("  password : DemoTask2026!");
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

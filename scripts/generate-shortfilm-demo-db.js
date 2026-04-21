#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
const { PrismaLibSql } = require("@prisma/adapter-libsql");
const { PrismaClient } = require("../src/generated/prisma");

const AVAILABLE_COLUMNS = [
  { type: "OWNER", label: "Owner", defaultActive: true },
  { type: "STATUS", label: "Status", defaultActive: true },
  { type: "DUE_DATE", label: "Due date", defaultActive: true },
  { type: "PRIORITY", label: "Priority", defaultActive: true },
  { type: "TIMELINE", label: "Timeline", defaultActive: true },
  { type: "BUDGET", label: "Budget", defaultActive: true },
  { type: "NOTES", label: "Notes", defaultActive: true },
];

const AVAILABLE_VIEWS = [
  { type: "SPREADSHEET", label: "Tableur", isDefault: true },
  { type: "CARDS", label: "Fiches" },
  { type: "KANBAN", label: "Kanban" },
  { type: "CALENDAR", label: "Agenda" },
  { type: "GANTT", label: "Gantt" },
  { type: "TIMELINE", label: "Echeancier" },
];

const AVAILABLE_WIDGETS = [
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

function toDateKey(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function withTime(dateKey, time) {
  return `${dateKey}T${time}`;
}

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

async function main() {
  const defaultDb = path.resolve(process.cwd(), "artifacts/shortfilm-demo-hierarchy.db");
  const url = process.env.LIBSQL_DATABASE_URL || `file:${defaultDb}`;
  const adapter = new PrismaLibSql({ url });
  const prisma = new PrismaClient({ adapter });

  const now = new Date();
  const monday = addDays(now, -((now.getDay() + 6) % 7));

  const dates = {
    d0: toDateKey(monday),
    d1: toDateKey(addDays(monday, 1)),
    d2: toDateKey(addDays(monday, 2)),
    d3: toDateKey(addDays(monday, 3)),
    d4: toDateKey(addDays(monday, 4)),
    d5: toDateKey(addDays(monday, 5)),
    d7: toDateKey(addDays(monday, 7)),
    d9: toDateKey(addDays(monday, 9)),
    d12: toDateKey(addDays(monday, 12)),
    d14: toDateKey(addDays(monday, 14)),
    d18: toDateKey(addDays(monday, 18)),
    d21: toDateKey(addDays(monday, 21)),
    d24: toDateKey(addDays(monday, 24)),
    d28: toDateKey(addDays(monday, 28)),
    d35: toDateKey(addDays(monday, 35)),
  };

  const project = await prisma.project.create({
    data: {
      name: "Demo Court-metrage - Les Ombres du Quai",
      description:
        "Projet de demo complet avec sous-categories imbriquees, dependances, recurrence et planification par heure.",
    },
  });

  const columns = {};
  for (let i = 0; i < AVAILABLE_COLUMNS.length; i++) {
    const c = AVAILABLE_COLUMNS[i];
    const created = await prisma.projectColumn.create({
      data: {
        projectId: project.id,
        type: c.type,
        label: c.label,
        position: i,
        isActive: c.defaultActive,
      },
    });
    columns[c.type] = created.id;
  }

  for (let i = 0; i < AVAILABLE_VIEWS.length; i++) {
    const v = AVAILABLE_VIEWS[i];
    await prisma.projectView.create({
      data: {
        projectId: project.id,
        type: v.type,
        name: v.label,
        isDefault: Boolean(v.isDefault),
        position: i,
      },
    });
  }

  for (let i = 0; i < AVAILABLE_WIDGETS.length; i++) {
    await prisma.projectDashboardWidget.create({
      data: {
        projectId: project.id,
        type: AVAILABLE_WIDGETS[i],
        position: i,
        isActive: true,
      },
    });
  }

  const groups = {};
  async function mkGroup(key, { name, color, parentKey = null, position = 0 }) {
    const g = await prisma.group.create({
      data: {
        projectId: project.id,
        parentId: parentKey ? groups[parentKey].id : null,
        name,
        color,
        position,
      },
    });
    groups[key] = g;
  }

  await mkGroup("prepro", { name: "Preproduction", color: "#6366f1", position: 0 });
  await mkGroup("script", { name: "Script", color: "#4f46e5", parentKey: "prepro", position: 0 });
  await mkGroup("casting", { name: "Casting", color: "#7c3aed", parentKey: "prepro", position: 1 });
  await mkGroup("repérages", { name: "Reperages", color: "#2563eb", parentKey: "prepro", position: 2 });

  await mkGroup("prod", { name: "Production", color: "#f59e0b", position: 1 });
  await mkGroup("tournage", { name: "Tournage", color: "#f97316", parentKey: "prod", position: 0 });
  await mkGroup("logistique", { name: "Logistique", color: "#ea580c", parentKey: "prod", position: 1 });

  await mkGroup("post", { name: "Post-production", color: "#10b981", position: 2 });
  await mkGroup("montage", { name: "Montage image", color: "#059669", parentKey: "post", position: 0 });
  await mkGroup("son", { name: "Son & Mix", color: "#0d9488", parentKey: "post", position: 1 });

  await mkGroup("diff", { name: "Diffusion", color: "#ec4899", position: 3 });

  const tasks = {};

  async function addTask(key, groupKey, title, position, fieldByType = {}, extra = {}) {
    const task = await prisma.task.create({
      data: {
        groupId: groups[groupKey].id,
        title,
        position,
        recurrence: extra.recurrence || null,
        archivedAt: extra.archivedAt || null,
        completedAt: extra.completedAt || null,
      },
    });

    const entries = Object.entries(fieldByType);
    for (const [type, value] of entries) {
      const columnId = columns[type];
      if (!columnId) continue;
      await prisma.taskFieldValue.create({
        data: {
          taskId: task.id,
          columnId,
          value: value == null ? null : String(value),
        },
      });
    }

    tasks[key] = task;
    return task;
  }

  // PREPRO / SCRIPT
  await addTask("synopsis", "script", "Valider le synopsis final", 0, {
    OWNER: "Alice",
    STATUS: "DONE",
    PRIORITY: "HIGH",
    DUE_DATE: withTime(dates.d2, "18:00"),
    NOTES: "Version V12 validee avec production.",
  }, { completedAt: new Date() });

  await addTask("dialogues", "script", "Finaliser les dialogues scene 3 a 9", 1, {
    OWNER: "Paul",
    STATUS: "WORKING",
    PRIORITY: "HIGH",
    DUE_DATE: withTime(dates.d7, "17:30"),
    TIMELINE: JSON.stringify({ start: withTime(dates.d3, "09:30"), end: withTime(dates.d7, "17:30") }),
    NOTES: "Relecture avec script doctor prevue jeudi.",
  });

  await addTask("continuite", "script", "Verif continuite accessoires", 2, {
    OWNER: "Camille",
    STATUS: "NOT_STARTED",
    PRIORITY: "MEDIUM",
    DUE_DATE: dates.d9,
    NOTES: "Check-list a partager a l'equipe image.",
  });

  // CASTING
  await addTask("casting-principal", "casting", "Choisir les 2 roles principaux", 0, {
    OWNER: "Nathan",
    STATUS: "WORKING",
    PRIORITY: "HIGH",
    DUE_DATE: withTime(dates.d5, "12:00"),
    TIMELINE: JSON.stringify({ start: withTime(dates.d1, "10:00"), end: withTime(dates.d5, "12:00") }),
    NOTES: "3 finalistes par role.",
  });

  await addTask("casting-figurants", "casting", "Session figurants quartier port", 1, {
    OWNER: "Alice",
    STATUS: "NOT_STARTED",
    PRIORITY: "LOW",
    DUE_DATE: dates.d12,
    TIMELINE: JSON.stringify({ start: dates.d12, end: dates.d14 }),
    NOTES: "Besoin de 15 profils adultes.",
  });

  // REPERAGES
  await addTask("reperage-quai", "repérages", "Reperage quai principal", 0, {
    OWNER: "Camille",
    STATUS: "DONE",
    PRIORITY: "MEDIUM",
    DUE_DATE: dates.d4,
    NOTES: "Acces camion valide par la mairie.",
  }, { completedAt: new Date() });

  await addTask("autorisation-mairie", "repérages", "Obtenir autorisation tournage mairie", 1, {
    OWNER: "Nathan",
    STATUS: "STUCK",
    PRIORITY: "HIGH",
    DUE_DATE: withTime(dates.d9, "11:00"),
    NOTES: "En attente signature du service voirie.",
  });

  // TOURNAGE
  await addTask("jour1", "tournage", "Tournage jour 1 - Exterieur quai", 0, {
    OWNER: "Paul",
    STATUS: "NOT_STARTED",
    PRIORITY: "HIGH",
    DUE_DATE: withTime(dates.d18, "08:00"),
    TIMELINE: JSON.stringify({ start: withTime(dates.d18, "07:00"), end: withTime(dates.d18, "20:00") }),
    BUDGET: "4200",
    NOTES: "Scene 1, 2, 4",
  });

  await addTask("jour2", "tournage", "Tournage jour 2 - Interieur entrepot", 1, {
    OWNER: "Paul",
    STATUS: "NOT_STARTED",
    PRIORITY: "HIGH",
    DUE_DATE: withTime(dates.d21, "08:00"),
    TIMELINE: JSON.stringify({ start: withTime(dates.d21, "08:00"), end: withTime(dates.d21, "19:00") }),
    BUDGET: "3800",
    NOTES: "Scene 5 a 9",
  });

  // LOGISTIQUE
  await addTask("camion", "logistique", "Reserver camion materiel", 0, {
    OWNER: "Alice",
    STATUS: "WORKING",
    PRIORITY: "MEDIUM",
    DUE_DATE: withTime(dates.d14, "16:00"),
    NOTES: "Option frigorifique pour stock batteries.",
  });

  await addTask("catering", "logistique", "Confirmer catering equipe", 1, {
    OWNER: "Camille",
    STATUS: "NOT_STARTED",
    PRIORITY: "LOW",
    DUE_DATE: dates.d18,
    NOTES: "Menus veg + sans lactose.",
  });

  await addTask("daily-call", "logistique", "Envoyer callsheet quotidien", 2, {
    OWNER: "Alice",
    STATUS: "NOT_STARTED",
    PRIORITY: "MEDIUM",
    DUE_DATE: withTime(dates.d18, "18:30"),
    NOTES: "Rappel recurent jusqu'a fin tournage.",
  }, {
    recurrence: JSON.stringify({ frequency: "daily", interval: 1, endDate: dates.d24 }),
  });

  // MONTAGE
  await addTask("assembly", "montage", "Assembly cut", 0, {
    OWNER: "Nathan",
    STATUS: "NOT_STARTED",
    PRIORITY: "HIGH",
    DUE_DATE: dates.d28,
    TIMELINE: JSON.stringify({ start: dates.d24, end: dates.d28 }),
    BUDGET: "2500",
  });

  await addTask("director-cut", "montage", "Director cut v1", 1, {
    OWNER: "Nathan",
    STATUS: "NOT_STARTED",
    PRIORITY: "HIGH",
    DUE_DATE: dates.d35,
    TIMELINE: JSON.stringify({ start: dates.d28, end: dates.d35 }),
    BUDGET: "3100",
  });

  // SON
  await addTask("sound-design", "son", "Sound design ambiances port", 0, {
    OWNER: "Paul",
    STATUS: "NOT_STARTED",
    PRIORITY: "MEDIUM",
    DUE_DATE: dates.d35,
    TIMELINE: JSON.stringify({ start: dates.d28, end: dates.d35 }),
    NOTES: "Couches vent, mer, metal.",
  });

  await addTask("mix-final", "son", "Mix final 5.1", 1, {
    OWNER: "Paul",
    STATUS: "NOT_STARTED",
    PRIORITY: "HIGH",
    DUE_DATE: withTime(dates.d35, "17:00"),
    TIMELINE: JSON.stringify({ start: withTime(dates.d35, "09:00"), end: withTime(dates.d35, "17:00") }),
  });

  // DIFFUSION
  await addTask("poster", "diff", "Valider affiche officielle", 0, {
    OWNER: "Camille",
    STATUS: "WORKING",
    PRIORITY: "MEDIUM",
    DUE_DATE: dates.d24,
    NOTES: "Version print + reseaux.",
  });

  await addTask("festivals", "diff", "Soumettre aux festivals cibles", 1, {
    OWNER: "Alice",
    STATUS: "NOT_STARTED",
    PRIORITY: "HIGH",
    DUE_DATE: dates.d35,
    NOTES: "Locarno, Clermont, Venice Critics.",
  });

  // subtasks example
  const parentTask = await addTask("dossier-financement", "prepro", "Completer dossier financement", 99, {
    OWNER: "Nathan",
    STATUS: "WORKING",
    PRIORITY: "HIGH",
    DUE_DATE: withTime(dates.d14, "14:00"),
    NOTES: "Inclure plan de diffusion et devis consolides.",
  });

  await prisma.task.create({ data: { groupId: groups.prepro.id, parentId: parentTask.id, title: "Ajouter devis camera", position: 0 } });
  await prisma.task.create({ data: { groupId: groups.prepro.id, parentId: parentTask.id, title: "Ajouter devis son", position: 1 } });

  // dependencies for gantt/timeline demo
  const deps = [
    ["dialogues", "casting-principal"],
    ["casting-principal", "jour1"],
    ["autorisation-mairie", "jour1"],
    ["jour1", "jour2"],
    ["jour2", "assembly"],
    ["assembly", "director-cut"],
    ["director-cut", "mix-final"],
    ["mix-final", "festivals"],
  ];

  for (const [blockerKey, blockedKey] of deps) {
    await prisma.taskDependency.create({
      data: {
        blockerId: tasks[blockerKey].id,
        blockedId: tasks[blockedKey].id,
      },
    });
  }

  await prisma.savedView.create({
    data: {
      projectId: project.id,
      name: "Demo - Priorites de tournage",
      snapshot: JSON.stringify({
        tab: "spreadsheet",
        filters: { status: ["NOT_STARTED", "WORKING", "STUCK"], priority: ["HIGH"], owner: [] },
        sort: { columnType: "DUE_DATE", dir: "asc" },
      }),
    },
  });

  console.log("Demo DB generated:", url);
  console.log("Project:", project.name);
  console.log("Groups:", Object.keys(groups).length, "Tasks:", Object.keys(tasks).length);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Failed to generate demo DB:", err);
  process.exit(1);
});

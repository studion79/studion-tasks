import type {
  Project,
  ProjectColumn,
  ProjectView,
  ProjectDashboardWidget,
  Group,
  Task,
  TaskFieldValue,
  ColumnType,
  ViewType,
  WidgetType,
} from "@/generated/prisma";

export type {
  Project,
  ProjectColumn,
  ProjectView,
  ProjectDashboardWidget,
  Group,
  Task,
  TaskFieldValue,
  ColumnType,
  ViewType,
  WidgetType,
};

export type TaskWithFields = Task & {
  fieldValues: TaskFieldValue[];
  subtasks?: SubtaskWithFields[];
  blockerDeps?: { id: string; blockedId: string }[];
  attachments?: { id: string }[];
  comments?: { id: string }[];
};
export type SubtaskWithFields = Task & { fieldValues: TaskFieldValue[] };
export type GroupWithTasks = Group & { tasks: TaskWithFields[] };

export type ProjectWithRelations = Project & {
  columns: ProjectColumn[];
  views: ProjectView[];
  dashboardWidgets: ProjectDashboardWidget[];
  groups: GroupWithTasks[];
};

export type ColumnMeta = {
  type: ColumnType;
  label: string;
  description: string;
  defaultActive: boolean;
};

export type ViewMeta = {
  type: ViewType;
  label: string;
  description: string;
  icon: string;
};

export type WidgetMeta = {
  type: WidgetType;
  label: string;
  description: string;
  defaultActive: boolean;
};

export const AVAILABLE_COLUMNS: ColumnMeta[] = [
  { type: "OWNER", label: "Owner", description: "Responsable de la tâche", defaultActive: true },
  { type: "STATUS", label: "Status", description: "État d'avancement", defaultActive: true },
  { type: "DUE_DATE", label: "Due date", description: "Date d'échéance", defaultActive: true },
  { type: "PRIORITY", label: "Priority", description: "Niveau de priorité", defaultActive: true },
  { type: "TIMELINE", label: "Timeline", description: "Période de réalisation", defaultActive: false },
  { type: "BUDGET", label: "Budget", description: "Budget alloué", defaultActive: false },
  { type: "NOTES", label: "Notes", description: "Notes libres", defaultActive: false },
];

export const AVAILABLE_VIEWS: ViewMeta[] = [
  { type: "SPREADSHEET", label: "Tableur", description: "Vue tableau classique", icon: "grid" },
  { type: "CARDS", label: "Fiches", description: "Vue cartes visuelles", icon: "card" },
  { type: "KANBAN", label: "Kanban", description: "Vue colonnes par statut", icon: "kanban" },
  { type: "CALENDAR", label: "Calendrier", description: "Vue calendrier", icon: "calendar" },
];

export const AVAILABLE_WIDGETS: WidgetMeta[] = [
  { type: "TASK_OVERVIEW", label: "Vue d'ensemble", description: "Total et répartition générale", defaultActive: true },
  { type: "BY_STATUS", label: "Par statut", description: "Répartition par état", defaultActive: true },
  { type: "BY_OWNER", label: "Par responsable", description: "Répartition par personne", defaultActive: false },
  { type: "OVERDUE", label: "Tâches en retard", description: "Tâches dépassant la date d'échéance", defaultActive: true },
  { type: "BY_DUE_DATE", label: "Par échéance", description: "Calendrier des échéances", defaultActive: false },
  { type: "PRIORITY_BREAKDOWN", label: "Par priorité", description: "Répartition par niveau de priorité", defaultActive: false },
  { type: "COMPLETION_BY_GROUP", label: "Avancement par groupe", description: "Progression par groupe de tâches", defaultActive: false },
  { type: "BUDGET_TOTAL", label: "Budget total", description: "Somme des budgets de toutes les tâches", defaultActive: false },
  { type: "BURNDOWN", label: "Burndown", description: "Tâches complétées dans le temps", defaultActive: false },
  { type: "VELOCITY", label: "Vélocité", description: "Tâches complétées par semaine", defaultActive: false },
];

export type CreateProjectInput = {
  name: string;
  selectedColumns: ColumnType[];
  defaultView: ViewType;
  selectedWidgets: WidgetType[];
};

export type SpreadsheetFilters = {
  status: string[];
  priority: string[];
  owner: string[];
};

export type SpreadsheetSortColumn = "TITLE" | "STATUS" | "PRIORITY" | "DUE_DATE";
export type SpreadsheetSort = { columnType: SpreadsheetSortColumn; dir: "asc" | "desc" } | null;

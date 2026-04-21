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
  subtasks?: TaskWithFields[];
  blockerDeps?: { id: string; blockedId: string }[];
  attachments?: { id: string }[];
  comments?: { id: string }[];
};
export type SubtaskWithFields = TaskWithFields;
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
  { type: "OWNER", label: "Owner", description: "Task owner", defaultActive: true },
  { type: "STATUS", label: "Status", description: "Progress status", defaultActive: true },
  { type: "DUE_DATE", label: "Due date", description: "Deadline date", defaultActive: true },
  { type: "PRIORITY", label: "Priority", description: "Priority level", defaultActive: true },
  { type: "TIMELINE", label: "Timeline", description: "Execution period", defaultActive: false },
  { type: "BUDGET", label: "Budget", description: "Allocated budget", defaultActive: false },
  { type: "NOTES", label: "Notes", description: "Free-form notes", defaultActive: false },
];

export const AVAILABLE_VIEWS: ViewMeta[] = [
  { type: "SPREADSHEET", label: "Spreadsheet", description: "Classic table view", icon: "grid" },
  { type: "CARDS", label: "Cards", description: "Visual card view", icon: "card" },
  { type: "KANBAN", label: "Kanban", description: "Columns by status view", icon: "kanban" },
  { type: "CALENDAR", label: "Calendar", description: "Calendar view", icon: "calendar" },
];

export const AVAILABLE_WIDGETS: WidgetMeta[] = [
  { type: "TASK_OVERVIEW", label: "Overview", description: "Totals and global split", defaultActive: true },
  { type: "BY_STATUS", label: "By status", description: "Status distribution", defaultActive: true },
  { type: "BY_OWNER", label: "By owner", description: "Distribution by person", defaultActive: false },
  { type: "OVERDUE", label: "Late tasks", description: "Tasks past due date", defaultActive: true },
  { type: "BY_DUE_DATE", label: "By due date", description: "Deadline calendar", defaultActive: false },
  { type: "PRIORITY_BREAKDOWN", label: "By priority", description: "Priority level distribution", defaultActive: false },
  { type: "COMPLETION_BY_GROUP", label: "Completion by group", description: "Progress by task group", defaultActive: false },
  { type: "BUDGET_TOTAL", label: "Total budget", description: "Sum of all task budgets", defaultActive: false },
  { type: "BURNDOWN", label: "Burndown", description: "Completed tasks over time", defaultActive: false },
  { type: "VELOCITY", label: "Velocity", description: "Completed tasks per week", defaultActive: false },
];

export type CreateProjectInput = {
  name: string;
  groupTemplateIds?: string[];
  initialGroupId?: string;
};

export type SpreadsheetFilters = {
  status: string[];
  priority: string[];
  owner: string[];
};

export type SpreadsheetSortColumn = "TITLE" | "STATUS" | "PRIORITY" | "DUE_DATE";
export type SpreadsheetSort = { columnType: SpreadsheetSortColumn; dir: "asc" | "desc" } | null;

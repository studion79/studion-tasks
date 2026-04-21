"use client";

import {
  useState,
  useTransition,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { getUiLocale } from "@/lib/ui-locale";
import { usePathname, useRouter } from "next/navigation";
import type {
  ProjectWithRelations,
  GroupWithTasks,
  TaskWithFields,
  ProjectColumn,
  SpreadsheetFilters,
  SpreadsheetSort,
} from "@/lib/types";
import { COLUMN_WIDTHS, getPriorityOptions, getStatusOptions } from "@/lib/constants";
import { CellRenderer, RecurrenceIcon } from "./cells";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { useProjectContext } from "./ProjectContext";
import {
  createGroup as createGroupAction,
  createGroupWithParent as createGroupWithParentAction,
  updateGroupName as updateGroupNameAction,
  updateGroupColor as updateGroupColorAction,
  createTask as createTaskAction,
  updateTaskTitle as updateTaskTitleAction,
  upsertTaskField,
  deleteTask as deleteTaskAction,
  archiveTask as archiveTaskAction,
  duplicateTask as duplicateTaskAction,
  reorderGroup as reorderGroupAction,
  deleteGroup as deleteGroupAction,
  getArchivedTasks,
  restoreTask as restoreTaskAction,
  moveTask as moveTaskAction,
  bulkUpdateTaskField,
  bulkArchiveTasks,
  bulkDeleteTasks,
  saveGroupAsTemplate as saveGroupAsTemplateAction,
  listGroupTemplates as listGroupTemplatesAction,
  deleteGroupTemplate as deleteGroupTemplateAction,
  importGroupTemplate as importGroupTemplateAction,
  unarchiveTask,
} from "@/lib/actions";
import { toCanonicalStatus } from "@/lib/status";
import { trKey } from "@/lib/i18n/client";
import { useClientLocale } from "@/lib/i18n/useClientLocale";
import { getDisplayColumnLabel } from "@/lib/i18n/columns";
import { composeDateTimeValue } from "@/lib/task-schedule";
import { buildGroupHierarchyMeta, sortGroupsByHierarchy } from "@/lib/group-tree";
import { normalizeTimeInput } from "@/lib/time-input";

const TASK_COL = 360;
const ACTIONS_COL = 48;
const CHECK_COL = 36;
const MIN_NAME_COL = 260;
const MIN_FIELD_COL = 120;
const MAX_COL = 820;
const TASK_INDENT_STEP = 18;
const DRAG_HANDLE_GAP = 12;

function colW(type: string): number {
  return (COLUMN_WIDTHS as Record<string, number>)[type] ?? 130;
}

// --- Title cell (inline edit) ---
function TitleCell({
  task,
  groupColor,
  onSave,
  onDelete,
  onOpen,
  onArchive,
  onDuplicate,
  onComplete,
  completing,
}: {
  task: TaskWithFields;
  groupColor: string;
  onSave: (title: string) => void;
  onDelete: () => void;
  onOpen: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
  onComplete?: () => void;
  completing?: boolean;
}) {
  const locale = useClientLocale(usePathname());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(task.title);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [editing, task.title]);

  const save = () => {
    const t = draft.trim();
    if (t && t !== task.title) onSave(t);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 min-w-0 group/title">
      <div
        className="w-0.5 self-stretch rounded-full flex-shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity"
        style={{ backgroundColor: groupColor }}
      />
      <div
        className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 cursor-pointer transition-all flex items-center justify-center ${completing ? "border-emerald-500 bg-emerald-500" : "border-gray-300 dark:border-gray-600 group-hover/title:border-indigo-400"}`}
        onClick={completing ? undefined : (onComplete ?? onDelete)}
        title={completing ? trKey(locale, "spreadsheet.auto.001") : onComplete ? trKey(locale, "spreadsheet.auto.002") : trKey(locale, "spreadsheet.auto.003")}
      >
        {completing && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M5 13l4 4L19 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="flex-1 min-w-0 bg-white dark:bg-gray-700 border border-indigo-400 rounded px-2 py-0.5 text-sm text-gray-800 dark:text-gray-100 outline-none focus:ring-1 focus:ring-indigo-200"
        />
      ) : (
        <span
          onClick={() => !completing && setEditing(true)}
          className={`flex-1 min-w-0 text-sm cursor-text truncate transition-all ${completing ? "line-through text-emerald-600 dark:text-emerald-400" : "text-gray-800 dark:text-gray-100 hover:text-gray-900 dark:hover:text-white"}`}
        >
          {completing && (
            <svg className="inline w-3.5 h-3.5 mr-1 mb-0.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {task.title}
        </span>
      )}
      <RecurrenceIcon recurrence={task.recurrence ?? null} />
      {/* Hover actions */}
      <div className="opacity-0 group-hover/row:opacity-100 flex items-center gap-0.5 flex-shrink-0 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="p-0.5 rounded text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all cursor-pointer"
          title={trKey(locale, "spreadsheet.auto.004")}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="1.5" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onArchive(); }}
          className="p-0.5 rounded text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition-all cursor-pointer"
          title={trKey(locale, "spreadsheet.auto.005")}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="p-0.5 rounded text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all cursor-pointer"
          title={trKey(locale, "spreadsheet.auto.006")}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// --- Bulk action bar ---
function BulkActionBar({
  selectedCount,
  columns,
  ownerOptions,
  onClear,
  onStatusChange,
  onPriorityChange,
  onOwnerChange,
  onArchive,
  onDelete,
}: {
  selectedCount: number;
  columns: ProjectColumn[];
  ownerOptions?: Array<{ id: string; name: string }>;
  onClear: () => void;
  onStatusChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onOwnerChange: (value: string) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const locale = useClientLocale(usePathname());
  const statusOptions = useMemo(() => getStatusOptions(locale), [locale]);
  const priorityOptions = useMemo(() => getPriorityOptions(locale), [locale]);
  const [openMenu, setOpenMenu] = useState<"status" | "priority" | "owner" | null>(null);
  const statusCol = columns.find((c) => c.type === "STATUS");
  const priorityCol = columns.find((c) => c.type === "PRIORITY");
  const ownerCol = columns.find((c) => c.type === "OWNER");

  return (
    <div className="fixed bottom-3 sm:bottom-6 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 flex items-center gap-1.5 sm:gap-2 bg-gray-900 text-white rounded-xl shadow-2xl px-3 sm:px-4 py-2.5 text-sm border border-gray-700 overflow-x-auto">
      <span className="text-gray-300 text-xs font-medium mr-1 whitespace-nowrap">
        {selectedCount} {trKey(locale, "spreadsheet.auto.007")}{selectedCount > 1 ? "s" : ""}
      </span>

      {statusCol && (
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === "status" ? null : "status")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-xs cursor-pointer"
          >
            {trKey(locale, "spreadsheet.auto.008")}
            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {openMenu === "status" && (
            <div className="absolute bottom-full mb-1.5 left-0 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[140px] z-50">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { onStatusChange(opt.value); setOpenMenu(null); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${opt.color}`}>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {priorityCol && (
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === "priority" ? null : "priority")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-xs cursor-pointer"
          >
            {trKey(locale, "spreadsheet.auto.009")}
            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {openMenu === "priority" && (
            <div className="absolute bottom-full mb-1.5 left-0 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[120px] z-50">
              {priorityOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { onPriorityChange(opt.value); setOpenMenu(null); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${opt.color}`}>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {ownerCol && ownerOptions && ownerOptions.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === "owner" ? null : "owner")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-xs cursor-pointer"
          >
            {trKey(locale, "spreadsheet.auto.010")}
            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {openMenu === "owner" && (
            <div className="absolute bottom-full mb-1.5 left-0 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[140px] z-50">
              {ownerOptions.map((owner) => (
                <button
                  key={owner.id}
                  onClick={() => { onOwnerChange(owner.id); setOpenMenu(null); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  {owner.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="w-px h-4 bg-gray-700 mx-1" />

      <button
        onClick={onArchive}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-amber-700 transition-colors text-xs cursor-pointer"
        title={trKey(locale, "spreadsheet.auto.011")}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {trKey(locale, "spreadsheet.auto.012")}
      </button>

      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-red-700 transition-colors text-xs cursor-pointer"
        title={trKey(locale, "spreadsheet.auto.013")}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {trKey(locale, "spreadsheet.auto.014")}
      </button>

      <div className="w-px h-4 bg-gray-700 mx-1" />

      <button
        onClick={onClear}
        className="p-1 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer"
        title={trKey(locale, "spreadsheet.auto.015")}
      >
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// --- Color palette for group headers ---
const GROUP_COLOR_PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#ec4899", "#f43f5e", "#0ea5e9", "#2dd4bf", "#4ade80",
  "#fbbf24", "#fb923c", "#94a3b8", "#64748b", "#374151", "#1e293b",
];

// --- Group header ---
function GroupHeader({
  group,
  depth,
  taskCount,
  collapsed,
  onToggle,
  onRename,
  onColorChange,
  onAddTask,
  onAddSubgroup,
  onDeleteGroup,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  donePct,
  totalBudget,
  onSaveAsTemplate,
}: {
  group: GroupWithTasks;
  depth: number;
  taskCount: number;
  collapsed: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onColorChange: (color: string) => void;
  onAddTask: () => void;
  onAddSubgroup: () => void;
  onDeleteGroup: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  donePct: number | null;
  totalBudget: number | null;
  onSaveAsTemplate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colorPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setColorPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [colorPickerOpen]);

  useEffect(() => {
    if (editing) {
      setDraft(group.name);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [editing, group.name]);

  const save = () => {
    const t = draft.trim();
    if (t && t !== group.name) onRename(t);
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between py-2 px-4 group/gh">
      <div className="flex items-center gap-2">
        {depth > 0 && <div className="w-px self-stretch bg-gray-200 dark:bg-gray-700 mr-1" />}
        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer flex-shrink-0"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {/* Color picker trigger */}
        <div ref={pickerRef} className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setColorPickerOpen((o) => !o); }}
            title="Changer la couleur du groupe"
            className="w-3 h-3 rounded-full cursor-pointer hover:scale-125 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-400"
            style={{ backgroundColor: group.color }}
          />
          {colorPickerOpen && (
            <div className="absolute left-0 top-5 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-2 grid grid-cols-6 gap-1" style={{ width: 140 }}>
              {GROUP_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={(e) => { e.stopPropagation(); onColorChange(c); setColorPickerOpen(false); }}
                  className="w-4 h-4 rounded-full cursor-pointer hover:scale-125 transition-transform focus:outline-none flex-shrink-0"
                  style={{ backgroundColor: c, boxShadow: group.color === c ? `0 0 0 2px white, 0 0 0 3px ${c}` : undefined }}
                  title={c}
                />
              ))}
            </div>
          )}
        </div>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            className="bg-transparent border-b border-indigo-400 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide outline-none px-0.5"
            style={{ width: `${Math.max(draft.length * 7.5 + 16, 80)}px` }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
          >
            {group.name}
          </button>
        )}
        <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums font-normal">{taskCount}</span>

        {/* Aggregated stats */}
        {donePct !== null && taskCount > 0 && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
            · {donePct}% completed
          </span>
        )}
        {totalBudget !== null && totalBudget > 0 && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
            · €{totalBudget.toLocaleString(getUiLocale())}
          </span>
        )}

        {/* Reorder arrows */}
        <div className="opacity-0 group-hover/gh:opacity-100 flex items-center gap-0.5 transition-opacity ml-1">
          <button
            onClick={onAddSubgroup}
            className="p-0.5 rounded text-gray-400 hover:text-indigo-500 cursor-pointer transition-colors"
            title="Add sub-category"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M4 7h8M8 7v8a2 2 0 002 2h10M16 13v6m-3-3h6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={onDeleteGroup}
            className="p-0.5 rounded text-gray-400 hover:text-red-500 cursor-pointer transition-colors"
            title="Delete category"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 disabled:opacity-25 disabled:cursor-default cursor-pointer transition-colors"
            title="Monter le groupe"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M5 15l7-7 7 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 disabled:opacity-25 disabled:cursor-default cursor-pointer transition-colors"
            title="Descendre le groupe"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={onSaveAsTemplate}
            className="p-0.5 rounded text-gray-400 hover:text-indigo-500 cursor-pointer transition-colors"
            title="Save this group as template"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          </button>
        </div>
      </div>

      <button
        onClick={onAddTask}
        className="opacity-0 group-hover/gh:opacity-100 text-xs text-indigo-500 hover:text-indigo-700 transition-all cursor-pointer flex items-center gap-1 font-medium"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M12 4v16m8-8H4" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Add
      </button>
    </div>
  );
}

// --- Filter / sort helpers ---
const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const STATUS_RANK: Record<string, number> = { NOT_STARTED: 0, WORKING: 1, STUCK: 2, DONE: 3 };

function filterTasks(
  tasks: TaskWithFields[],
  filters: SpreadsheetFilters,
  columns: ProjectColumn[],
  normalizeOwnerValue?: (value: string | null | undefined) => string | null
): TaskWithFields[] {
  const statusCol = columns.find((c) => c.type === "STATUS");
  const priorityCol = columns.find((c) => c.type === "PRIORITY");
  const ownerCol = columns.find((c) => c.type === "OWNER");
  return tasks.filter((task) => {
    if (task.archivedAt) return false;
    if (statusCol) {
      const rawStatus = task.fieldValues.find((f) => f.columnId === statusCol.id)?.value ?? "";
      if (toCanonicalStatus(rawStatus) === "DONE") return false;
    }
    if (filters.status.length > 0 && statusCol) {
      const v = task.fieldValues.find((f) => f.columnId === statusCol.id)?.value ?? "";
      if (!filters.status.includes(v)) return false;
    }
    if (filters.priority.length > 0 && priorityCol) {
      const v = task.fieldValues.find((f) => f.columnId === priorityCol.id)?.value ?? "";
      if (!filters.priority.includes(v)) return false;
    }
    if (filters.owner.length > 0 && ownerCol) {
      const v = task.fieldValues.find((f) => f.columnId === ownerCol.id)?.value ?? "";
      const normalized = normalizeOwnerValue ? normalizeOwnerValue(v) ?? "" : v;
      const matches = filters.owner.some((filterValue) => {
        const normalizedFilter = normalizeOwnerValue ? normalizeOwnerValue(filterValue) ?? filterValue : filterValue;
        return normalizedFilter === normalized || filterValue === v;
      });
      if (!matches) return false;
    }
    return true;
  });
}

function sortTasks(
  tasks: TaskWithFields[],
  sort: SpreadsheetSort,
  columns: ProjectColumn[]
): TaskWithFields[] {
  if (!sort) return tasks;
  const sorted = [...tasks];
  const col =
    sort.columnType !== "TITLE" ? columns.find((c) => c.type === sort.columnType) : null;
  sorted.sort((a, b) => {
    let cmp = 0;
    if (sort.columnType === "TITLE") {
      cmp = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    } else if (sort.columnType === "PRIORITY" && col) {
      const ra = PRIORITY_RANK[a.fieldValues.find((f) => f.columnId === col.id)?.value ?? ""] ?? -1;
      const rb = PRIORITY_RANK[b.fieldValues.find((f) => f.columnId === col.id)?.value ?? ""] ?? -1;
      cmp = ra - rb;
    } else if (sort.columnType === "STATUS" && col) {
      const ra = STATUS_RANK[a.fieldValues.find((f) => f.columnId === col.id)?.value ?? ""] ?? -1;
      const rb = STATUS_RANK[b.fieldValues.find((f) => f.columnId === col.id)?.value ?? ""] ?? -1;
      cmp = ra - rb;
    } else if (col) {
      const va = a.fieldValues.find((f) => f.columnId === col.id)?.value ?? "";
      const vb = b.fieldValues.find((f) => f.columnId === col.id)?.value ?? "";
      cmp = va.localeCompare(vb);
    }
    return sort.dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

function sortByPosition(tasks: TaskWithFields[]): TaskWithFields[] {
  return [...tasks].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });
}

function normalizeGroupTaskTree(group: GroupWithTasks): GroupWithTasks {
  const sourceById = new Map<string, TaskWithFields>();
  const normalizedById = new Map<string, TaskWithFields>();

  const registerTask = (task: TaskWithFields) => {
    sourceById.set(task.id, task);
    if (!normalizedById.has(task.id)) {
      normalizedById.set(task.id, { ...task, subtasks: [] });
    }
    for (const subtask of (task.subtasks ?? []) as TaskWithFields[]) {
      registerTask(subtask);
    }
  };

  for (const task of group.tasks) {
    registerTask(task);
  }

  for (const sourceTask of sourceById.values()) {
    if (!sourceTask.parentId) continue;
    const parent = normalizedById.get(sourceTask.parentId);
    const child = normalizedById.get(sourceTask.id);
    if (!parent || !child || parent.id === child.id) continue;
    parent.subtasks = [...(parent.subtasks ?? []), child];
  }

  const roots: TaskWithFields[] = [];
  const rootSeen = new Set<string>();
  const sortTreeRecursive = (task: TaskWithFields): TaskWithFields => {
    const uniqueChildren = Array.from(
      new Map(((task.subtasks ?? []) as TaskWithFields[]).map((subtask) => [subtask.id, subtask])).values()
    );
    const sortedChildren = sortByPosition(uniqueChildren).map(sortTreeRecursive);
    return { ...task, subtasks: sortedChildren };
  };
  for (const sourceTask of sourceById.values()) {
    if (sourceTask.parentId && normalizedById.has(sourceTask.parentId)) continue;
    const normalized = normalizedById.get(sourceTask.id);
    if (!normalized || rootSeen.has(normalized.id)) continue;
    rootSeen.add(normalized.id);
    roots.push(sortTreeRecursive(normalized));
  }

  return {
    ...group,
    tasks: sortByPosition(roots),
  };
}

function normalizeGroupsTaskTree(groups: GroupWithTasks[]): GroupWithTasks[] {
  return groups.map((group) => normalizeGroupTaskTree(group));
}

function mapTaskTree(
  tasks: TaskWithFields[],
  updater: (task: TaskWithFields) => TaskWithFields
): TaskWithFields[] {
  return tasks.map((task) => {
    const nextSelf = updater(task);
    const currentSubtasks = nextSelf.subtasks ?? [];
    const nextSubtasks = mapTaskTree(currentSubtasks as TaskWithFields[], updater);
    if (nextSubtasks === currentSubtasks) return nextSelf;
    return { ...nextSelf, subtasks: nextSubtasks };
  });
}

function removeTaskFromTree(tasks: TaskWithFields[], taskId: string): TaskWithFields[] {
  const filtered = tasks
    .filter((task) => task.id !== taskId)
    .map((task) => ({
      ...task,
      subtasks: removeTaskFromTree((task.subtasks ?? []) as TaskWithFields[], taskId),
    }));
  return filtered;
}

function findTaskInGroupTasks(tasks: TaskWithFields[], taskId: string): TaskWithFields | null {
  for (const task of tasks) {
    if (task.id === taskId) return task;
    const foundInSubtask = findTaskInGroupTasks((task.subtasks ?? []) as TaskWithFields[], taskId);
    if (foundInSubtask) return foundInSubtask;
  }
  return null;
}

// --- Main ---
export function ProjectSpreadsheet({
  project,
  filters,
  sort,
  visibleColumns,
  search,
  memberNames,
}: {
  project: ProjectWithRelations;
  filters?: SpreadsheetFilters;
  sort?: SpreadsheetSort;
  visibleColumns?: ProjectColumn[];
  search?: string;
  memberNames?: string[];
}) {
  type ArchivedTaskEntry = Awaited<ReturnType<typeof getArchivedTasks>>[number];
  const readOnlyOwner = Boolean((project as ProjectWithRelations & { isPersonal?: boolean }).isPersonal);

  const { allColumns, memberOptions, normalizeOwnerValue, resolveOwnerName } = useProjectContext();
  const columns = visibleColumns ?? project.columns;
  const statusColId = allColumns.find((c) => c.type === "STATUS")?.id ?? null;
  const projectStatusCol = project.columns.find((c) => c.type === "STATUS") ?? null;
  const projectPriorityCol = project.columns.find((c) => c.type === "PRIORITY") ?? null;
  const projectOwnerCol = project.columns.find((c) => c.type === "OWNER") ?? null;
  const projectDueDateCol = project.columns.find((c) => c.type === "DUE_DATE") ?? null;
  const [groups, setGroupsState] = useState<GroupWithTasks[]>(() =>
    normalizeGroupsTaskTree(project.groups)
  );
  const setGroups = useCallback((updater: SetStateAction<GroupWithTasks[]>) => {
    setGroupsState((prev) => {
      const next =
        typeof updater === "function"
          ? (updater as (previousState: GroupWithTasks[]) => GroupWithTasks[])(prev)
          : updater;
      return normalizeGroupsTaskTree(next);
    });
  }, []);
  const orderedGroups = useMemo(() => sortGroupsByHierarchy(groups), [groups]);
  const hierarchyMeta = useMemo(() => buildGroupHierarchyMeta(orderedGroups), [orderedGroups]);
  const groupsById = useMemo(
    () => new Map(orderedGroups.map((group) => [group.id, group])),
    [orderedGroups]
  );

  // Full sync from server after every refresh — keeps temp (in-flight) tasks intact
  useEffect(() => {
    setGroups((prev) =>
      project.groups.map((serverGroup) => {
        const localGroup = prev.find((g) => g.id === serverGroup.id);
        const tempTasks = localGroup ? localGroup.tasks.filter((t) => t.id.startsWith("temp-")) : [];
        return { ...serverGroup, tasks: [...serverGroup.tasks, ...tempTasks] };
      })
    );
  }, [project]);

  const [completingTasks, setCompletingTasks] = useState<Set<string>>(new Set());
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [showArchives, setShowArchives] = useState(false);
  const [archivedTasks, setArchivedTasks] = useState<ArchivedTaskEntry[]>([]);
  const [archivesLoaded, setArchivesLoaded] = useState(false);
  const dragTask = useRef<{ taskId: string; fromGroupId: string } | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null); // "groupId:insertIndex"
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const visibleOrderedGroups = useMemo(() => {
    const isHiddenByAncestor = (group: GroupWithTasks) => {
      let parentId = group.parentId;
      const seen = new Set<string>();
      while (parentId) {
        if (seen.has(parentId)) break;
        seen.add(parentId);
        if (collapsedGroups.has(parentId)) return true;
        parentId = groupsById.get(parentId)?.parentId ?? null;
      }
      return false;
    };
    return orderedGroups.filter((group) => !isHiddenByAncestor(group));
  }, [collapsedGroups, groupsById, orderedGroups]);
  const mobileGroupParentPathById = useMemo(() => {
    const byId = new Map(orderedGroups.map((group) => [group.id, group]));
    const out = new Map<string, string>();
    for (const group of orderedGroups) {
      const chain: string[] = [];
      let cursor = group.parentId ? byId.get(group.parentId) ?? null : null;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        chain.push(cursor.name);
        cursor = cursor.parentId ? byId.get(cursor.parentId) ?? null : null;
      }
      out.set(group.id, chain.reverse().join(" / "));
    }
    return out;
  }, [orderedGroups]);
  const [addingTaskIn, setAddingTaskIn] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskFieldDrafts, setNewTaskFieldDrafts] = useState<Record<string, string>>({});
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [mobileRenamingGroupId, setMobileRenamingGroupId] = useState<string | null>(null);
  const [mobileGroupNameDraft, setMobileGroupNameDraft] = useState("");
  const [mobileMoveTask, setMobileMoveTask] = useState<{ id: string; title: string; fromGroupId: string } | null>(null);
  const [mobileGroupMenuId, setMobileGroupMenuId] = useState<string | null>(null);
  const [mobileGroupMenuPos, setMobileGroupMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mobileExpandedRootGroups, setMobileExpandedRootGroups] = useState<Set<string>>(new Set());
  const [mobileExpandedSubgroups, setMobileExpandedSubgroups] = useState<Set<string>>(new Set());
  const [mobileExpandedTaskSubtasks, setMobileExpandedTaskSubtasks] = useState<Set<string>>(new Set());
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  // Group template state
  const [saveTemplateGroupId, setSaveTemplateGroupId] = useState<string | null>(null);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateError, setSaveTemplateError] = useState("");
  const [importTemplateOpen, setImportTemplateOpen] = useState(false);
  const [groupTemplates, setGroupTemplates] = useState<{ id: string; name: string }[]>([]);
  const [groupPageSizes, setGroupPageSizes] = useState<Record<string, number>>({});
  const GROUP_PAGE_SIZE = 50;
  const [, startTransition] = useTransition();
  const router = useRouter();
  const locale = useClientLocale(usePathname());
  const statusOptions = useMemo(() => getStatusOptions(locale), [locale]);
  const priorityOptions = useMemo(() => getPriorityOptions(locale), [locale]);
  const taskInputRef = useRef<HTMLInputElement>(null);
  const groupInputRef = useRef<HTMLInputElement>(null);
  const mobileGroupMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const mobileGroupMenuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const subgroupFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [newSubgroupId, setNewSubgroupId] = useState<string | null>(null);
  const [newSubgroupHint, setNewSubgroupHint] = useState<string | null>(null);
  const [nameColWidth, setNameColWidth] = useState(TASK_COL);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const spreadsheetWidthsKey = useMemo(() => `spreadsheet-widths:${project.id}`, [project.id]);
  const resizeRef = useRef<{
    kind: "name" | "column";
    columnId?: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const timelineStartKey = useCallback((columnId: string) => `${columnId}__start`, []);
  const timelineStartTimeKey = useCallback((columnId: string) => `${columnId}__start_time`, []);
  const timelineEndKey = useCallback((columnId: string) => `${columnId}__end`, []);
  const timelineEndTimeKey = useCallback((columnId: string) => `${columnId}__end_time`, []);
  const dueTimeKey = useCallback((columnId: string) => `${columnId}__time`, []);
  const setTaskDraftValue = useCallback((key: string, value: string) => {
    setNewTaskFieldDrafts((prev) => ({ ...prev, [key]: value }));
  }, []);
  const resetTaskDraft = useCallback(() => {
    setNewTaskTitle("");
    setNewTaskFieldDrafts({});
    setAddingTaskIn(null);
  }, []);
  const clearSubgroupFeedbackTimeout = useCallback(() => {
    if (subgroupFeedbackTimeoutRef.current) {
      clearTimeout(subgroupFeedbackTimeoutRef.current);
      subgroupFeedbackTimeoutRef.current = null;
    }
  }, []);
  const findVisibleGroupNode = useCallback((groupId: string): HTMLElement | null => {
    const nodes = Array.from(document.querySelectorAll(`[data-group-row-id="${groupId}"]`));
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.offsetParent === null) continue;
      return node;
    }
    return null;
  }, []);
  const isNodeOutsideViewport = useCallback((node: HTMLElement) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom < 0 || rect.top > window.innerHeight;
  }, []);
  const showSubgroupFeedback = useCallback(
    (groupId: string) => {
      setNewSubgroupId(groupId);
      setNewSubgroupHint(groupId);
      clearSubgroupFeedbackTimeout();
      subgroupFeedbackTimeoutRef.current = setTimeout(() => {
        setNewSubgroupId((current) => (current === groupId ? null : current));
        setNewSubgroupHint((current) => (current === groupId ? null : current));
      }, 4500);
    },
    [clearSubgroupFeedbackTimeout]
  );
  const scrollToGroupRow = useCallback((groupId: string) => {
    const node = findVisibleGroupNode(groupId);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    node.classList.add("ring-2", "ring-emerald-300");
    window.setTimeout(() => {
      node.classList.remove("ring-2", "ring-emerald-300");
    }, 1300);
  }, [findVisibleGroupNode]);

  const updateMobileGroupMenuPosition = useCallback((groupId: string) => {
    const trigger = mobileGroupMenuTriggerRefs.current[groupId];
    if (!trigger) {
      setMobileGroupMenuId(null);
      setMobileGroupMenuPos(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(190, viewportWidth - margin * 2);
    const left = Math.min(Math.max(rect.right - width, margin), viewportWidth - width - margin);
    const menuHeight = 210;
    const top = Math.min(rect.bottom + 6, viewportHeight - menuHeight - margin);
    setMobileGroupMenuPos({ top: Math.max(margin, top), left, width });
  }, []);

  useEffect(() => {
    if (!mobileGroupMenuId) return;
    updateMobileGroupMenuPosition(mobileGroupMenuId);

    const onOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      const trigger = mobileGroupMenuTriggerRefs.current[mobileGroupMenuId];
      if (trigger?.contains(target)) return;
      if (mobileGroupMenuPanelRef.current?.contains(target)) return;
      setMobileGroupMenuId(null);
      setMobileGroupMenuPos(null);
    };

    const onReposition = () => updateMobileGroupMenuPosition(mobileGroupMenuId);
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside, { passive: true });
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [mobileGroupMenuId, updateMobileGroupMenuPosition]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(spreadsheetWidthsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { nameColWidth?: number; columnWidths?: Record<string, number> };
      if (typeof parsed.nameColWidth === "number" && Number.isFinite(parsed.nameColWidth)) {
        setNameColWidth(Math.max(MIN_NAME_COL, Math.min(MAX_COL, parsed.nameColWidth)));
      }
      if (parsed.columnWidths && typeof parsed.columnWidths === "object") {
        const next: Record<string, number> = {};
        Object.entries(parsed.columnWidths).forEach(([key, value]) => {
          if (typeof value === "number" && Number.isFinite(value)) {
            next[key] = Math.max(MIN_FIELD_COL, Math.min(MAX_COL, value));
          }
        });
        setColumnWidths(next);
      }
    } catch {
      // ignore invalid local storage payload
    }
  }, [spreadsheetWidthsKey]);

  useEffect(() => {
    return () => clearSubgroupFeedbackTimeout();
  }, [clearSubgroupFeedbackTimeout]);

  useEffect(() => {
    if (!newSubgroupHint) return;
    const raf = window.requestAnimationFrame(() => {
      const node = findVisibleGroupNode(newSubgroupHint);
      if (!node) return;
      if (!isNodeOutsideViewport(node)) {
        setNewSubgroupHint(null);
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [findVisibleGroupNode, isNodeOutsideViewport, newSubgroupHint, groups]);

  useEffect(() => {
    try {
      localStorage.setItem(spreadsheetWidthsKey, JSON.stringify({ nameColWidth, columnWidths }));
    } catch {
      // ignore local storage write errors
    }
  }, [columnWidths, nameColWidth, spreadsheetWidthsKey]);

  const getColumnWidth = useCallback(
    (column: ProjectColumn) => columnWidths[column.id] ?? colW(column.type),
    [columnWidths]
  );

  const startResize = useCallback(
    (kind: "name" | "column", event: React.MouseEvent, columnId?: string) => {
      event.preventDefault();
      event.stopPropagation();
      if (kind === "column" && !columnId) return;
      const currentWidth = kind === "name"
        ? nameColWidth
        : getColumnWidth(columns.find((c) => c.id === columnId)!);
      resizeRef.current = {
        kind,
        columnId,
        startX: event.clientX,
        startWidth: currentWidth,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [columns, getColumnWidth, nameColWidth]
  );

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const active = resizeRef.current;
      if (!active) return;
      const nextWidth = Math.max(
        active.kind === "name" ? MIN_NAME_COL : MIN_FIELD_COL,
        Math.min(MAX_COL, active.startWidth + (event.clientX - active.startX))
      );
      if (active.kind === "name") {
        setNameColWidth(nextWidth);
      } else if (active.columnId) {
        const columnId = active.columnId;
        setColumnWidths((prev) => ({ ...prev, [columnId]: nextWidth }));
      }
    };
    const handleUp = () => {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  useEffect(() => {
    if (addingTaskIn) taskInputRef.current?.focus();
  }, [addingTaskIn]);

  useEffect(() => {
    if (addingGroup) groupInputRef.current?.focus();
  }, [addingGroup]);

  useEffect(() => {
    if (mobileExpandedRootGroups.size > 0) return;
    const firstRoot = visibleOrderedGroups.find((group) => (hierarchyMeta.depthById.get(group.id) ?? 0) === 0);
    if (!firstRoot) return;
    setMobileExpandedRootGroups(new Set([firstRoot.id]));
  }, [hierarchyMeta.depthById, mobileExpandedRootGroups.size, visibleOrderedGroups]);

  const toggleCollapse = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const handleFieldUpdate = useCallback(
    (taskId: string, columnId: string, value: string | null) => {
      // Completion animation: STATUS → DONE triggers strikethrough then archive
      if (statusColId && columnId === statusColId && value === "DONE") {
        setCompletingTasks((prev) => new Set(prev).add(taskId));
        setTimeout(() => {
          setGroups((prev) =>
            prev.map((g) => ({ ...g, tasks: removeTaskFromTree(g.tasks, taskId) }))
          );
          setCompletingTasks((prev) => {
            const s = new Set(prev);
            s.delete(taskId);
            return s;
          });
          startTransition(async () => {
            await upsertTaskField(taskId, columnId, value);
            if (showArchives || archivesLoaded) {
              const tasks = await getArchivedTasks(project.id);
              setArchivedTasks(tasks);
              setArchivesLoaded(true);
            }
            router.refresh();
          });
        }, 1500);
        return;
      }

      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          tasks: mapTaskTree(g.tasks, (t) => {
            if (t.id !== taskId) return t;
            const rest = t.fieldValues.filter((fv) => fv.columnId !== columnId);
            return {
              ...t,
              fieldValues:
                value !== null
                  ? [
                      ...rest,
                      {
                        id: `opt-${columnId}`,
                        taskId,
                        columnId,
                        value,
                        updatedAt: new Date(),
                      },
                    ]
                  : rest,
            };
          }),
        }))
      );

      startTransition(async () => {
        await upsertTaskField(taskId, columnId, value);
        router.refresh();
      });
    },
    [archivesLoaded, project.id, router, showArchives, statusColId]
  );

  const handleTitleUpdate = useCallback((taskId: string, title: string) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        tasks: mapTaskTree(g.tasks, (t) => (t.id === taskId ? { ...t, title } : t)),
      }))
    );
    startTransition(async () => {
      await updateTaskTitleAction(taskId, title);
      router.refresh();
    });
  }, [router]);

  const handleGroupRename = useCallback((groupId: string, name: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name } : g))
    );
    startTransition(async () => {
      await updateGroupNameAction(groupId, name);
    });
  }, []);

  const handleGroupColorChange = useCallback((groupId: string, color: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, color } : g))
    );
    startTransition(async () => {
      await updateGroupColorAction(groupId, color);
      router.refresh();
    });
  }, [router]);

  const handleReorderGroup = useCallback((groupId: string, direction: "up" | "down") => {
    setGroups((prev) => {
      const ordered = sortGroupsByHierarchy(prev);
      const meta = buildGroupHierarchyMeta(ordered);
      const siblingIndex = meta.siblingIndexById.get(groupId);
      const siblingCount = meta.siblingCountById.get(groupId);
      if (typeof siblingIndex !== "number" || typeof siblingCount !== "number") return prev;
      const swapSiblingIdx = direction === "up" ? siblingIndex - 1 : siblingIndex + 1;
      if (swapSiblingIdx < 0 || swapSiblingIdx >= siblingCount) return prev;

      const parentId = prev.find((g) => g.id === groupId)?.parentId ?? null;
      const siblings = meta.siblingsByParent.get(parentId) ?? [];
      const swapId = siblings[swapSiblingIdx];
      if (!swapId) return prev;
      const idx = prev.findIndex((g) => g.id === groupId);
      const swapIdx = prev.findIndex((g) => g.id === swapId);
      if (idx === -1 || swapIdx === -1) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
    startTransition(async () => {
      await reorderGroupAction(groupId, direction);
    });
  }, []);

  const handleDeleteGroup = useCallback((groupId: string) => {
    const ok = window.confirm(
      locale === "fr"
        ? "Supprimer cette catégorie et ses sous-catégories ?"
        : "Delete this category and its sub-categories?"
    );
    if (!ok) return;
    setGroups((prev) => {
      const byId = new Map(prev.map((group) => [group.id, group]));
      const toDelete = new Set<string>([groupId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const group of prev) {
          if (group.parentId && toDelete.has(group.parentId) && !toDelete.has(group.id)) {
            toDelete.add(group.id);
            changed = true;
          }
        }
      }
      const kept = prev.filter((group) => !toDelete.has(group.id));
      // cleanup potential dangling parent refs
      return kept.map((group) => ({
        ...group,
        parentId: group.parentId && byId.has(group.parentId) && !toDelete.has(group.parentId)
          ? group.parentId
          : null,
      }));
    });
    startTransition(async () => {
      await deleteGroupAction(groupId);
      router.refresh();
    });
  }, [locale, router]);

  const handleDeleteTask = useCallback((taskId: string) => {
    if (openTaskId === taskId) setOpenTaskId(null);
    setGroups((prev) =>
      prev.map((g) => ({ ...g, tasks: removeTaskFromTree(g.tasks, taskId) }))
    );
    startTransition(async () => {
      await deleteTaskAction(taskId);
      router.refresh();
    });
  }, [openTaskId]);

  const handleArchiveTask = useCallback((taskId: string) => {
    if (openTaskId === taskId) setOpenTaskId(null);
    setGroups((prev) =>
      prev.map((g) => ({ ...g, tasks: removeTaskFromTree(g.tasks, taskId) }))
    );
    startTransition(async () => {
      await archiveTaskAction(taskId);
      router.refresh();
    });
  }, [openTaskId]);

  const handleDuplicateTask = useCallback((taskId: string) => {
    const sourceGroup = groups.find((g) => Boolean(findTaskInGroupTasks(g.tasks, taskId)));
    const sourceTask = sourceGroup ? findTaskInGroupTasks(sourceGroup.tasks, taskId) : null;
    if (!sourceTask || !sourceGroup) return;
    const tempId = `temp-dup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempTask: TaskWithFields = {
      ...sourceTask,
      id: tempId,
      title: `${sourceTask.title} (copie)`,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      fieldValues: sourceTask.fieldValues.map((fv) => ({ ...fv, id: `opt-dup-${fv.columnId}`, taskId: tempId })),
    };
    setGroups((prev) =>
      prev.map((g) =>
        g.id !== sourceGroup.id
          ? g
          : sourceTask.parentId
            ? {
                ...g,
                tasks: mapTaskTree(g.tasks, (t) =>
                  t.id === sourceTask.parentId
                    ? { ...t, subtasks: [...((t.subtasks ?? []) as TaskWithFields[]), tempTask] }
                    : t
                ),
              }
            : { ...g, tasks: [...g.tasks, tempTask] }
      )
    );
    startTransition(async () => {
      const created = await duplicateTaskAction(taskId);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === sourceGroup.id
            ? {
                ...g,
                tasks: mapTaskTree(g.tasks, (t) =>
                  t.id === tempId ? (created as TaskWithFields) : t
                ),
              }
            : g
        )
      );
      router.refresh();
    });
  }, [groups]);

  const handleBulkStatusChange = useCallback((value: string) => {
    const ids = Array.from(selectedTaskIds);
    const statusCol = project.columns.find((c) => c.type === "STATUS");
    if (!statusCol) return;
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        tasks: mapTaskTree(g.tasks, (t) => {
          if (!ids.includes(t.id)) return t;
          const rest = t.fieldValues.filter((fv) => fv.columnId !== statusCol.id);
          return { ...t, fieldValues: [...rest, { id: `opt-${statusCol.id}`, taskId: t.id, columnId: statusCol.id, value, updatedAt: new Date() }] };
        }),
      }))
    );
    startTransition(async () => { await bulkUpdateTaskField(ids, statusCol.id, value); router.refresh(); });
  }, [selectedTaskIds, project.columns, router]);

  const handleBulkPriorityChange = useCallback((value: string) => {
    const ids = Array.from(selectedTaskIds);
    const priorityCol = project.columns.find((c) => c.type === "PRIORITY");
    if (!priorityCol) return;
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        tasks: mapTaskTree(g.tasks, (t) => {
          if (!ids.includes(t.id)) return t;
          const rest = t.fieldValues.filter((fv) => fv.columnId !== priorityCol.id);
          return { ...t, fieldValues: [...rest, { id: `opt-${priorityCol.id}`, taskId: t.id, columnId: priorityCol.id, value, updatedAt: new Date() }] };
        }),
      }))
    );
    startTransition(async () => { await bulkUpdateTaskField(ids, priorityCol.id, value); router.refresh(); });
  }, [selectedTaskIds, project.columns, router]);

  const handleBulkOwnerChange = useCallback((value: string) => {
    const ids = Array.from(selectedTaskIds);
    const ownerCol = project.columns.find((c) => c.type === "OWNER");
    if (!ownerCol) return;
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        tasks: mapTaskTree(g.tasks, (t) => {
          if (!ids.includes(t.id)) return t;
          const rest = t.fieldValues.filter((fv) => fv.columnId !== ownerCol.id);
          return { ...t, fieldValues: [...rest, { id: `opt-${ownerCol.id}`, taskId: t.id, columnId: ownerCol.id, value, updatedAt: new Date() }] };
        }),
      }))
    );
    startTransition(async () => { await bulkUpdateTaskField(ids, ownerCol.id, value); router.refresh(); });
  }, [selectedTaskIds, project.columns, router]);

  const handleBulkArchive = useCallback(() => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    if (!confirm(`${trKey(locale, "spreadsheet.auto.012")} ${ids.length} ${trKey(locale, "spreadsheet.auto.016")}${ids.length > 1 ? "s" : ""} ?`)) return;
    if (ids.includes(openTaskId ?? "")) setOpenTaskId(null);
    setSelectedTaskIds(new Set());
    setGroups((prev) =>
      prev.map((g) => ({ ...g, tasks: ids.reduce((tasks, id) => removeTaskFromTree(tasks, id), g.tasks) }))
    );
    startTransition(async () => { await bulkArchiveTasks(ids); router.refresh(); });
  }, [selectedTaskIds, openTaskId, router]);

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    if (!confirm(`${trKey(locale, "spreadsheet.auto.017")} ${ids.length} ${trKey(locale, "spreadsheet.auto.016")}${ids.length > 1 ? "s" : ""} ?`)) return;
    if (ids.includes(openTaskId ?? "")) setOpenTaskId(null);
    setSelectedTaskIds(new Set());
    setGroups((prev) =>
      prev.map((g) => ({ ...g, tasks: ids.reduce((tasks, id) => removeTaskFromTree(tasks, id), g.tasks) }))
    );
    startTransition(async () => { await bulkDeleteTasks(ids); router.refresh(); });
  }, [selectedTaskIds, openTaskId, router]);

  const handleToggleArchives = () => {
    const next = !showArchives;
    setShowArchives(next);
    if (next && !archivesLoaded) {
      startTransition(async () => {
        const tasks = await getArchivedTasks(project.id);
        setArchivedTasks(tasks);
        setArchivesLoaded(true);
      });
    }
  };

  const handleRestore = (taskId: string) => {
    setArchivedTasks((prev) => prev.filter((t) => t.id !== taskId));
    startTransition(async () => {
      await restoreTaskAction(taskId);
      router.refresh();
    });
  };

  const handleRestoreTask = (taskId: string) => {
    setArchivedTasks((prev) => prev.filter((t) => t.id !== taskId));
    startTransition(async () => {
      await unarchiveTask(taskId);
      router.refresh();
    });
  };

  const handleDragStart = (taskId: string, fromGroupId: string) => {
    dragTask.current = { taskId, fromGroupId };
  };

  const handleDragEnd = () => {
    dragTask.current = null;
    setDragOverKey(null);
  };

  const handleDropAt = (toGroupId: string, toIndex: number) => {
    setDragOverKey(null);
    const drag = dragTask.current;
    if (!drag) return;
    const { taskId, fromGroupId } = drag;

    // Optimistic update
    setGroups((prev) => {
      const srcGroup = prev.find((g) => g.id === fromGroupId);
      const task = srcGroup?.tasks.find((t) => t.id === taskId);
      if (!task) return prev;
      const withoutTask = prev.map((g) => ({
        ...g,
        tasks: g.tasks.filter((t) => t.id !== taskId),
      }));
      return withoutTask.map((g) => {
        if (g.id !== toGroupId) return g;
        const newTasks = [...g.tasks];
        newTasks.splice(toIndex, 0, { ...task, groupId: toGroupId });
        return { ...g, tasks: newTasks };
      });
    });

    startTransition(async () => {
      await moveTaskAction(taskId, toGroupId, toIndex);
      router.refresh();
    });
  };

  const handleMoveTaskToGroup = useCallback((taskId: string, fromGroupId: string, toGroupId: string) => {
    if (fromGroupId === toGroupId) return;
    setGroups((prev) => {
      const sourceGroup = prev.find((g) => g.id === fromGroupId);
      const task = sourceGroup?.tasks.find((t) => t.id === taskId);
      if (!task) return prev;
      const removed = prev.map((g) => ({
        ...g,
        tasks: g.tasks.filter((t) => t.id !== taskId),
      }));
      return removed.map((g) =>
        g.id === toGroupId
          ? { ...g, tasks: [...g.tasks, { ...task, groupId: toGroupId }] }
          : g
      );
    });
    setMobileMoveTask(null);
    startTransition(async () => {
      const targetGroup = groups.find((g) => g.id === toGroupId);
      const targetIndex = targetGroup?.tasks.filter((t) => !t.archivedAt).length ?? 0;
      await moveTaskAction(taskId, toGroupId, targetIndex);
      router.refresh();
    });
  }, [groups, router]);

  const submitAddTask = (groupId: string, draftOverrides?: Record<string, string>) => {
    const effectiveDrafts = draftOverrides ? { ...newTaskFieldDrafts, ...draftOverrides } : newTaskFieldDrafts;
    const title = newTaskTitle.trim();
    const draftEntries = columns.flatMap((col) => {
      if (col.type === "TIMELINE") {
        const start = (effectiveDrafts[timelineStartKey(col.id)] ?? "").trim();
        const startTime = normalizeTimeInput((effectiveDrafts[timelineStartTimeKey(col.id)] ?? "").trim());
        const end = (effectiveDrafts[timelineEndKey(col.id)] ?? "").trim();
        const endTime = normalizeTimeInput((effectiveDrafts[timelineEndTimeKey(col.id)] ?? "").trim());
        if (!start && !end) return [];
        return [[
          col.id,
          JSON.stringify({
            start: start ? composeDateTimeValue(start, startTime || null) : undefined,
            end: end ? composeDateTimeValue(end, endTime || null) : undefined,
          }),
        ] as const];
      }
      if (col.type === "DUE_DATE") {
        const date = (effectiveDrafts[col.id] ?? "").trim();
        const time = normalizeTimeInput((effectiveDrafts[dueTimeKey(col.id)] ?? "").trim());
        const composed = date ? composeDateTimeValue(date, time || null) : "";
        return composed ? [[col.id, composed] as const] : [];
      }
      const value = (effectiveDrafts[col.id] ?? "").trim();
      return value ? [[col.id, value] as const] : [];
    });
    const fieldDraftByColumnId = Object.fromEntries(draftEntries);
    resetTaskDraft();
    if (!title) return;
    const initialFieldValues: TaskWithFields["fieldValues"] = [];
    Object.entries(fieldDraftByColumnId).forEach(([columnId, value]) => {
      initialFieldValues.push({
        id: `opt-${columnId}`,
        taskId: "temp",
        columnId,
        value,
        updatedAt: new Date(),
      });
    });
    const tempId = `temp-${Date.now()}`;
    const tempTask: TaskWithFields = {
      id: tempId,
      groupId,
      parentId: null,
      title,
      position: 9999,
      archivedAt: null,
      completedAt: null,
      reminderOffsetMinutes: null,
      reminderSentFor: null,
      recurrence: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      fieldValues: initialFieldValues,
    };
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, tasks: [...g.tasks, tempTask] } : g))
    );
    startTransition(async () => {
      const created = await createTaskAction(groupId, title);
      // Set all additional columns entered in quick-create row
      await Promise.all(
        Object.entries(fieldDraftByColumnId).map(([columnId, value]) =>
          upsertTaskField(created.id, columnId, value)
        )
      );
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, tasks: g.tasks.map((t) => (t.id === tempId ? (created as TaskWithFields) : t)) }
            : g
        )
      );
      router.refresh();
    });
  };

  const submitAddGroup = () => {
    const name = newGroupName.trim();
    setNewGroupName("");
    setAddingGroup(false);
    if (!name) return;
    const tempId = `temp-group-${Date.now()}`;
    const tempGroup: GroupWithTasks = {
      id: tempId,
      projectId: project.id,
      parentId: null,
      name,
      color: "#6366f1",
      position: groups.length,
      createdAt: new Date(),
      tasks: [],
    };
    setGroups((prev) => [...prev, tempGroup]);
    startTransition(async () => {
      const created = await createGroupAction(project.id, name);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === tempId ? ({ ...created, tasks: [] } as GroupWithTasks) : g
        )
      );
    });
  };

  const submitAddSubgroup = useCallback(
    (parentGroupId: string) => {
      const baseName = locale === "fr" ? "Sous-catégorie" : "Sub-category";
      const parentGroup = groups.find((g) => g.id === parentGroupId);
      if (!parentGroup) return;
      const siblingCount = groups.filter((g) => (g.parentId ?? null) === parentGroupId).length;
      const tempId = `temp-subgroup-${Date.now()}`;
      const tempGroup: GroupWithTasks = {
        id: tempId,
        projectId: project.id,
        parentId: parentGroupId,
        name: `${baseName} ${siblingCount + 1}`,
        color: parentGroup.color,
        position: siblingCount,
        createdAt: new Date(),
        tasks: [],
      };
      setGroups((prev) => [...prev, tempGroup]);
      setCollapsedGroups((prev) => {
        if (!prev.has(parentGroupId)) return prev;
        const next = new Set(prev);
        next.delete(parentGroupId);
        return next;
      });
      showSubgroupFeedback(tempId);
      startTransition(async () => {
        const created = await createGroupWithParentAction(project.id, tempGroup.name, parentGroupId);
        setGroups((prev) =>
          prev.map((g) =>
            g.id === tempId ? ({ ...created, tasks: created.tasks ?? [] } as GroupWithTasks) : g
          )
        );
        setNewSubgroupId((current) => (current === tempId ? created.id : current));
        setNewSubgroupHint((current) => (current === tempId ? created.id : current));
      });
    },
    [groups, locale, project.id, showSubgroupFeedback]
  );

  const handleSaveGroupAsTemplate = async () => {
    const name = saveTemplateName.trim();
    if (!name) { setSaveTemplateError("Le nom est requis"); return; }
    try {
      await saveGroupAsTemplateAction(saveTemplateGroupId!, name);
      setSaveTemplateGroupId(null);
      setSaveTemplateName("");
      setSaveTemplateError("");
    } catch (e) {
      setSaveTemplateError(e instanceof Error ? e.message : "Erreur");
    }
  };

  const openImportTemplate = async () => {
    const templates = await listGroupTemplatesAction();
    setGroupTemplates(templates);
    setImportTemplateOpen(true);
  };

  const handleImportGroupTemplate = async (templateId: string) => {
    setImportTemplateOpen(false);
    startTransition(async () => {
      const newGroup = await importGroupTemplateAction(project.id, templateId);
      if (newGroup) {
        setGroups((prev) => [...prev, { ...newGroup, tasks: newGroup.tasks ?? [] }]);
      }
      router.refresh();
    });
  };

  const handleDeleteGroupTemplate = async (templateId: string) => {
    await deleteGroupTemplateAction(templateId);
    setGroupTemplates((prev) => prev.filter((t) => t.id !== templateId));
  };

  const totalMinWidth =
    CHECK_COL + nameColWidth + columns.reduce((sum, c) => sum + getColumnWidth(c), 0) + ACTIONS_COL + 48;

  const searchLower = search?.trim().toLowerCase() ?? "";
  const isDoneTask = useCallback(
    (task: TaskWithFields) => {
      if (!statusColId) return false;
      const rawStatus = task.fieldValues.find((f) => f.columnId === statusColId)?.value ?? null;
      return toCanonicalStatus(rawStatus) === "DONE";
    },
    [statusColId]
  );

  const getGroupVisibleTasks = useCallback((group: GroupWithTasks) => {
    const emptyFilters =
      !filters ||
      (filters.status.length === 0 &&
        filters.priority.length === 0 &&
        filters.owner.length === 0);
    let baseTasks = emptyFilters
      ? group.tasks
      : filterTasks(group.tasks, filters!, project.columns, normalizeOwnerValue);
    baseTasks = baseTasks.filter((t) => !t.parentId);
    baseTasks = baseTasks.filter((t) => !t.archivedAt);
    baseTasks = baseTasks.filter((t) => !isDoneTask(t));
    if (searchLower) {
      baseTasks = baseTasks.filter((t) =>
        t.title.toLowerCase().includes(searchLower)
      );
    }
    return sortTasks(baseTasks, sort ?? null, project.columns);
  }, [filters, isDoneTask, project.columns, searchLower, sort]);

  const getVisibleSubtasks = useCallback((task: TaskWithFields, depth = 1): Array<{ task: TaskWithFields; depth: number }> => {
    const source = (task.subtasks ?? []) as TaskWithFields[];
    const emptyFilters =
      !filters ||
      (filters.status.length === 0 &&
        filters.priority.length === 0 &&
        filters.owner.length === 0);
    let baseTasks = emptyFilters
      ? source
      : filterTasks(source, filters!, project.columns, normalizeOwnerValue);
    baseTasks = baseTasks.filter((t) => !t.archivedAt);
    baseTasks = baseTasks.filter((t) => !isDoneTask(t));
    if (searchLower) {
      baseTasks = baseTasks.filter((t) =>
        t.title.toLowerCase().includes(searchLower)
      );
    }
    const sorted = sortTasks(baseTasks, sort ?? null, project.columns);
    const out: Array<{ task: TaskWithFields; depth: number }> = [];
    for (const subtask of sorted) {
      out.push({ task: subtask, depth });
      out.push(...getVisibleSubtasks(subtask, depth + 1));
    }
    return out;
  }, [filters, isDoneTask, normalizeOwnerValue, project.columns, searchLower, sort]);

  const formatDueDate = useCallback((value: string | null | undefined) => {
    if (!value) return null;
    const normalized = value.slice(0, 10);
    const d = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(getUiLocale(), { day: "numeric", month: "short" });
  }, []);
  const isDescendantOfGroup = useCallback(
    (groupId: string, ancestorId: string) => {
      let cursor = groupsById.get(groupId)?.parentId ?? null;
      const seen = new Set<string>();
      while (cursor) {
        if (seen.has(cursor)) break;
        seen.add(cursor);
        if (cursor === ancestorId) return true;
        cursor = groupsById.get(cursor)?.parentId ?? null;
      }
      return false;
    },
    [groupsById]
  );

  // Collect all displayed task IDs across groups for "select all"
  const allDisplayedTaskIds = useMemo(
    () =>
      visibleOrderedGroups.flatMap((group) =>
        getGroupVisibleTasks(group).flatMap((task) => [
          task.id,
          ...getVisibleSubtasks(task).map(({ task: subtask }) => subtask.id),
        ])
      ),
    [visibleOrderedGroups, getGroupVisibleTasks, getVisibleSubtasks]
  );
  const allSelected = allDisplayedTaskIds.length > 0 && allDisplayedTaskIds.every((id) => selectedTaskIds.has(id));
  const someSelected = !allSelected && allDisplayedTaskIds.some((id) => selectedTaskIds.has(id));

  const renderMobileGroupMenu = (group: GroupWithTasks) => (
    mobileGroupMenuId === group.id && mobileGroupMenuPos && createPortal(
      <div
        ref={mobileGroupMenuPanelRef}
        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden"
        style={{
          position: "fixed",
          top: `${mobileGroupMenuPos.top}px`,
          left: `${mobileGroupMenuPos.left}px`,
          width: `${mobileGroupMenuPos.width}px`,
          zIndex: 2147483646,
        }}
      >
        <button
          onClick={() => {
            setMobileGroupMenuId(null);
            setMobileGroupMenuPos(null);
            setNewTaskTitle("");
            setNewTaskFieldDrafts({});
            setAddingTaskIn(group.id);
          }}
          className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/70 cursor-pointer"
        >
          + {trKey(locale, "spreadsheet.auto.018")}
        </button>
        <button
          onClick={() => {
            setMobileGroupMenuId(null);
            setMobileGroupMenuPos(null);
            const typed = window.prompt(
              locale === "fr" ? "Nouveau nom de catégorie" : "New category name",
              group.name
            );
            const next = typed?.trim();
            if (!next || next === group.name) return;
            handleGroupRename(group.id, next);
          }}
          className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/70 cursor-pointer"
        >
          {locale === "fr" ? "Renommer" : "Rename"}
        </button>
        <button
          onClick={() => {
            setMobileGroupMenuId(null);
            setMobileGroupMenuPos(null);
            submitAddSubgroup(group.id);
          }}
          className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/70 cursor-pointer"
        >
          + {locale === "fr" ? "Sous-catégorie" : "Sub-category"}
        </button>
        <button
          onClick={() => {
            setMobileGroupMenuId(null);
            setMobileGroupMenuPos(null);
            handleDeleteGroup(group.id);
          }}
          className="w-full text-left px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
        >
          {locale === "fr" ? "Supprimer" : "Delete"}
        </button>
      </div>,
      document.body
    )
  );

  return (
    <>
    <div className="sm:hidden space-y-2.5 overflow-x-hidden overscroll-y-contain px-0.5 pb-1">
      {visibleOrderedGroups.map((group) => {
        const depth = hierarchyMeta.depthById.get(group.id) ?? 0;
        if (depth > 0) return null;
        const displayTasks = getGroupVisibleTasks(group);
        const pageSize = groupPageSizes[group.id] ?? GROUP_PAGE_SIZE;
        const pagedTasks = displayTasks.slice(0, pageSize);
        const hiddenCount = displayTasks.length - pagedTasks.length;
        const isCollapsed = collapsedGroups.has(group.id);
        const isRootExpanded = mobileExpandedRootGroups.has(group.id);
        const nestedGroups = visibleOrderedGroups.filter(
          (candidate) => candidate.id !== group.id && isDescendantOfGroup(candidate.id, group.id)
        );
        const collapsedPreviewTasks = displayTasks.slice(0, 2);
        return (
          <section
            key={group.id}
            data-group-row-id={group.id}
            className={`mobile-surface-soft transition-all relative overflow-visible rounded-[20px] ${
              newSubgroupId === group.id
                ? "border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-200/70 dark:ring-emerald-900/40"
                : ""
            }`}
          >
            <div className="px-3 py-2.5 border-b border-gray-100/90 dark:border-gray-700/90">
              <div className="flex items-start gap-2">
                <button
                  onClick={() =>
                    setMobileExpandedRootGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })
                  }
                  className="mt-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${isRootExpanded ? "" : "-rotate-90"}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: group.color }} />
                <div className="min-w-0 flex-1">
                  {mobileRenamingGroupId === group.id ? (
                    <input
                      autoFocus
                      value={mobileGroupNameDraft}
                      onChange={(e) => setMobileGroupNameDraft(e.target.value)}
                      onBlur={() => {
                        const next = mobileGroupNameDraft.trim();
                        setMobileRenamingGroupId(null);
                        if (next && next !== group.name) handleGroupRename(group.id, next);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const next = mobileGroupNameDraft.trim();
                          setMobileRenamingGroupId(null);
                          if (next && next !== group.name) handleGroupRename(group.id, next);
                        }
                        if (e.key === "Escape") {
                          setMobileRenamingGroupId(null);
                          setMobileGroupNameDraft("");
                        }
                      }}
                      className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-700 rounded px-1.5 py-0.5 min-w-0 w-full"
                    />
                  ) : (
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 truncate">
                      {group.name}
                    </p>
                  )}
                </div>
                <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums mt-0.5">{displayTasks.length}</span>
                <div className="relative">
                  <button
                    ref={(node) => {
                      mobileGroupMenuTriggerRefs.current[group.id] = node;
                    }}
                    onClick={() =>
                      setMobileGroupMenuId((prev) => {
                        if (prev === group.id) {
                          setMobileGroupMenuPos(null);
                          return null;
                        }
                        updateMobileGroupMenuPosition(group.id);
                        return group.id;
                      })
                    }
                    className="w-7 h-7 rounded-lg border border-gray-200/90 dark:border-gray-600/90 text-gray-500 dark:text-gray-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-600 dark:hover:text-indigo-300 transition-colors cursor-pointer flex items-center justify-center"
                    title={locale === "fr" ? "Actions catégorie" : "Category actions"}
                    data-mobile-group-menu-trigger={group.id}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <circle cx="5" cy="12" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="19" cy="12" r="2" />
                    </svg>
                  </button>
                  {renderMobileGroupMenu(group)}
                </div>
              </div>
            </div>

            {isRootExpanded && !isCollapsed && (
              <div className="p-2.5 space-y-2">
                {addingTaskIn === group.id && (
                  <div className="rounded-xl border border-indigo-200 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/20 p-2 flex items-center gap-2">
                    <input
                      ref={taskInputRef}
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitAddTask(group.id);
                        if (e.key === "Escape") resetTaskDraft();
                      }}
                      placeholder={trKey(locale, "spreadsheet.auto.019")}
                      className="flex-1 text-sm text-gray-800 dark:text-gray-100 border border-indigo-300 dark:border-indigo-700 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-gray-800/80"
                    />
                    <button
                      onClick={() => submitAddTask(group.id)}
                      className="w-8 h-8 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors cursor-pointer flex items-center justify-center"
                      title={trKey(locale, "spreadsheet.auto.020")}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => resetTaskDraft()}
                      className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer flex items-center justify-center"
                      title={trKey(locale, "spreadsheet.auto.021")}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                )}

                {pagedTasks.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                    {trKey(locale, "spreadsheet.auto.022")}
                  </p>
                ) : (
                  pagedTasks.map((task) => {
                    const statusValue = projectStatusCol
                      ? task.fieldValues.find((f) => f.columnId === projectStatusCol.id)?.value ?? ""
                      : "";
                    const priorityValue = projectPriorityCol
                      ? task.fieldValues.find((f) => f.columnId === projectPriorityCol.id)?.value ?? ""
                      : "";
                    const ownerValue = projectOwnerCol
                      ? task.fieldValues.find((f) => f.columnId === projectOwnerCol.id)?.value ?? ""
                      : "";
                    const ownerLabel = resolveOwnerName(ownerValue) ?? ownerValue;
                    const dueValue = projectDueDateCol
                      ? task.fieldValues.find((f) => f.columnId === projectDueDateCol.id)?.value ?? ""
                      : "";
                    const dueLabel = formatDueDate(dueValue);
                    const statusMeta = statusOptions.find((opt) => opt.value === statusValue);
                    const priorityMeta = priorityOptions.find((opt) => opt.value === priorityValue);
                    const selected = selectedTaskIds.has(task.id);
                    const completing = completingTasks.has(task.id);
                    const visibleSubtasks = getVisibleSubtasks(task);
                    const showAllSubtasks = mobileExpandedTaskSubtasks.has(task.id);
                    const displayedSubtasks = showAllSubtasks ? visibleSubtasks : visibleSubtasks.slice(0, 3);
                    return (
                      <article
                        key={task.id}
                        onClick={() => setOpenTaskId(task.id)}
                        className={`rounded-xl border p-3 transition-colors cursor-pointer ${selected ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-900/20" : "border-gray-200/90 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700 bg-white/90 dark:bg-gray-800/95"}`}
                        style={{ marginLeft: `${Math.min(depth, 6) * Math.max(8, TASK_INDENT_STEP - 6)}px` }}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => {
                              setSelectedTaskIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(task.id)) next.delete(task.id);
                                else next.add(task.id);
                                return next;
                              });
                            }}
                            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-500 cursor-pointer accent-indigo-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className={`text-sm font-medium truncate ${completing ? "line-through text-emerald-600 dark:text-emerald-400" : "text-gray-800 dark:text-gray-100"}`}>
                                {task.title}
                              </p>
                              <RecurrenceIcon recurrence={task.recurrence ?? null} />
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {statusMeta && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusMeta.color}`}>
                                  {statusMeta.label}
                                </span>
                              )}
                              {priorityMeta && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${priorityMeta.color}`}>
                                  {priorityMeta.label}
                                </span>
                              )}
                              {ownerLabel && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 max-w-[140px] truncate">
                                  {ownerLabel}
                                </span>
                              )}
                              {dueLabel && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                  {dueLabel}
                                </span>
                              )}
                            </div>
                          </div>
                          {statusColId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!completing) handleFieldUpdate(task.id, statusColId, "DONE");
                              }}
                              title={trKey(locale, "spreadsheet.auto.002")}
                              className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${completing ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-emerald-500 hover:text-emerald-500"}`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMobileMoveTask({ id: task.id, title: task.title, fromGroupId: group.id });
                            }}
                            className="w-7 h-7 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-500 transition-colors cursor-pointer flex items-center justify-center"
                            title={locale === "fr" ? "Déplacer vers…" : "Move to…"}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path d="M12 5v14m0 0l-4-4m4 4l4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                        {displayedSubtasks.length > 0 && (
                          <div className="mt-2.5 border-t border-gray-100 dark:border-gray-700 pt-2 space-y-1.5">
                            {displayedSubtasks.map(({ task: subtask, depth: subDepth }) => {
                              const subtaskCompleting = completingTasks.has(subtask.id);
                              return (
                                <div
                                  key={subtask.id}
                                  className={`flex items-center gap-1.5 transition-all ${subtaskCompleting ? "opacity-50" : ""}`}
                                  style={{ marginLeft: `${Math.min(subDepth, 4) * 12}px` }}
                                >
                                  {statusColId && (
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (!subtaskCompleting) {
                                          handleFieldUpdate(subtask.id, statusColId, "DONE");
                                        }
                                      }}
                                      className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                                        subtaskCompleting
                                          ? "border-emerald-500 bg-emerald-500 text-white"
                                          : "border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-emerald-500 hover:text-emerald-500"
                                      }`}
                                      title={trKey(locale, "spreadsheet.auto.002")}
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenTaskId(subtask.id);
                                    }}
                                    className={`min-w-0 flex-1 text-left text-[11px] cursor-pointer truncate transition-all ${
                                      subtaskCompleting
                                        ? "line-through text-emerald-600 dark:text-emerald-400"
                                        : "text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-300"
                                    }`}
                                  >
                                    {subtaskCompleting ? (
                                      <svg className="inline w-3 h-3 mr-1 mb-0.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    ) : null}
                                    ↳ {subtask.title}
                                  </button>
                                </div>
                              );
                            })}
                            {visibleSubtasks.length > 3 && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setMobileExpandedTaskSubtasks((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(task.id)) next.delete(task.id);
                                    else next.add(task.id);
                                    return next;
                                  });
                                }}
                                className="text-[11px] text-indigo-500 dark:text-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-200 cursor-pointer ml-6"
                              >
                                {showAllSubtasks
                                  ? locale === "fr"
                                    ? "Masquer les sous-tâches"
                                    : "Hide subtasks"
                                  : locale === "fr"
                                    ? `+${visibleSubtasks.length - 3} sous-tâches`
                                    : `+${visibleSubtasks.length - 3} subtasks`}
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })
                )}

                {hiddenCount > 0 && (
                  <button
                    onClick={() => setGroupPageSizes((prev) => ({ ...prev, [group.id]: pageSize + GROUP_PAGE_SIZE }))}
                    className="w-full text-center py-2 text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
                  >
                    {trKey(locale, "spreadsheet.auto.023")} {hiddenCount} {trKey(locale, "spreadsheet.auto.016")}{hiddenCount > 1 ? "s" : ""} {trKey(locale, "spreadsheet.auto.024")}
                  </button>
                )}
                {nestedGroups.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {nestedGroups.map((subgroup) => {
                      const subDepth = hierarchyMeta.depthById.get(subgroup.id) ?? 1;
                      const subDisplayTasks = getGroupVisibleTasks(subgroup);
                      const subPath = mobileGroupParentPathById.get(subgroup.id) ?? "";
                      const subKey = subgroup.id;
                      const subgroupExpanded = mobileExpandedSubgroups.has(subKey);
                      return (
                        <div
                          key={subgroup.id}
                          className="rounded-xl border border-gray-200/80 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-900/35 overflow-hidden"
                          style={{
                            marginLeft: `${Math.min(Math.max(subDepth - 1, 0), 4) * 10}px`,
                            borderLeftWidth: "2px",
                            borderLeftColor: subgroup.color,
                          }}
                        >
                          <div className="px-2.5 py-2 border-b border-gray-200/80 dark:border-gray-700/80 bg-white/40 dark:bg-gray-800/25">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setMobileExpandedSubgroups((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(subKey)) next.delete(subKey);
                                    else next.add(subKey);
                                    return next;
                                  })
                                }
                                className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer"
                              >
                                <svg
                                  className={`w-3 h-3 text-gray-400 transition-transform ${subgroupExpanded ? "" : "-rotate-90"}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: subgroup.color }} />
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 truncate min-w-0">
                                  {subgroup.name}
                                </p>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums ml-auto">{subDisplayTasks.length}</span>
                              </button>
                              <div className="relative">
                                <button
                                  ref={(node) => {
                                    mobileGroupMenuTriggerRefs.current[subgroup.id] = node;
                                  }}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setMobileGroupMenuId((prev) => {
                                      if (prev === subgroup.id) {
                                        setMobileGroupMenuPos(null);
                                        return null;
                                      }
                                      updateMobileGroupMenuPosition(subgroup.id);
                                      return subgroup.id;
                                    });
                                  }}
                                  className="w-7 h-7 rounded-lg border border-gray-200/90 dark:border-gray-600/90 text-gray-500 dark:text-gray-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-600 dark:hover:text-indigo-300 transition-colors cursor-pointer flex items-center justify-center"
                                  title={locale === "fr" ? "Actions catégorie" : "Category actions"}
                                >
                                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                                    <circle cx="5" cy="12" r="2" />
                                    <circle cx="12" cy="12" r="2" />
                                    <circle cx="19" cy="12" r="2" />
                                  </svg>
                                </button>
                                {renderMobileGroupMenu(subgroup)}
                              </div>
                            </div>
                            {subPath && (
                              <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 truncate">
                                {locale === "fr" ? "Sous-catégorie de" : "Sub-category of"} {subPath}
                              </p>
                            )}
                          </div>
                          {subgroupExpanded ? (
                            <div className="p-2 space-y-1.5">
                              {subDisplayTasks.slice(0, 4).map((task) => {
                                const subtaskPreview = getVisibleSubtasks(task).slice(0, 2);
                                return (
                                  <button
                                    key={task.id}
                                    onClick={() => setOpenTaskId(task.id)}
                                    className="w-full text-left rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-2 text-xs text-gray-700 dark:text-gray-200 hover:border-indigo-200 dark:hover:border-indigo-700 transition-colors cursor-pointer"
                                  >
                                    <span className="truncate block">{task.title}</span>
                                    {subtaskPreview.length > 0 && (
                                      <span className="mt-1 block text-[10px] text-gray-500 dark:text-gray-400 truncate">
                                        {subtaskPreview.map(({ task: nested }) => nested.title).join(" • ")}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                              {subDisplayTasks.length > 4 && (
                                <p className="px-1 text-[10px] text-gray-400 dark:text-gray-500">
                                  +{subDisplayTasks.length - 4} {locale === "fr" ? "autres tâches" : "more tasks"}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="p-2">
                              {subDisplayTasks.length === 0 ? (
                                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                  {locale === "fr" ? "Aucune tâche visible" : "No visible tasks"}
                                </p>
                              ) : (
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                                  {subDisplayTasks.slice(0, 2).map((task) => task.title).join(" • ")}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {!isRootExpanded && !isCollapsed && (
              <div className="px-3 pb-3">
                {collapsedPreviewTasks.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {locale === "fr" ? "Aucune tâche visible" : "No visible tasks"}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {collapsedPreviewTasks.map((task) => (
                      <p key={task.id} className="truncate text-xs text-gray-500 dark:text-gray-400">
                        • {task.title}
                      </p>
                    ))}
                    {displayTasks.length > collapsedPreviewTasks.length && (
                      <p className="text-[11px] text-indigo-500 dark:text-indigo-300">
                        +{displayTasks.length - collapsedPreviewTasks.length} {locale === "fr" ? "autres tâches" : "more tasks"}
                      </p>
                    )}
                    {nestedGroups.length > 0 && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">
                        {nestedGroups.length} {locale === "fr" ? "sous-catégorie(s)" : "sub-category(ies)"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      <section className="mobile-surface-soft rounded-[20px] overflow-hidden">
        <button
          onClick={handleToggleArchives}
          className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer w-full text-left"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {showArchives ? trKey(locale, "spreadsheet.auto.025") : trKey(locale, "spreadsheet.auto.026")}
          <svg className={`w-3 h-3 ml-auto transition-transform ${showArchives ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M6 9l6 6 6-6" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        {showArchives && (
          <div className="px-3 pb-3">
            {!archivesLoaded ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">{trKey(locale, "spreadsheet.auto.027")}</p>
            ) : archivedTasks.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">{trKey(locale, "spreadsheet.auto.028")}</p>
            ) : (
              <div className="space-y-1">
                {archivedTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 py-1.5 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: task.group.color }} />
                    <span className="text-gray-500 dark:text-gray-400 flex-1 truncate">{task.title}</span>
                    <button
                      onClick={() => handleRestoreTask(task.id)}
                      className="p-1 rounded text-gray-400 hover:text-emerald-500 transition-colors cursor-pointer"
                      title={trKey(locale, "spreadsheet.auto.029")}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mobile-surface-soft rounded-[20px] border-dashed p-3">
        {addingGroup ? (
          <div className="flex items-center gap-2">
            <input
              ref={groupInputRef}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitAddGroup();
                if (e.key === "Escape") setAddingGroup(false);
              }}
              onBlur={submitAddGroup}
              placeholder={trKey(locale, "spreadsheet.auto.030")}
              className="flex-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 outline-none bg-white dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        ) : (
          <button
            onClick={() => {
              setNewGroupName("");
              setAddingGroup(true);
            }}
            className="w-full text-left text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors cursor-pointer"
          >
            + {trKey(locale, "spreadsheet.auto.031")}
          </button>
        )}
      </section>
    </div>

    {mobileMoveTask && (
      <div className="sm:hidden fixed inset-0 z-[95]">
        <div className="absolute inset-0 bg-black/30" onClick={() => setMobileMoveTask(null)} />
        <div className="absolute left-0 right-0 bottom-0 rounded-t-2xl bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 max-h-[72vh] overflow-y-auto">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {locale === "fr" ? "Déplacer la tâche" : "Move task"}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{mobileMoveTask.title}</p>
          <div className="mt-3 space-y-1.5">
            {orderedGroups
              .filter((candidate) => candidate.id !== mobileMoveTask.fromGroupId)
              .map((candidate) => {
                const candidateDepth = hierarchyMeta.depthById.get(candidate.id) ?? 0;
                return (
                  <button
                    key={candidate.id}
                    onClick={() => handleMoveTaskToGroup(mobileMoveTask.id, mobileMoveTask.fromGroupId, candidate.id)}
                    className="w-full text-left flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer"
                    style={{ paddingLeft: `${10 + Math.min(candidateDepth, 6) * 12}px` }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: candidate.color }} />
                    <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{candidate.name}</span>
                  </button>
                );
              })}
          </div>
          <button
            onClick={() => setMobileMoveTask(null)}
            className="mt-4 w-full rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            {trKey(locale, "common.cancel")}
          </button>
        </div>
      </div>
    )}

    <div className="hidden sm:block overflow-x-auto">
      <div style={{ minWidth: totalMinWidth }}>
        {/* ── Column headers ── */}
        <div className="flex items-center bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
          {/* Select-all checkbox */}
          <div
            style={{ width: CHECK_COL, minWidth: CHECK_COL }}
            className="flex items-center justify-center py-2.5"
          >
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected; }}
              onChange={() => {
                if (allSelected) {
                  setSelectedTaskIds((prev) => {
                    const next = new Set(prev);
                    allDisplayedTaskIds.forEach((id) => next.delete(id));
                    return next;
                  });
                } else {
                  setSelectedTaskIds((prev) => {
                    const next = new Set(prev);
                    allDisplayedTaskIds.forEach((id) => next.add(id));
                    return next;
                  });
                }
              }}
              className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-500 cursor-pointer accent-indigo-500"
            />
          </div>
          <div
            style={{ width: nameColWidth, minWidth: nameColWidth }}
            className="relative group/resize px-4 py-2.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
          >
            {trKey(locale, "spreadsheet.auto.018")}
            <div
              onMouseDown={(e) => startResize("name", e)}
              className="absolute right-0 top-0 h-full w-2 cursor-col-resize opacity-0 group-hover/resize:opacity-100 hover:opacity-100"
            >
              <div className="mx-auto h-full w-px bg-indigo-200 dark:bg-indigo-700" />
            </div>
          </div>
          {columns.map((col) => (
            <div
              key={col.id}
              style={{ width: getColumnWidth(col), minWidth: getColumnWidth(col) }}
              className="relative group/resize px-3 py-2.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
            >
              {getDisplayColumnLabel(col, locale)}
              <div
                onMouseDown={(e) => startResize("column", e, col.id)}
                className="absolute right-0 top-0 h-full w-2 cursor-col-resize opacity-0 group-hover/resize:opacity-100 hover:opacity-100"
              >
                <div className="mx-auto h-full w-px bg-indigo-200 dark:bg-indigo-700" />
              </div>
            </div>
          ))}
          <div style={{ width: ACTIONS_COL }} />
        </div>

        {/* ── Groups ── */}
        {visibleOrderedGroups.map((group) => {
          const depth = hierarchyMeta.depthById.get(group.id) ?? 0;
          const displayTasks = getGroupVisibleTasks(group);
          const pageSize = groupPageSizes[group.id] ?? GROUP_PAGE_SIZE;
          const pagedTasks = displayTasks.slice(0, pageSize);
          const hiddenCount = displayTasks.length - pagedTasks.length;
          const isCollapsed = collapsedGroups.has(group.id);

          // Aggregated stats
          const statusCol = project.columns.find((c) => c.type === "STATUS");
          const budgetCol = project.columns.find((c) => c.type === "BUDGET");
          const doneCount = statusCol
            ? group.tasks.filter(
                (t) => t.fieldValues.find((f) => f.columnId === statusCol.id)?.value === "DONE"
              ).length
            : 0;
          const donePct =
            statusCol && group.tasks.length > 0
              ? Math.round((doneCount / group.tasks.length) * 100)
              : null;
          const totalBudget = budgetCol
            ? group.tasks.reduce((sum, t) => {
                const v = t.fieldValues.find((f) => f.columnId === budgetCol.id)?.value;
                return sum + (v ? parseFloat(v) || 0 : 0);
              }, 0)
            : null;

          return (
            <div
              key={group.id}
              data-group-row-id={group.id}
              className={`border-b transition-all ${
                newSubgroupId === group.id
                  ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-900/10"
                  : "border-gray-100 dark:border-gray-700"
              }`}
            >
              <div style={{ paddingLeft: `${Math.min(depth, 6) * 14}px` }}>
              <GroupHeader
                group={group}
                depth={depth}
                taskCount={displayTasks.length}
                collapsed={isCollapsed}
                onToggle={() => toggleCollapse(group.id)}
                onRename={(name) => handleGroupRename(group.id, name)}
                onColorChange={(color) => handleGroupColorChange(group.id, color)}
                onAddTask={() => {
                  setNewTaskTitle("");
                  setNewTaskFieldDrafts({});
                  setAddingTaskIn(group.id);
                }}
                onAddSubgroup={() => submitAddSubgroup(group.id)}
                onDeleteGroup={() => handleDeleteGroup(group.id)}
                onMoveUp={() => handleReorderGroup(group.id, "up")}
                onMoveDown={() => handleReorderGroup(group.id, "down")}
                canMoveUp={(hierarchyMeta.siblingIndexById.get(group.id) ?? 0) > 0}
                canMoveDown={
                  (hierarchyMeta.siblingIndexById.get(group.id) ?? 0) <
                  (hierarchyMeta.siblingCountById.get(group.id) ?? 1) - 1
                }
                donePct={donePct}
                totalBudget={totalBudget}
                onSaveAsTemplate={() => {
                  setSaveTemplateName(group.name);
                  setSaveTemplateError("");
                  setSaveTemplateGroupId(group.id);
                }}
              />
              </div>

              {!isCollapsed && (
                <>
                  {pagedTasks.map((task, taskIdx) => {
                    const visibleSubtasks = getVisibleSubtasks(task);
                    const dropKey = `${group.id}:${taskIdx}`;
                    const isDropTarget = dragOverKey === dropKey;
                    return (
                    <div key={task.id}>
                      {/* Drop zone above this task */}
                      <div
                        className={`h-2 transition-all ${isDropTarget ? "h-3 bg-indigo-400/90 mx-3 rounded-full" : "bg-transparent"}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOverKey(dropKey); }}
                        onDragLeave={() => setDragOverKey(null)}
                        onDrop={() => handleDropAt(group.id, taskIdx)}
                      />
                    <div
                      className={`flex items-center border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50/60 dark:hover:bg-gray-700/40 transition-all group/row ${selectedTaskIds.has(task.id) ? "bg-indigo-50/40 dark:bg-indigo-900/20" : ""} ${completingTasks.has(task.id) ? "opacity-50 bg-emerald-50/60 dark:bg-emerald-900/10" : ""}`}
                      draggable
                      onDragStart={() => handleDragStart(task.id, group.id)}
                      onDragEnd={handleDragEnd}
                    >
                      {/* Checkbox */}
                      <div
                        style={{
                          width: CHECK_COL,
                          minWidth: CHECK_COL,
                          paddingLeft: `${Math.min(depth, 6) * TASK_INDENT_STEP}px`,
                        }}
                        className="flex items-center justify-center flex-shrink-0"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.has(task.id)}
                          onChange={() => {
                            setSelectedTaskIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(task.id)) next.delete(task.id);
                              else next.add(task.id);
                              return next;
                            });
                          }}
                          className={`w-3.5 h-3.5 rounded border-gray-300 text-indigo-500 cursor-pointer accent-indigo-500 transition-opacity ${selectedTaskIds.has(task.id) ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"}`}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      {/* Drag handle */}
                      <div className="opacity-0 group-hover/row:opacity-100 pl-0 pr-0 flex-shrink-0 cursor-grab active:cursor-grabbing transition-opacity">
                        <svg className="w-3 h-3 text-gray-300 dark:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
                          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                          <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
                        </svg>
                      </div>
                      <div
                        style={{
                          width: nameColWidth,
                          minWidth: nameColWidth,
                          paddingLeft: `${8 + Math.min(depth, 6) * TASK_INDENT_STEP}px`,
                        }}
                        className="py-2.5 pr-2"
                      >
                        <TitleCell
                          task={task}
                          groupColor={group.color}
                          onSave={(title) => handleTitleUpdate(task.id, title)}
                          onDelete={() => handleDeleteTask(task.id)}
                          onOpen={() => setOpenTaskId(task.id)}
                          onArchive={() => handleArchiveTask(task.id)}
                          onDuplicate={() => handleDuplicateTask(task.id)}
                          onComplete={statusColId ? () => handleFieldUpdate(task.id, statusColId, "DONE") : undefined}
                          completing={completingTasks.has(task.id)}
                        />
                      </div>
                      {columns.map((col) => (
                        <div
                          key={col.id}
                          style={{ width: getColumnWidth(col), minWidth: getColumnWidth(col) }}
                          className="px-2 py-1.5"
                        >
                          <CellRenderer
                            column={col}
                            task={{ id: task.id, reminderOffsetMinutes: task.reminderOffsetMinutes ?? null }}
                            fieldValues={task.fieldValues}
                            onSave={(columnId, value) =>
                              handleFieldUpdate(task.id, columnId, value)
                            }
                            memberNames={memberNames}
                            readOnlyOwner={readOnlyOwner}
                          />
                        </div>
                      ))}
                      <div style={{ width: ACTIONS_COL }} />
                    </div>
                    {visibleSubtasks.map(({ task: subtask, depth: subtaskDepth }) => (
                      <div
                        key={subtask.id}
                        className={`flex items-center border-t border-gray-100/80 dark:border-gray-700/40 bg-gray-50/35 dark:bg-gray-800/20 hover:bg-gray-50/70 dark:hover:bg-gray-700/35 transition-all group/row ${selectedTaskIds.has(subtask.id) ? "bg-indigo-50/40 dark:bg-indigo-900/20" : ""} ${completingTasks.has(subtask.id) ? "opacity-50 bg-emerald-50/60 dark:bg-emerald-900/10" : ""}`}
                      >
                        <div
                          style={{
                            width: CHECK_COL,
                            minWidth: CHECK_COL,
                            paddingLeft: `${Math.min(depth, 6) * TASK_INDENT_STEP + 18 + subtaskDepth * TASK_INDENT_STEP}px`,
                          }}
                          className="flex items-center justify-center flex-shrink-0"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.has(subtask.id)}
                            onChange={() => {
                              setSelectedTaskIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(subtask.id)) next.delete(subtask.id);
                                else next.add(subtask.id);
                                return next;
                              });
                            }}
                            className={`w-3.5 h-3.5 rounded border-gray-300 text-indigo-500 cursor-pointer accent-indigo-500 transition-opacity ${selectedTaskIds.has(subtask.id) ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"}`}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="pl-0 pr-0 flex-shrink-0 opacity-0">
                          <svg className="w-3 h-3 text-gray-300 dark:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
                            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                            <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
                          </svg>
                        </div>
                        <div
                          style={{
                            width: nameColWidth,
                            minWidth: nameColWidth,
                            paddingLeft: `${8 + Math.min(depth, 6) * TASK_INDENT_STEP + 18 + subtaskDepth * TASK_INDENT_STEP}px`,
                          }}
                          className="py-2.5 pr-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">↳</span>
                            <TitleCell
                              task={subtask}
                              groupColor={group.color}
                              onSave={(title) => handleTitleUpdate(subtask.id, title)}
                              onDelete={() => handleDeleteTask(subtask.id)}
                              onOpen={() => setOpenTaskId(subtask.id)}
                              onArchive={() => handleArchiveTask(subtask.id)}
                              onDuplicate={() => handleDuplicateTask(subtask.id)}
                              onComplete={statusColId ? () => handleFieldUpdate(subtask.id, statusColId, "DONE") : undefined}
                              completing={completingTasks.has(subtask.id)}
                            />
                          </div>
                        </div>
                        {columns.map((col) => (
                          <div
                            key={col.id}
                            style={{ width: getColumnWidth(col), minWidth: getColumnWidth(col) }}
                            className="px-2 py-1.5"
                          >
                            <CellRenderer
                              column={col}
                              task={{ id: subtask.id, reminderOffsetMinutes: subtask.reminderOffsetMinutes ?? null }}
                              fieldValues={subtask.fieldValues}
                              onSave={(columnId, value) =>
                                handleFieldUpdate(subtask.id, columnId, value)
                              }
                              memberNames={memberNames}
                              readOnlyOwner={readOnlyOwner}
                            />
                          </div>
                        ))}
                        <div style={{ width: ACTIONS_COL }} />
                      </div>
                    ))}
                    </div>
                    );
                  })}

                  {/* Final drop zone at end of group */}
                  {(() => {
                    const endKey = `${group.id}:${pagedTasks.length}`;
                    return (
                      <div
                        className={`h-2 transition-all ${dragOverKey === endKey ? "h-3 bg-indigo-400/90 mx-3 rounded-full" : "bg-transparent"}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOverKey(endKey); }}
                        onDragLeave={() => setDragOverKey(null)}
                        onDrop={() => handleDropAt(group.id, pagedTasks.length)}
                      />
                    );
                  })()}

                  {/* Load more */}
                  {hiddenCount > 0 && (
                    <button
                      onClick={() => setGroupPageSizes((prev) => ({ ...prev, [group.id]: pageSize + GROUP_PAGE_SIZE }))}
                      className="w-full text-left px-4 py-2 text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer border-t border-gray-100 dark:border-gray-700"
                    >
                      {trKey(locale, "spreadsheet.auto.023")} {hiddenCount} {trKey(locale, "spreadsheet.auto.016")}{hiddenCount > 1 ? "s" : ""} {trKey(locale, "spreadsheet.auto.024")}
                    </button>
                  )}

                  {/* Add task row */}
                  {addingTaskIn === group.id ? (
                    <div className="flex items-center border-t border-gray-100 dark:border-gray-700 bg-indigo-50/20 dark:bg-indigo-900/10">
                      <div
                        style={{
                          width: CHECK_COL,
                          minWidth: CHECK_COL,
                          paddingLeft: `${Math.min(depth, 6) * TASK_INDENT_STEP}px`,
                        }}
                      />
                      <div
                        style={{
                          width: nameColWidth,
                          minWidth: nameColWidth,
                          paddingLeft: `${8 + Math.min(depth, 6) * TASK_INDENT_STEP}px`,
                        }}
                        className="py-2.5 pr-2"
                      >
                        <input
                          ref={taskInputRef}
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitAddTask(group.id);
                            if (e.key === "Escape") resetTaskDraft();
                          }}
                          placeholder={trKey(locale, "spreadsheet.auto.019")}
                          className="w-full text-sm text-gray-800 dark:text-gray-100 border border-indigo-300 dark:border-indigo-700 rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-gray-800/80"
                        />
                      </div>
                      {columns.map((col) => (
                        <div key={col.id} style={{ width: getColumnWidth(col), minWidth: getColumnWidth(col) }} className="px-2 py-2.5">
                          {col.type === "STATUS" ? (
                            <select
                              value={newTaskFieldDrafts[col.id] ?? ""}
                              onChange={(e) => setTaskDraftValue(col.id, e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") submitAddTask(group.id); if (e.key === "Escape") resetTaskDraft(); }}
                              className="w-full select-unified select-unified-sm"
                            >
                              <option value="">Statut…</option>
                              {statusOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                          ) : col.type === "PRIORITY" ? (
                            <select
                              value={newTaskFieldDrafts[col.id] ?? ""}
                              onChange={(e) => setTaskDraftValue(col.id, e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") submitAddTask(group.id); if (e.key === "Escape") resetTaskDraft(); }}
                              className="w-full select-unified select-unified-sm"
                            >
                              <option value="">{trKey(locale, "spreadsheet.auto.032")}</option>
                              {priorityOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                          ) : col.type === "OWNER" ? (
                            memberOptions.length > 0 ? (
                              <select
                                value={newTaskFieldDrafts[col.id] ?? ""}
                                onChange={(e) => setTaskDraftValue(col.id, e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") submitAddTask(group.id); if (e.key === "Escape") resetTaskDraft(); }}
                                className="w-full select-unified select-unified-sm"
                              >
                                <option value="">{trKey(locale, "spreadsheet.auto.033")}</option>
                                {memberOptions.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                              </select>
                            ) : (
                              <input
                                value={newTaskFieldDrafts[col.id] ?? ""}
                                onChange={(e) => setTaskDraftValue(col.id, e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") submitAddTask(group.id); if (e.key === "Escape") resetTaskDraft(); }}
                                placeholder={trKey(locale, "spreadsheet.auto.033")}
                                className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 outline-none bg-white dark:bg-gray-800 dark:text-gray-100"
                              />
                            )
                          ) : col.type === "DUE_DATE" ? (
                            <div className="grid grid-cols-2 gap-1">
                              <input
                                type="date"
                                value={newTaskFieldDrafts[col.id] ?? ""}
                                onChange={(e) => setTaskDraftValue(col.id, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    submitAddTask(group.id, { [col.id]: (e.currentTarget as HTMLInputElement).value });
                                  }
                                  if (e.key === "Escape") resetTaskDraft();
                                }}
                                className="w-full datetime-field"
                              />
                              <input
                                type="time"
                                value={newTaskFieldDrafts[dueTimeKey(col.id)] ?? ""}
                                onChange={(e) => setTaskDraftValue(dueTimeKey(col.id), e.target.value)}
                                onFocus={() => {
                                  const key = dueTimeKey(col.id);
                                  if (!(newTaskFieldDrafts[key] ?? "").trim()) setTaskDraftValue(key, "00:00");
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const key = dueTimeKey(col.id);
                                    const normalized = normalizeTimeInput((e.currentTarget as HTMLInputElement).value, newTaskFieldDrafts[key] ?? "");
                                    submitAddTask(group.id, { [key]: normalized });
                                  }
                                  if (e.key === "Escape") resetTaskDraft();
                                }}
                                className="w-full datetime-field"
                              />
                            </div>
                          ) : col.type === "TIMELINE" ? (
                            <div className="grid grid-cols-2 gap-1">
                              <input
                                type="date"
                                value={newTaskFieldDrafts[timelineStartKey(col.id)] ?? ""}
                                onChange={(e) => setTaskDraftValue(timelineStartKey(col.id), e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const key = timelineStartKey(col.id);
                                    submitAddTask(group.id, { [key]: (e.currentTarget as HTMLInputElement).value });
                                  }
                                  if (e.key === "Escape") resetTaskDraft();
                                }}
                                className="w-full datetime-field"
                              />
                              <input
                                type="time"
                                value={newTaskFieldDrafts[timelineStartTimeKey(col.id)] ?? ""}
                                onChange={(e) => setTaskDraftValue(timelineStartTimeKey(col.id), e.target.value)}
                                onFocus={() => {
                                  const key = timelineStartTimeKey(col.id);
                                  if (!(newTaskFieldDrafts[key] ?? "").trim()) setTaskDraftValue(key, "00:00");
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const key = timelineStartTimeKey(col.id);
                                    const normalized = normalizeTimeInput((e.currentTarget as HTMLInputElement).value, newTaskFieldDrafts[key] ?? "");
                                    submitAddTask(group.id, { [key]: normalized });
                                  }
                                  if (e.key === "Escape") resetTaskDraft();
                                }}
                                className="w-full datetime-field"
                              />
                              <input
                                type="date"
                                value={newTaskFieldDrafts[timelineEndKey(col.id)] ?? ""}
                                onChange={(e) => setTaskDraftValue(timelineEndKey(col.id), e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const key = timelineEndKey(col.id);
                                    submitAddTask(group.id, { [key]: (e.currentTarget as HTMLInputElement).value });
                                  }
                                  if (e.key === "Escape") resetTaskDraft();
                                }}
                                className="w-full datetime-field"
                              />
                              <input
                                type="time"
                                value={newTaskFieldDrafts[timelineEndTimeKey(col.id)] ?? ""}
                                onChange={(e) => setTaskDraftValue(timelineEndTimeKey(col.id), e.target.value)}
                                onFocus={() => {
                                  const key = timelineEndTimeKey(col.id);
                                  if (!(newTaskFieldDrafts[key] ?? "").trim()) setTaskDraftValue(key, "00:00");
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const key = timelineEndTimeKey(col.id);
                                    const normalized = normalizeTimeInput((e.currentTarget as HTMLInputElement).value, newTaskFieldDrafts[key] ?? "");
                                    submitAddTask(group.id, { [key]: normalized });
                                  }
                                  if (e.key === "Escape") resetTaskDraft();
                                }}
                                className="w-full datetime-field"
                              />
                            </div>
                          ) : (
                            <input
                              value={newTaskFieldDrafts[col.id] ?? ""}
                              onChange={(e) => setTaskDraftValue(col.id, e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") submitAddTask(group.id); if (e.key === "Escape") resetTaskDraft(); }}
                              placeholder={`${getDisplayColumnLabel(col, locale)}…`}
                              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 outline-none bg-white dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400"
                            />
                          )}
                        </div>
                      ))}
                      <div style={{ width: ACTIONS_COL, minWidth: ACTIONS_COL }} className="px-1 py-2.5 flex items-center justify-center gap-1">
                        <button
                          onClick={() => submitAddTask(group.id)}
                          title="Valider"
                          className="w-6 h-6 rounded-md bg-indigo-500 text-white hover:bg-indigo-600 transition-colors cursor-pointer flex items-center justify-center"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M5 13l4 4L19 7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          onClick={() => resetTaskDraft()}
                          title="Annuler"
                          className="w-6 h-6 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer flex items-center justify-center"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-gray-100 dark:border-gray-700 py-1.5">
                      <div className="flex items-center">
                        <div
                          style={{
                            width: CHECK_COL,
                            minWidth: CHECK_COL,
                            paddingLeft: `${Math.min(depth, 6) * TASK_INDENT_STEP}px`,
                          }}
                        />
                        <div style={{ width: DRAG_HANDLE_GAP, minWidth: DRAG_HANDLE_GAP }} />
                        <div
                          style={{
                            width: nameColWidth,
                            minWidth: nameColWidth,
                            paddingLeft: `${8 + Math.min(depth, 6) * TASK_INDENT_STEP}px`,
                          }}
                          className="pr-2"
                        >
                          <button
                            onClick={() => {
                              setNewTaskTitle("");
                              setNewTaskFieldDrafts({});
                              setAddingTaskIn(group.id);
                            }}
                            className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                          >
                            <span className="w-4 h-4 flex items-center justify-center rounded border border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-400">
                              +
                            </span>
                            {trKey(locale, "spreadsheet.auto.034")}
                          </button>
                        </div>
                        {columns.map((col) => (
                          <div key={col.id} style={{ width: getColumnWidth(col), minWidth: getColumnWidth(col) }} />
                        ))}
                        <div style={{ width: ACTIONS_COL, minWidth: ACTIONS_COL }} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* ── Archives ── */}
        <div className="border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={handleToggleArchives}
            className="flex items-center gap-2 px-4 py-3 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer w-full text-left"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {showArchives ? trKey(locale, "spreadsheet.auto.025") : trKey(locale, "spreadsheet.auto.026")}
            <svg
              className={`w-3 h-3 ml-auto transition-transform ${showArchives ? "rotate-180" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path d="M6 9l6 6 6-6" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {showArchives && (
            <div className="px-4 pb-4">
              {!archivesLoaded ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">{trKey(locale, "spreadsheet.auto.027")}</p>
              ) : archivedTasks.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">{trKey(locale, "spreadsheet.auto.028")}</p>
              ) : (
                <div className="space-y-1">
                  {archivedTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2.5 py-1.5 text-xs group/arch group/archrow">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: task.group.color }} />
                      <span className="text-gray-400 dark:text-gray-500 flex-1 truncate">{task.title}</span>
                      <span className="text-gray-300 dark:text-gray-600 text-[10px]">{task.group.name}</span>
                      <button
                        onClick={() => handleRestoreTask(task.id)}
                        className="opacity-0 group-hover/archrow:opacity-100 p-0.5 text-gray-300 hover:text-emerald-500 transition-all cursor-pointer"
                        title={trKey(locale, "spreadsheet.auto.029")}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Add group ── */}
        <div className="px-4 py-3 flex items-center gap-3">
          {addingGroup ? (
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 flex-shrink-0" />
              <input
                ref={groupInputRef}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitAddGroup();
                  if (e.key === "Escape") setAddingGroup(false);
                }}
                onBlur={submitAddGroup}
                placeholder={trKey(locale, "spreadsheet.auto.030")}
                className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 outline-none bg-transparent placeholder-gray-400 dark:placeholder-gray-600 border-b border-indigo-400 px-0.5"
              />
            </div>
          ) : (
            <>
              <button
                onClick={() => {
                  setNewGroupName("");
                  setAddingGroup(true);
                }}
                className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors cursor-pointer"
              >
                <span className="w-4 h-4 flex items-center justify-center rounded border border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-400">
                  +
                </span>
                {trKey(locale, "spreadsheet.auto.031")}
              </button>
              <button
                onClick={openImportTemplate}
                className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                title={trKey(locale, "spreadsheet.auto.035")}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {trKey(locale, "spreadsheet.auto.036")}
              </button>
            </>
          )}
        </div>

        {/* ── Save group as template modal ── */}
        {saveTemplateGroupId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">{trKey(locale, "spreadsheet.auto.037")}</h3>
              <input
                autoFocus
                value={saveTemplateName}
                onChange={(e) => { setSaveTemplateName(e.target.value); setSaveTemplateError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveGroupAsTemplate(); if (e.key === "Escape") setSaveTemplateGroupId(null); }}
                placeholder={trKey(locale, "spreadsheet.auto.038")}
                className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400"
              />
              {saveTemplateError && <p className="text-xs text-red-500 mt-1">{saveTemplateError}</p>}
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setSaveTemplateGroupId(null)} className="px-3 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors">{trKey(locale, "spreadsheet.auto.021")}</button>
                <button onClick={handleSaveGroupAsTemplate} className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer transition-colors">{trKey(locale, "spreadsheet.auto.039")}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Import group template modal ── */}
        {importTemplateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">{trKey(locale, "spreadsheet.auto.035")}</h3>
              {groupTemplates.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">{trKey(locale, "spreadsheet.auto.040")}</p>
              ) : (
                <ul className="space-y-1 max-h-64 overflow-y-auto">
                  {groupTemplates.map((tpl) => (
                    <li key={tpl.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 group">
                      <button
                        className="flex-1 text-left text-sm text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors"
                        onClick={() => handleImportGroupTemplate(tpl.id)}
                      >
                        {tpl.name}
                      </button>
                      <button
                        onClick={() => handleDeleteGroupTemplate(tpl.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 cursor-pointer transition-all"
                        title={trKey(locale, "spreadsheet.auto.041")}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/></svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end mt-4">
                <button onClick={() => setImportTemplateOpen(false)} className="px-3 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors">{trKey(locale, "spreadsheet.auto.042")}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* ── Bulk action bar ── */}
    {selectedTaskIds.size > 0 && (
      <BulkActionBar
        selectedCount={selectedTaskIds.size}
        columns={project.columns}
        ownerOptions={readOnlyOwner ? [] : memberOptions.map((member) => ({ id: member.id, name: member.name }))}
        onClear={() => setSelectedTaskIds(new Set())}
        onStatusChange={handleBulkStatusChange}
        onPriorityChange={handleBulkPriorityChange}
        onOwnerChange={handleBulkOwnerChange}
        onArchive={handleBulkArchive}
        onDelete={handleBulkDelete}
      />
    )}

    {/* ── Task detail panel ── */}
    {(() => {
      if (!openTaskId) return null;
      const openGroup = groups.find((g) => Boolean(findTaskInGroupTasks(g.tasks, openTaskId)));
      const openTask = openGroup ? findTaskInGroupTasks(openGroup.tasks, openTaskId) : null;
      if (!openTask || !openGroup) return null;
      return (
        <TaskDetailPanel
          task={openTask}
          groupName={openGroup.name}
          groupColor={openGroup.color}
          columns={allColumns}
          projectId={project.id}
          onClose={() => setOpenTaskId(null)}
          onTitleUpdate={(title) => handleTitleUpdate(openTask.id, title)}
          onFieldUpdate={(columnId, value) =>
            handleFieldUpdate(openTask.id, columnId, value)
          }
          readOnlyOwner={readOnlyOwner}
          onArchive={() => handleArchiveTask(openTask.id)}
          onDuplicate={() => handleDuplicateTask(openTask.id)}
        />
      );
    })()}

    {newSubgroupHint && (
      <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[80] px-3">
        <div className="flex items-center gap-2 rounded-full border border-emerald-200 dark:border-emerald-700 bg-white/95 dark:bg-gray-900/95 shadow-lg px-3 py-2">
          <span className="text-[11px] text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
            {locale === "fr" ? "Sous-catégorie créée en bas" : "Sub-category created below"}
          </span>
          <button
            type="button"
            onClick={() => {
              scrollToGroupRow(newSubgroupHint);
              setNewSubgroupHint(null);
            }}
            className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            {locale === "fr" ? "Voir ↓" : "View ↓"}
          </button>
        </div>
      </div>
    )}
    </>
  );
}

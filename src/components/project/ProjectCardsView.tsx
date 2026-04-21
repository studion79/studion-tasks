"use client";

import { useState, useTransition, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { getUiLocale } from "@/lib/ui-locale";
import { usePathname, useRouter } from "next/navigation";
import type { ProjectWithRelations, GroupWithTasks, TaskWithFields } from "@/lib/types";
import { getPriorityOptions, getStatusOptions } from "@/lib/constants";
import { getFieldValue, RecurrenceIcon } from "./cells";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { useProjectContext } from "./ProjectContext";
import { trKey } from "@/lib/i18n/client";
import { useClientLocale } from "@/lib/i18n/useClientLocale";
import { sortGroupsByHierarchy } from "@/lib/group-tree";
import type { AppLocale } from "@/i18n/config";
import {
  createTask as createTaskAction,
  createGroupWithParent as createGroupWithParentAction,
  updateGroupName as updateGroupNameAction,
  deleteGroup as deleteGroupAction,
  updateTaskTitle as updateTaskTitleAction,
  upsertTaskField,
  archiveTask as archiveTaskAction,
} from "@/lib/actions";
import { toCanonicalStatus } from "@/lib/status";
import { composeDateTimeValue, splitDateTimeValue } from "@/lib/task-schedule";
import { normalizeTimeInput } from "@/lib/time-input";

// --- Badge ---
function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

// --- Task card ---
function TaskCard({
  task,
  columns,
  groupColor,
  onOpen,
  onDelete,
  onToggleDone,
  onSubtaskToggle,
  isCompleting,
  locale,
  mobile = false,
}: {
  task: TaskWithFields;
  columns: ProjectWithRelations["columns"];
  groupColor: string;
  onOpen: () => void;
  onDelete: () => void;
  onToggleDone?: () => void;
  onSubtaskToggle?: (subtaskId: string) => void;
  isCompleting?: boolean;
  locale: AppLocale;
  mobile?: boolean;
}) {
  const statusOptions = useMemo(() => getStatusOptions(locale), [locale]);
  const priorityOptions = useMemo(() => getPriorityOptions(locale), [locale]);
  const statusCol = columns.find((c) => c.type === "STATUS");
  const priorityCol = columns.find((c) => c.type === "PRIORITY");
  const dueDateCol = columns.find((c) => c.type === "DUE_DATE");
  const ownerCol = columns.find((c) => c.type === "OWNER");

  const notesCol = columns.find((c) => c.type === "NOTES");

  const statusVal = statusCol ? getFieldValue(task.fieldValues, statusCol.id) : null;
  const priorityVal = priorityCol ? getFieldValue(task.fieldValues, priorityCol.id) : null;
  const dueDateVal = dueDateCol ? getFieldValue(task.fieldValues, dueDateCol.id) : null;
  const ownerVal = ownerCol ? getFieldValue(task.fieldValues, ownerCol.id) : null;
  const hasNotes = notesCol ? !!getFieldValue(task.fieldValues, notesCol.id) : false;
  const subtaskCount = task.subtasks?.length ?? 0;
  const attachCount = task.attachments?.length ?? 0;
  const depCount = task.blockerDeps?.length ?? 0;
  const commentCount = task.comments?.length ?? 0;

  const { resolveOwnerName, resolveOwnerAvatar } = useProjectContext();
  const ownerLabel = resolveOwnerName(ownerVal);
  const ownerAvatar = resolveOwnerAvatar(ownerVal);
  const statusMeta = statusOptions.find((o) => o.value === statusVal);
  const priorityMeta = priorityOptions.find((o) => o.value === priorityVal);
  const isDone = toCanonicalStatus(statusVal) === "DONE" || Boolean(isCompleting);
  const [completingSubtasks, setCompletingSubtasks] = useState<Set<string>>(new Set());
  const visibleSubtasks = useMemo(() => {
    if (!task.subtasks?.length || !statusCol) return [];
    return task.subtasks.filter((sub) => {
      const raw = sub.fieldValues.find((fv) => fv.columnId === statusCol.id)?.value ?? null;
      const done = toCanonicalStatus(raw) === "DONE";
      return !done || completingSubtasks.has(sub.id);
    });
  }, [completingSubtasks, statusCol, task.subtasks]);

  const isOverdue = dueDateVal
    ? new Date((splitDateTimeValue(dueDateVal).date || dueDateVal) + "T00:00:00") < new Date(new Date().toDateString())
    : false;

  const formatDate = (d: string) => {
    const parts = splitDateTimeValue(d);
    const datePart = parts.date || d;
    const base = new Date(datePart + "T12:00:00").toLocaleDateString(getUiLocale(), {
      day: "numeric",
      month: "short",
    });
    return parts.hasTime ? `${base} ${parts.time}` : base;
  };

  return (
    <div
      onClick={onOpen}
      className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl ${mobile ? "p-3" : "p-4"} hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-300 cursor-pointer group/card relative ${
        isCompleting ? "opacity-50 bg-emerald-50/60 dark:bg-emerald-900/10" : ""
      }`}
    >
      {/* Color accent */}
      <div
        className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full opacity-0 group-hover/card:opacity-100 transition-opacity"
        style={{ backgroundColor: groupColor }}
      />

      {/* Title + complete toggle */}
      <div className={`flex items-start gap-2.5 ${mobile ? "mb-2.5" : "mb-3"} pr-5`}>
        {onToggleDone ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
            className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all cursor-pointer ${
              isDone
                ? "border-emerald-500 bg-emerald-500"
                : "border-gray-300 dark:border-gray-500 hover:border-indigo-400"
            }`}
            title={isDone ? trKey(locale, "cards.markedCompleted") : trKey(locale, "cards.markAsCompleted")}
          >
            {isDone ? (
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </button>
        ) : null}
        <p
          className={`${mobile ? "text-[13px]" : "text-sm"} font-medium leading-snug min-w-0 transition-all ${
            isCompleting
              ? "line-through text-emerald-600 dark:text-emerald-400"
              : "text-gray-900 dark:text-gray-50"
          }`}
        >
          {isCompleting ? (
            <svg className="inline w-3.5 h-3.5 mr-1 mb-0.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
          {task.title}
        </p>
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title={trKey(locale, "task.archive")}
        className={`absolute top-3 right-3 p-0.5 rounded text-gray-300 hover:text-red-400 transition-all cursor-pointer ${mobile ? "opacity-100" : "opacity-0 group-hover/card:opacity-100"}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Badges row */}
      {(statusMeta || priorityMeta || task.recurrence) && (
        <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
          {statusMeta && <Badge label={statusMeta.label} className={statusMeta.color} />}
          {priorityMeta && <Badge label={priorityMeta.label} className={priorityMeta.color} />}
          <RecurrenceIcon recurrence={task.recurrence ?? null} />
        </div>
      )}

      {/* Icon indicators */}
      {!mobile && (subtaskCount > 0 || attachCount > 0 || depCount > 0 || hasNotes || commentCount > 0) && (
        <div className="flex items-center gap-2.5 mb-2 text-gray-400 dark:text-gray-300">
          {subtaskCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${subtaskCount} ${trKey(locale, "cards.subtaskSingular")}${subtaskCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {subtaskCount}
            </span>
          )}
          {attachCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${attachCount} ${trKey(locale, "cards.attachmentSingular")}${attachCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {attachCount}
            </span>
          )}
          {depCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${depCount} ${trKey(locale, "cards.dependencySingular")}${depCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.102-1.101" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {depCount}
            </span>
          )}
          {hasNotes && (
            <span title={trKey(locale, "cards.note")} className="flex items-center">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          )}
          {commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${commentCount} ${trKey(locale, "cards.commentSingular")}${commentCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {commentCount}
            </span>
          )}
        </div>
      )}

      {visibleSubtasks.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-gray-100 dark:border-gray-700 pt-2">
          {visibleSubtasks.slice(0, 4).map((sub) => {
            const isCompletingSub = completingSubtasks.has(sub.id);
            return (
              <button
                key={sub.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!onSubtaskToggle || isCompletingSub) return;
                  setCompletingSubtasks((prev) => new Set(prev).add(sub.id));
                  window.setTimeout(() => {
                    onSubtaskToggle(sub.id);
                    setCompletingSubtasks((prev) => {
                      const next = new Set(prev);
                      next.delete(sub.id);
                      return next;
                    });
                  }, 240);
                }}
                className="w-full flex items-center gap-2 text-left"
              >
                <span className={`w-3.5 h-3.5 min-w-[14px] min-h-[14px] rounded-full border flex-shrink-0 flex items-center justify-center transition-all ${isCompletingSub ? "border-emerald-500 bg-emerald-500" : "border-gray-300 dark:border-gray-500"}`}>
                  {isCompletingSub && (
                    <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={`text-xs truncate ${isCompletingSub ? "line-through text-emerald-600 dark:text-emerald-400" : "text-gray-600 dark:text-gray-300"}`}>{sub.title}</span>
              </button>
            );
          })}
          {visibleSubtasks.length > 4 && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 pl-5">
              +{visibleSubtasks.length - 4}
            </p>
          )}
        </div>
      )}

      {/* Meta row */}
      {(ownerVal || dueDateVal) && (
        <div className={`flex items-center justify-between gap-2 ${mobile ? "mt-0.5" : "mt-1"}`}>
          {ownerLabel ? (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full flex-shrink-0 overflow-hidden">
                {ownerAvatar ? (
                  <img src={ownerAvatar} alt={ownerLabel} className="w-full h-full object-cover rounded-full" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-[10px] font-semibold text-indigo-600 uppercase">{ownerLabel.charAt(0)}</span>
                  </div>
                )}
              </div>
              <span className={`text-xs text-gray-500 truncate ${mobile ? "max-w-[100px]" : "max-w-[80px]"}`}>{ownerLabel}</span>
            </div>
          ) : (
            <span />
          )}
          {dueDateVal && (
            <span className={`text-xs flex-shrink-0 ${isOverdue ? "text-red-500 font-medium" : "text-gray-400"}`}>
              {isOverdue && "⚠ "}
              {formatDate(dueDateVal)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// --- Add task card ---
function AddTaskCard({
  onAdd,
  columns,
  locale,
}: {
  onAdd: (title: string, owner?: string, dueDate?: string) => void;
  columns: ProjectWithRelations["columns"];
  locale: AppLocale;
}) {
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newDueTime, setNewDueTime] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { memberOptions } = useProjectContext();

  const ownerColId = columns.find((c) => c.type === "OWNER")?.id ?? null;
  const dueDateColId = columns.find((c) => c.type === "DUE_DATE")?.id ?? null;

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  const submit = () => {
    const t = draft.trim();
    setDraft("");
    setNewOwner("");
    setNewDueDate("");
    setNewDueTime("");
    setActive(false);
    const normalizedTime = normalizeTimeInput(newDueTime, newDueTime);
    const dueValue = newDueDate ? composeDateTimeValue(newDueDate, normalizedTime || null) : "";
    if (t) onAdd(t, newOwner || undefined, dueValue || undefined);
  };

  if (active) {
    return (
      <div className="border border-indigo-300 bg-indigo-50/30 dark:bg-indigo-900/20 rounded-xl p-4 space-y-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") { setDraft(""); setNewOwner(""); setNewDueDate(""); setNewDueTime(""); setActive(false); }
          }}
          placeholder={trKey(locale, "cards.taskNamePlaceholder")}
          className="w-full text-sm text-gray-800 dark:text-gray-100 outline-none bg-transparent placeholder-gray-400 dark:placeholder-gray-500"
        />
        {ownerColId && memberOptions.length > 0 && (
          <select
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            className="w-full select-unified select-unified-sm"
          >
            <option value="">{trKey(locale, "cards.ownerPlaceholder")}</option>
            {memberOptions.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        )}
        {dueDateColId && (
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="w-full datetime-field"
            />
            <input
              type="time"
              value={newDueTime}
              onChange={(e) => setNewDueTime(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const normalized = normalizeTimeInput((e.currentTarget as HTMLInputElement).value || newDueTime, newDueTime);
                  setNewDueTime(normalized);
                  submit();
                }
              }}
              className="w-full datetime-field"
            />
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={submit}
            className="flex-1 text-xs bg-indigo-500 text-white rounded-md py-1 hover:bg-indigo-600 transition-colors cursor-pointer"
          >
            {trKey(locale, "common.add")}
          </button>
          <button
            onClick={() => { setDraft(""); setNewOwner(""); setNewDueDate(""); setNewDueTime(""); setActive(false); }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 cursor-pointer"
          >
            {trKey(locale, "common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setActive(true)}
      className="border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 text-sm text-gray-400 dark:text-gray-500 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-all cursor-pointer flex items-center gap-2 w-full"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M12 4v16m8-8H4" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {trKey(locale, "cards.addTask")}
    </button>
  );
}

// --- Main ---
export function ProjectCardsView({ project }: { project: ProjectWithRelations }) {
  const pathname = usePathname();
  const locale = useClientLocale(pathname);
  const { columns } = project;
  const statusCol = columns.find((c) => c.type === "STATUS") ?? null;
  const [groups, setGroups] = useState<GroupWithTasks[]>(project.groups);
  const [isRowsLayout, setIsRowsLayout] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(`cards-layout-${project.id}`);
    setIsRowsLayout(saved === "rows" || saved === "grid");
  }, [project.id]);

  const toggleLayout = () => {
    const next = !isRowsLayout;
    setIsRowsLayout(next);
    localStorage.setItem(`cards-layout-${project.id}`, next ? "rows" : "columns");
  };

  useEffect(() => {
    setGroups((prev) =>
      project.groups.map((serverGroup) => {
        const localGroup = prev.find((g) => g.id === serverGroup.id);
        const tempTasks = localGroup ? localGroup.tasks.filter((t) => t.id.startsWith("temp-")) : [];
        return { ...serverGroup, tasks: [...serverGroup.tasks, ...tempTasks] };
      })
    );
  }, [project]);

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [completingTasks, setCompletingTasks] = useState<Set<string>>(new Set());
  const [mobileExpandedRootGroups, setMobileExpandedRootGroups] = useState<Set<string>>(new Set());
  const [mobileExpandedSubgroups, setMobileExpandedSubgroups] = useState<Set<string>>(new Set());
  const [groupMenuId, setGroupMenuId] = useState<string | null>(null);
  const [groupMenuPos, setGroupMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const tempTaskCounterRef = useRef(0);
  const groupMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const isDoneTask = (task: TaskWithFields) => {
    if (!statusCol) return false;
    const raw = task.fieldValues.find((fv) => fv.columnId === statusCol.id)?.value ?? null;
    return toCanonicalStatus(raw) === "DONE";
  };

  const visibleGroups = useMemo(
    () => groups.map((g) => ({ ...g, tasks: g.tasks.filter((t) => !t.archivedAt && !isDoneTask(t)) })),
    [groups, statusCol]
  );
  const orderedVisibleGroups = useMemo(() => sortGroupsByHierarchy(visibleGroups), [visibleGroups]);
  const visibleGroupsById = useMemo(
    () => new Map(orderedVisibleGroups.map((group) => [group.id, group])),
    [orderedVisibleGroups]
  );
  const groupDepthById = useMemo(() => {
    const out = new Map<string, number>();
    const getDepth = (groupId: string): number => {
      const cached = out.get(groupId);
      if (cached !== undefined) return cached;
      const group = visibleGroupsById.get(groupId);
      if (!group) return 0;
      if (!group.parentId || !visibleGroupsById.has(group.parentId)) {
        out.set(groupId, 0);
        return 0;
      }
      const depth = getDepth(group.parentId) + 1;
      out.set(groupId, depth);
      return depth;
    };
    for (const group of orderedVisibleGroups) {
      getDepth(group.id);
    }
    return out;
  }, [orderedVisibleGroups, visibleGroupsById]);
  const mobileRootGroups = useMemo(
    () =>
      orderedVisibleGroups.filter(
        (group) => !group.parentId || !visibleGroupsById.has(group.parentId)
      ),
    [orderedVisibleGroups, visibleGroupsById]
  );
  const isDescendantOfGroup = useMemo(
    () => (groupId: string, ancestorId: string) => {
      let cursor = visibleGroupsById.get(groupId)?.parentId ?? null;
      const seen = new Set<string>();
      while (cursor) {
        if (seen.has(cursor)) break;
        seen.add(cursor);
        if (cursor === ancestorId) return true;
        cursor = visibleGroupsById.get(cursor)?.parentId ?? null;
      }
      return false;
    },
    [visibleGroupsById]
  );
  const groupPathById = useMemo(() => {
    const byId = new Map(orderedVisibleGroups.map((group) => [group.id, group]));
    const out = new Map<string, string>();
    for (const group of orderedVisibleGroups) {
      const chain: string[] = [];
      const seen = new Set<string>();
      let cursor = group.parentId ? byId.get(group.parentId) ?? null : null;
      while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        chain.unshift(cursor.name);
        cursor = cursor.parentId ? byId.get(cursor.parentId) ?? null : null;
      }
      out.set(group.id, chain.join(" / "));
    }
    return out;
  }, [orderedVisibleGroups]);

  useEffect(() => {
    if (mobileExpandedRootGroups.size > 0) return;
    if (!mobileRootGroups[0]?.id) return;
    setMobileExpandedRootGroups(new Set([mobileRootGroups[0].id]));
  }, [mobileExpandedRootGroups.size, mobileRootGroups]);

  const updateGroupMenuPosition = useCallback((groupId: string) => {
    const selector = `[data-group-menu-trigger="${groupId}"]`;
    const candidates = Array.from(document.querySelectorAll(selector));
    const trigger = candidates.find(
      (node) => node instanceof HTMLElement && node.offsetParent !== null
    ) as HTMLElement | undefined;
    if (!trigger) {
      setGroupMenuId(null);
      setGroupMenuPos(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(188, viewportWidth - margin * 2);
    const left = Math.min(Math.max(rect.right - width, margin), viewportWidth - width - margin);
    const menuHeight = 168;
    const top = Math.min(rect.bottom + 6, viewportHeight - menuHeight - margin);
    setGroupMenuPos({ top: Math.max(margin, top), left, width });
  }, []);

  useEffect(() => {
    if (!groupMenuId) return;
    updateGroupMenuPosition(groupMenuId);

    const onOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      const triggerHit = (target as HTMLElement | null)?.closest?.(
        `[data-group-menu-trigger="${groupMenuId}"]`
      );
      if (triggerHit) return;
      if (groupMenuPanelRef.current?.contains(target)) return;
      setGroupMenuId(null);
      setGroupMenuPos(null);
    };

    const onReposition = () => updateGroupMenuPosition(groupMenuId);
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
  }, [groupMenuId, updateGroupMenuPosition]);

  const handleGroupRename = useCallback((groupId: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) return;
    setGroups((prev) =>
      prev.map((group) => (group.id === groupId ? { ...group, name: nextName } : group))
    );
    startTransition(async () => {
      await updateGroupNameAction(groupId, nextName);
      router.refresh();
    });
  }, [router, setGroups, startTransition]);

  const submitAddSubgroup = useCallback((parentId: string) => {
    const baseName = locale === "fr" ? "Sous-catégorie" : "Sub-category";
    const typed = window.prompt(
      locale === "fr" ? "Nom de la sous-catégorie" : "Sub-category name",
      baseName
    );
    const name = typed?.trim();
    if (!name) return;
    setGroupMenuId(null);
    setGroupMenuPos(null);
    setMobileExpandedRootGroups((prev) => new Set(prev).add(parentId));
    setMobileExpandedSubgroups((prev) => new Set(prev).add(parentId));
    startTransition(async () => {
      await createGroupWithParentAction(project.id, name, parentId);
      router.refresh();
    });
  }, [locale, project.id, router, startTransition]);

  const handleDeleteGroup = useCallback((groupId: string) => {
    const confirmed = window.confirm(
      locale === "fr"
        ? "Supprimer cette catégorie et ses sous-catégories ?"
        : "Delete this category and its sub-categories?"
    );
    if (!confirmed) return;
    setGroupMenuId(null);
    setGroupMenuPos(null);
    startTransition(async () => {
      await deleteGroupAction(groupId);
      router.refresh();
    });
  }, [locale, router, startTransition]);

  const handleFieldUpdate = (taskId: string, columnId: string, value: string | null) => {
    const normalized = columnId === statusCol?.id ? toCanonicalStatus(value) : value;
    if (statusCol && columnId === statusCol.id && normalized === "DONE") {
      setCompletingTasks((prev) => new Set(prev).add(taskId));
      setTimeout(() => {
        setGroups((prev) =>
          prev.map((g) => ({ ...g, tasks: g.tasks.filter((t) => t.id !== taskId) }))
        );
        setCompletingTasks((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        startTransition(async () => {
          await upsertTaskField(taskId, columnId, value);
          router.refresh();
        });
      }, 1500);
      return;
    }
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        tasks: g.tasks
          .map((t) => {
            if (t.id !== taskId) return t;
            const rest = t.fieldValues.filter((fv) => fv.columnId !== columnId);
            return {
              ...t,
              fieldValues: normalized !== null
                ? [...rest, { id: `opt-${columnId}`, taskId, columnId, value: normalized, updatedAt: new Date() }]
                : rest,
            };
          })
          .filter((t) => !t.archivedAt && !isDoneTask(t)),
      }))
    );
    startTransition(async () => {
      await upsertTaskField(taskId, columnId, value);
      router.refresh();
    });
  };

  const handleSubtaskDone = (_taskId: string, subtaskId: string) => {
    if (!statusCol) return;
    const updateSubtaskStatus = (tasks: TaskWithFields[]): TaskWithFields[] =>
      tasks.map((task) => {
        if (task.id === subtaskId) {
          const rest = task.fieldValues.filter((fv) => fv.columnId !== statusCol.id);
          return {
            ...task,
            fieldValues: [
              ...rest,
              { id: `opt-${statusCol.id}`, taskId: subtaskId, columnId: statusCol.id, value: "DONE", updatedAt: new Date() },
            ],
          };
        }
        return {
          ...task,
          subtasks: updateSubtaskStatus((task.subtasks ?? []) as TaskWithFields[]),
        };
      });
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        tasks: updateSubtaskStatus(g.tasks as TaskWithFields[]),
      }))
    );
    startTransition(async () => {
      await upsertTaskField(subtaskId, statusCol.id, "DONE");
      router.refresh();
    });
  };

  const handleTitleUpdate = (taskId: string, title: string) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        tasks: g.tasks.map((t) => (t.id === taskId ? { ...t, title } : t)),
      }))
    );
    startTransition(async () => {
      await updateTaskTitleAction(taskId, title);
      router.refresh();
    });
  };

  const handleArchiveTask = (taskId: string) => {
    setGroups((prev) =>
      prev.map((g) => ({ ...g, tasks: g.tasks.filter((t) => t.id !== taskId) }))
    );
    setArchiveConfirmId(null);
    startTransition(async () => {
      await archiveTaskAction(taskId);
      router.refresh();
    });
  };

  const handleAddTask = (groupId: string, title: string, owner?: string, dueDate?: string) => {
    tempTaskCounterRef.current += 1;
    const tempId = `temp-${groupId}-${tempTaskCounterRef.current}`;
    const ownerColId = columns.find((c) => c.type === "OWNER")?.id ?? null;
    const dueDateColId = columns.find((c) => c.type === "DUE_DATE")?.id ?? null;
    const initialFieldValues: TaskWithFields["fieldValues"] = [];
    if (owner && ownerColId) initialFieldValues.push({ id: `opt-${ownerColId}`, taskId: tempId, columnId: ownerColId, value: owner, updatedAt: new Date() });
    if (dueDate && dueDateColId) initialFieldValues.push({ id: `opt-${dueDateColId}`, taskId: tempId, columnId: dueDateColId, value: dueDate, updatedAt: new Date() });
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
      if (owner && ownerColId) await upsertTaskField(created.id, ownerColId, owner);
      if (dueDate && dueDateColId) await upsertTaskField(created.id, dueDateColId, dueDate);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, tasks: g.tasks.map((t) => (t.id === tempId ? { ...t, id: created.id } : t)) }
            : g
        )
      );
      router.refresh();
    });
  };

  // Derive open task for panel
  const findTaskInTree = (tasks: TaskWithFields[], taskId: string): TaskWithFields | null => {
    for (const task of tasks) {
      if (task.id === taskId) return task;
      const found = findTaskInTree((task.subtasks ?? []) as TaskWithFields[], taskId);
      if (found) return found;
    }
    return null;
  };
  const openGroup = openTaskId
    ? visibleGroups.find((g) => Boolean(findTaskInTree(g.tasks as TaskWithFields[], openTaskId))) ?? null
    : null;
  const openTask = openGroup && openTaskId
    ? findTaskInTree(openGroup.tasks as TaskWithFields[], openTaskId)
    : null;

  const requestGroupRename = (group: GroupWithTasks) => {
    const typed = window.prompt(
      locale === "fr" ? "Nouveau nom de catégorie" : "New category name",
      group.name
    );
    const name = typed?.trim();
    if (!name || name === group.name) return;
    handleGroupRename(group.id, name);
  };

  const renderGroupActions = (group: GroupWithTasks) => (
    <div className="relative">
      <button
        data-group-menu-trigger={group.id}
        onClick={(event) => {
          event.stopPropagation();
          setGroupMenuId((prev) => {
            if (prev === group.id) {
              setGroupMenuPos(null);
              return null;
            }
            updateGroupMenuPosition(group.id);
            return group.id;
          });
        }}
        className="w-7 h-7 rounded-lg border border-gray-200/90 dark:border-gray-600/90 text-gray-500 dark:text-gray-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-600 dark:hover:text-indigo-300 transition-colors cursor-pointer flex items-center justify-center"
        title={locale === "fr" ? "Actions catégorie" : "Category actions"}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {groupMenuId === group.id && groupMenuPos && createPortal(
        <div
          ref={groupMenuPanelRef}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden"
          style={{
            position: "fixed",
            top: `${groupMenuPos.top}px`,
            left: `${groupMenuPos.left}px`,
            width: `${groupMenuPos.width}px`,
            zIndex: 2147483646,
          }}
        >
          <button
            onClick={() => {
              setGroupMenuId(null);
              setGroupMenuPos(null);
              requestGroupRename(group);
            }}
            className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/70 cursor-pointer"
          >
            {locale === "fr" ? "Renommer" : "Rename"}
          </button>
          <button
            onClick={() => submitAddSubgroup(group.id)}
            className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/70 cursor-pointer"
          >
            + {locale === "fr" ? "Sous-catégorie" : "Sub-category"}
          </button>
          <button
            onClick={() => handleDeleteGroup(group.id)}
            className="w-full text-left px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
          >
            {locale === "fr" ? "Supprimer" : "Delete"}
          </button>
        </div>,
        document.body
      )}
    </div>
  );

  return (
    <>
      <div className="sm:hidden px-1 pb-1 pt-2.5 space-y-2.5 overflow-y-auto overflow-x-hidden h-full overscroll-y-contain">
        {mobileRootGroups.map((group) => {
          const rootExpanded = mobileExpandedRootGroups.has(group.id);
          const nestedGroups = orderedVisibleGroups.filter(
            (candidate) => candidate.id !== group.id && isDescendantOfGroup(candidate.id, group.id)
          );
          const rootPreview = group.tasks.slice(0, 2);
          return (
            <section key={group.id} className="mobile-surface-soft rounded-[20px] p-2.5">
              <div className="mb-2.5 space-y-1.5">
                <div className="flex items-start gap-1.5">
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
                    title={locale === "fr" ? "Afficher / masquer la catégorie" : "Toggle category"}
                  >
                    <svg
                      className={`w-3.5 h-3.5 transition-transform duration-150 ${rootExpanded ? "" : "-rotate-90"}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: group.color }} />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide block truncate">
                      {group.name}
                    </span>
                    {groupPathById.get(group.id) && (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        {groupPathById.get(group.id)}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 tabular-nums mt-0.5">{group.tasks.length}</span>
                  {renderGroupActions(group)}
                </div>
              </div>

              {!rootExpanded ? (
                <div className="space-y-1.5">
                  {rootPreview.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {locale === "fr" ? "Aucune tâche visible" : "No visible tasks"}
                    </p>
                  ) : (
                    <>
                      {rootPreview.map((task) => (
                        <p key={task.id} className="truncate text-xs text-gray-500 dark:text-gray-400">
                          • {task.title}
                        </p>
                      ))}
                      {group.tasks.length > rootPreview.length && (
                        <p className="text-[11px] text-indigo-500 dark:text-indigo-300">
                          +{group.tasks.length - rootPreview.length} {locale === "fr" ? "autres tâches" : "more tasks"}
                        </p>
                      )}
                    </>
                  )}
                  {nestedGroups.length > 0 && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      {nestedGroups.length} {locale === "fr" ? "sous-catégorie(s)" : "sub-category(ies)"}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {group.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      columns={columns}
                      groupColor={group.color}
                      onOpen={() => setOpenTaskId(task.id)}
                      onDelete={() => setArchiveConfirmId(task.id)}
                      onToggleDone={
                        statusCol && !completingTasks.has(task.id)
                          ? () => handleFieldUpdate(task.id, statusCol.id, "DONE")
                          : undefined
                      }
                      onSubtaskToggle={(subtaskId) => handleSubtaskDone(task.id, subtaskId)}
                      isCompleting={completingTasks.has(task.id)}
                      locale={locale}
                      mobile
                    />
                  ))}
                  <AddTaskCard locale={locale} columns={columns} onAdd={(title, owner, dueDate) => handleAddTask(group.id, title, owner, dueDate)} />

                  {nestedGroups.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {nestedGroups.map((subgroup) => {
                        const subExpanded = mobileExpandedSubgroups.has(subgroup.id);
                        const subDepth = groupDepthById.get(subgroup.id) ?? 1;
                        const subPreview = subgroup.tasks.slice(0, 2);
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
                            <div className="w-full px-2.5 py-2 border-b border-gray-200/80 dark:border-gray-700/80 bg-white/40 dark:bg-gray-800/25 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setMobileExpandedSubgroups((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(subgroup.id)) next.delete(subgroup.id);
                                    else next.add(subgroup.id);
                                    return next;
                                  })
                                }
                                className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer"
                              >
                                <svg
                                  className={`w-3 h-3 text-gray-400 transition-transform ${subExpanded ? "" : "-rotate-90"}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: subgroup.color }} />
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 truncate min-w-0 flex-1">
                                  {subgroup.name}
                                </span>
                              </button>
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">{subgroup.tasks.length}</span>
                              {renderGroupActions(subgroup)}
                            </div>
                            {subExpanded ? (
                              <div className="p-2 space-y-2">
                                {subgroup.tasks.map((task) => (
                                  <TaskCard
                                    key={task.id}
                                    task={task}
                                    columns={columns}
                                    groupColor={subgroup.color}
                                    onOpen={() => setOpenTaskId(task.id)}
                                    onDelete={() => setArchiveConfirmId(task.id)}
                                    onToggleDone={
                                      statusCol && !completingTasks.has(task.id)
                                        ? () => handleFieldUpdate(task.id, statusCol.id, "DONE")
                                        : undefined
                                    }
                                    onSubtaskToggle={(subtaskId) => handleSubtaskDone(task.id, subtaskId)}
                                    isCompleting={completingTasks.has(task.id)}
                                    locale={locale}
                                    mobile
                                  />
                                ))}
                                <AddTaskCard
                                  locale={locale}
                                  columns={columns}
                                  onAdd={(title, owner, dueDate) => handleAddTask(subgroup.id, title, owner, dueDate)}
                                />
                              </div>
                            ) : (
                              <div className="p-2">
                                {subPreview.length === 0 ? (
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                    {locale === "fr" ? "Aucune tâche visible" : "No visible tasks"}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                                    {subPreview.map((task) => task.title).join(" • ")}
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
            </section>
          );
        })}

        {mobileRootGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
              <rect x="13" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
            </svg>
            <p className="text-sm">{trKey(locale, "cards.noGroupInProject")}</p>
          </div>
        )}
      </div>

      <div className="hidden sm:block">
      {/* Layout toggle */}
      <div className="flex justify-end px-4 pt-3 pb-1">
        <button
          onClick={toggleLayout}
          title={isRowsLayout ? trKey(locale, "cards.columnView") : trKey(locale, "cards.rowView")}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
        >
          {isRowsLayout ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="5" width="8" height="14" rx="1.5" strokeWidth="1.5" />
                <rect x="13" y="5" width="8" height="14" rx="1.5" strokeWidth="1.5" />
              </svg>
              {trKey(locale, "cards.columns")}
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M3 6h18M3 12h18M3 18h18" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {trKey(locale, "cards.rows")}
            </>
          )}
        </button>
      </div>

      {isRowsLayout ? (
        /* Rows layout: transposed from columns -> each category becomes one horizontal row */
        <div className="p-4 pt-2 space-y-4 overflow-y-auto h-full">
          {orderedVisibleGroups.map((group) => (
            <div key={group.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{group.name}</span>
                {groupPathById.get(group.id) && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                    {groupPathById.get(group.id)}
                  </span>
                )}
                <span className="text-[11px] text-gray-400 tabular-nums ml-1">{group.tasks.length}</span>
                <span className="ml-auto">{renderGroupActions(group)}</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {group.tasks.map((task) => (
                  <div key={task.id} className="w-72 flex-shrink-0">
                    <TaskCard
                      task={task}
                      columns={columns}
                      groupColor={group.color}
                      onOpen={() => setOpenTaskId(task.id)}
                      onDelete={() => setArchiveConfirmId(task.id)}
                      onToggleDone={
                        statusCol && !completingTasks.has(task.id)
                          ? () => handleFieldUpdate(task.id, statusCol.id, "DONE")
                          : undefined
                      }
                      onSubtaskToggle={(subtaskId) => handleSubtaskDone(task.id, subtaskId)}
                      isCompleting={completingTasks.has(task.id)}
                      locale={locale}
                    />
                  </div>
                ))}
                <div className="w-72 flex-shrink-0">
                  <AddTaskCard locale={locale} columns={columns} onAdd={(title, owner, dueDate) => handleAddTask(group.id, title, owner, dueDate)} />
                </div>
              </div>
            </div>
          ))}
          {orderedVisibleGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 w-full">
              <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
                <rect x="13" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
              </svg>
              <p className="text-sm">{trKey(locale, "cards.noGroupInProject")}</p>
            </div>
          )}
        </div>
      ) : (
      <div className="flex gap-4 p-4 pt-2 overflow-x-auto h-full items-start pb-4">
        {orderedVisibleGroups.map((group) => (
          <div key={group.id} className="flex-shrink-0 w-72 flex flex-col max-h-full">
            {/* Column header */}
            <div className="flex items-center gap-2 px-1 mb-3">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: group.color }}
              />
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex-1">
                {group.name}
              </span>
              {groupPathById.get(group.id) && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[45%]">
                  {groupPathById.get(group.id)}
                </span>
              )}
              <span className="text-[11px] text-gray-400 tabular-nums">{group.tasks.length}</span>
              {renderGroupActions(group)}
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-3 overflow-y-auto pr-1">
              {group.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  columns={columns}
                  groupColor={group.color}
                  onOpen={() => setOpenTaskId(task.id)}
                  onDelete={() => setArchiveConfirmId(task.id)}
                  onToggleDone={
                    statusCol && !completingTasks.has(task.id)
                      ? () => handleFieldUpdate(task.id, statusCol.id, "DONE")
                      : undefined
                  }
                  onSubtaskToggle={(subtaskId) => handleSubtaskDone(task.id, subtaskId)}
                  isCompleting={completingTasks.has(task.id)}
                  locale={locale}
                />
              ))}
              <AddTaskCard locale={locale} columns={columns} onAdd={(title, owner, dueDate) => handleAddTask(group.id, title, owner, dueDate)} />
            </div>
          </div>
        ))}

        {orderedVisibleGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400 w-full">
            <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
              <rect x="13" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
            </svg>
            <p className="text-sm">{trKey(locale, "cards.noGroupInProject")}</p>
          </div>
        )}
      </div>
      )}
      </div>

      {/* Task detail panel */}
      {openTask && openGroup && (
        <TaskDetailPanel
          task={openTask}
          groupName={openGroup.name}
          groupColor={openGroup.color}
          columns={columns}
          projectId={project.id}
          onClose={() => setOpenTaskId(null)}
          onTitleUpdate={(title) => handleTitleUpdate(openTask.id, title)}
          onFieldUpdate={(columnId, value) => handleFieldUpdate(openTask.id, columnId, value)}
        />
      )}

      {/* Archive confirmation */}
      {archiveConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setArchiveConfirmId(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-5 w-72 mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-50 mb-1">{trKey(locale, "cards.archiveThisTask")}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{trKey(locale, "cards.archiveTaskHint")}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setArchiveConfirmId(null)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer">{trKey(locale, "common.cancel")}</button>
              <button onClick={() => handleArchiveTask(archiveConfirmId)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer">{trKey(locale, "task.archive")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

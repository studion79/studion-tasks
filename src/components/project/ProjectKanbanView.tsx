"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { getUiLocale } from "@/lib/ui-locale";
import { usePathname, useRouter } from "next/navigation";
import type { ProjectWithRelations, TaskWithFields } from "@/lib/types";
import { getPriorityOptions, getStatusOptions } from "@/lib/constants";
import { getFieldValue, RecurrenceIcon } from "./cells";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { useProjectContext } from "./ProjectContext";
import { toCanonicalStatus } from "@/lib/status";
import { trKey } from "@/lib/i18n/client";
import { useClientLocale } from "@/lib/i18n/useClientLocale";
import type { AppLocale } from "@/i18n/config";
import {
  createTask as createTaskAction,
  updateTaskTitle as updateTaskTitleAction,
  upsertTaskField,
  archiveTask as archiveTaskAction,
} from "@/lib/actions";
import { composeDateTimeValue, splitDateTimeValue } from "@/lib/task-schedule";
import { sortGroupsByHierarchy } from "@/lib/group-tree";
import { normalizeTimeInput } from "@/lib/time-input";

// --- Kanban card ---
function KanbanCard({
  task,
  columns,
  isDragging,
  onDragStart,
  onOpen,
  onDelete,
  onSubtaskToggle,
  locale,
  draggableEnabled = true,
  mobile = false,
}: {
  task: TaskWithFields;
  columns: ProjectWithRelations["columns"];
  isDragging: boolean;
  onDragStart: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onSubtaskToggle?: (subtaskId: string) => void;
  locale: AppLocale;
  draggableEnabled?: boolean;
  mobile?: boolean;
}) {
  const t = (key: Parameters<typeof trKey>[1]) => trKey(locale, key);
  const statusCol = columns.find((c) => c.type === "STATUS");
  const priorityOptions = useMemo(() => getPriorityOptions(locale), [locale]);
  const priorityCol = columns.find((c) => c.type === "PRIORITY");
  const dueDateCol = columns.find((c) => c.type === "DUE_DATE");
  const ownerCol = columns.find((c) => c.type === "OWNER");

  const notesCol = columns.find((c) => c.type === "NOTES");

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
  const priorityMeta = priorityOptions.find((o) => o.value === priorityVal);
  const [completingSubtasks, setCompletingSubtasks] = useState<Set<string>>(new Set());
  const visibleSubtasks = useMemo(() => {
    if (!task.subtasks?.length || !statusCol) return [];
    return task.subtasks.filter((sub) => {
      const raw = sub.fieldValues.find((fv) => fv.columnId === statusCol.id)?.value ?? null;
      return toCanonicalStatus(raw) !== "DONE" || completingSubtasks.has(sub.id);
    });
  }, [completingSubtasks, statusCol, task.subtasks]);

  const isOverdue = dueDateVal
    ? new Date((splitDateTimeValue(dueDateVal).date || dueDateVal) + "T00:00:00") < new Date(new Date().toDateString())
    : false;

  const formatDate = (d: string) => {
    const parsed = splitDateTimeValue(d);
    const base = new Date((parsed.date || d) + "T12:00:00").toLocaleDateString(getUiLocale(), {
      day: "numeric",
      month: "short",
    });
    return parsed.hasTime ? `${base} ${parsed.time}` : base;
  };

  return (
    <div
      draggable={draggableEnabled}
      onDragStart={(e) => {
        if (!draggableEnabled) return;
        onDragStart();
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      className={[
        "bg-white dark:bg-gray-800 border rounded-xl p-3.5 cursor-grab active:cursor-grabbing",
        "hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all group/kcard select-none",
        mobile ? "cursor-pointer active:cursor-pointer" : "",
        isDragging ? "opacity-40 border-indigo-300 shadow-none" : "border-gray-200 dark:border-gray-700",
      ].join(" ")}
    >
      {/* Title + delete */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-50 leading-snug flex-1 flex items-center gap-1 min-w-0">
          <span className="truncate min-w-0">{task.title}</span>
          <RecurrenceIcon recurrence={task.recurrence ?? null} />
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title={t("common.delete")}
          className={`p-0.5 rounded text-gray-300 hover:text-red-400 transition-all cursor-pointer flex-shrink-0 mt-0.5 ${mobile ? "opacity-100" : "opacity-0 group-hover/kcard:opacity-100"}`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Priority badge */}
      {priorityMeta && (
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium mb-2 ${priorityMeta.color}`}>
          {priorityMeta.label}
        </span>
      )}

      {/* Icon indicators */}
      {(subtaskCount > 0 || attachCount > 0 || depCount > 0 || hasNotes || commentCount > 0) && (
        <div className="flex items-center gap-2 mb-2 text-gray-400 dark:text-gray-300">
          {subtaskCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${subtaskCount} ${t("cards.subtaskSingular")}${subtaskCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {subtaskCount}
            </span>
          )}
          {attachCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${attachCount} ${t("cards.attachmentSingular")}${attachCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {attachCount}
            </span>
          )}
          {depCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${depCount} ${t("cards.dependencySingular")}${depCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.102-1.101" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {depCount}
            </span>
          )}
          {hasNotes && (
            <span title={t("cards.note")}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          )}
          {commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${commentCount} ${t("cards.commentSingular")}${commentCount > 1 ? "s" : ""}`}>
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
            <p className="text-[11px] text-gray-400 dark:text-gray-500 pl-5">+{visibleSubtasks.length - 4}</p>
          )}
        </div>
      )}

      {/* Footer: owner + due date */}
      {(ownerVal || dueDateVal) && (
        <div className="flex items-center justify-between gap-2 mt-1">
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
              <span className="text-xs text-gray-400 truncate max-w-[70px]">{ownerLabel}</span>
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

// --- Add task inline ---
function AddTaskInline({
  onAdd,
  columns,
  locale,
}: {
  onAdd: (title: string, owner?: string, dueDate?: string) => void;
  columns: ProjectWithRelations["columns"];
  locale: AppLocale;
}) {
  const t = (key: Parameters<typeof trKey>[1]) => trKey(locale, key);
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
    const due = newDueDate ? composeDateTimeValue(newDueDate, normalizedTime || null) : "";
    if (t) onAdd(t, newOwner || undefined, due || undefined);
  };

  if (active) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-indigo-300 rounded-xl p-3 space-y-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") { setDraft(""); setNewOwner(""); setNewDueDate(""); setNewDueTime(""); setActive(false); }
          }}
          placeholder={t("cards.taskNamePlaceholder")}
          className="w-full text-sm text-gray-800 dark:text-gray-100 outline-none placeholder-gray-400 dark:placeholder-gray-500 bg-transparent"
        />
        {ownerColId && memberOptions.length > 0 && (
          <select
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            className="w-full select-unified select-unified-sm"
          >
            <option value="">{t("cards.ownerPlaceholder")}</option>
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
            {t("common.add")}
          </button>
          <button
            onClick={() => { setDraft(""); setNewOwner(""); setNewDueDate(""); setNewDueTime(""); setActive(false); }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 cursor-pointer"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setActive(true)}
      className="w-full flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-500 transition-colors cursor-pointer py-1 px-1"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M12 4v16m8-8H4" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {t("cards.addTask")}
    </button>
  );
}

// --- Main ---
export function ProjectKanbanView({ project }: { project: ProjectWithRelations }) {
  const pathname = usePathname();
  const locale = useClientLocale(pathname);
  const statusOptions = useMemo(() => getStatusOptions(locale), [locale]);
  const { columns } = project;
  const statusCol = columns.find((c) => c.type === "STATUS") ?? null;

  const orderedGroups = useMemo(() => sortGroupsByHierarchy(project.groups), [project.groups]);
  const groupPathById = useMemo(() => {
    const byId = new Map(orderedGroups.map((group) => [group.id, group]));
    const out = new Map<string, string>();
    for (const group of orderedGroups) {
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
  }, [orderedGroups]);

  // Flat list of all tasks across all groups
  const initialTasks = project.groups.flatMap((g) => g.tasks);
  // Map taskId → groupId for creating tasks in the right group
  const taskGroupMap = new Map(
    project.groups.flatMap((g) => g.tasks.map((t) => [t.id, g.id]))
  );
  const firstGroupId = orderedGroups[0]?.id ?? null;

  const [tasks, setTasks] = useState<TaskWithFields[]>(initialTasks);

  // Full sync from server after every refresh
  useEffect(() => {
    setTasks((prev) => {
      const serverTasks = project.groups.flatMap((g) => g.tasks);
      const tempTasks = prev.filter((t) => t.id.startsWith("temp-"));
      return [...serverTasks, ...tempTasks];
    });
  }, [project]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [mobileExpandedGroups, setMobileExpandedGroups] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const router = useRouter();
  const mobileGroupKey = (statusValue: string, groupId: string) => `${statusValue}:${groupId}`;

  const getStatus = (task: TaskWithFields): string => {
    if (!statusCol) return "NOT_STARTED";
    const raw = getFieldValue(task.fieldValues, statusCol.id);
    return toCanonicalStatus(raw) ?? "NOT_STARTED";
  };

  useEffect(() => {
    if (mobileExpandedGroups.size > 0) return;
    const initial = new Set<string>();
    for (const status of statusOptions) {
      const firstGroupForStatus = orderedGroups.find((group) =>
        tasks.some((task) => task.groupId === group.id && getStatus(task) === status.value)
      );
      if (firstGroupForStatus) {
        initial.add(mobileGroupKey(status.value, firstGroupForStatus.id));
      }
    }
    if (initial.size > 0) setMobileExpandedGroups(initial);
  }, [mobileExpandedGroups.size, orderedGroups, statusOptions, tasks]);

  const handleDrop = (statusValue: string) => {
    if (!draggingId || !statusCol) return;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== draggingId) return t;
        const rest = t.fieldValues.filter((fv) => fv.columnId !== statusCol.id);
        return {
          ...t,
          fieldValues: [
            ...rest,
            { id: `opt-${statusCol.id}`, taskId: t.id, columnId: statusCol.id, value: statusValue, updatedAt: new Date() },
          ],
        };
      })
    );
    const tid = draggingId;
    startTransition(async () => {
      await upsertTaskField(tid, statusCol.id, statusValue);
      router.refresh();
    });
    setDraggingId(null);
    setDragOverCol(null);
  };

  const handleMoveTask = (taskId: string, statusValue: string) => {
    if (!statusCol) return;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const rest = t.fieldValues.filter((fv) => fv.columnId !== statusCol.id);
        return {
          ...t,
          fieldValues: [
            ...rest,
            { id: `opt-${statusCol.id}`, taskId: t.id, columnId: statusCol.id, value: statusValue, updatedAt: new Date() },
          ],
        };
      })
    );
    startTransition(async () => {
      await upsertTaskField(taskId, statusCol.id, statusValue);
      router.refresh();
    });
  };

  const handleArchiveTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setArchiveConfirmId(null);
    startTransition(async () => {
      await archiveTaskAction(taskId);
      router.refresh();
    });
  };

  const handleTitleUpdate = (taskId: string, title: string) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, title } : t)));
    startTransition(async () => {
      await updateTaskTitleAction(taskId, title);
      router.refresh();
    });
  };

  const handleFieldUpdate = (taskId: string, columnId: string, value: string | null) => {
    const normalized = columnId === statusCol?.id ? toCanonicalStatus(value) : value;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const rest = t.fieldValues.filter((fv) => fv.columnId !== columnId);
        return {
          ...t,
          fieldValues: normalized !== null
            ? [...rest, { id: `opt-${columnId}`, taskId, columnId, value: normalized, updatedAt: new Date() }]
            : rest,
        };
      })
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
    setTasks((prev) =>
      updateSubtaskStatus(prev as TaskWithFields[])
    );
    startTransition(async () => {
      await upsertTaskField(subtaskId, statusCol.id, "DONE");
      router.refresh();
    });
  };

  const handleAddTask = (statusValue: string) => (title: string, owner?: string, dueDate?: string) => {
    if (!firstGroupId) return;
    const tempId = `temp-${Date.now()}`;
    const ownerCol = columns.find((c) => c.type === "OWNER") ?? null;
    const dueDateCol = columns.find((c) => c.type === "DUE_DATE") ?? null;
    const initialFieldValues: TaskWithFields["fieldValues"] = statusCol
      ? [{ id: `opt-${statusCol.id}`, taskId: tempId, columnId: statusCol.id, value: statusValue, updatedAt: new Date() }]
      : [];
    if (owner && ownerCol) initialFieldValues.push({ id: `opt-${ownerCol.id}`, taskId: tempId, columnId: ownerCol.id, value: owner, updatedAt: new Date() });
    if (dueDate && dueDateCol) initialFieldValues.push({ id: `opt-${dueDateCol.id}`, taskId: tempId, columnId: dueDateCol.id, value: dueDate, updatedAt: new Date() });
    const tempTask: TaskWithFields = {
      id: tempId, groupId: firstGroupId, parentId: null, title,
      position: 9999, archivedAt: null, completedAt: null, reminderOffsetMinutes: null, reminderSentFor: null, recurrence: null, createdAt: new Date(), updatedAt: new Date(),
      fieldValues: initialFieldValues,
    };
    setTasks((prev) => [...prev, tempTask]);
    startTransition(async () => {
      const created = await createTaskAction(firstGroupId, title);
      if (statusCol) await upsertTaskField(created.id, statusCol.id, statusValue);
      if (owner && ownerCol) await upsertTaskField(created.id, ownerCol.id, owner);
      if (dueDate && dueDateCol) await upsertTaskField(created.id, dueDateCol.id, dueDate);
      const extraFields: TaskWithFields["fieldValues"] = [];
      if (statusCol) extraFields.push({ id: `opt-${statusCol.id}`, taskId: created.id, columnId: statusCol.id, value: statusValue, updatedAt: new Date() });
      if (owner && ownerCol) extraFields.push({ id: `opt-${ownerCol.id}`, taskId: created.id, columnId: ownerCol.id, value: owner, updatedAt: new Date() });
      if (dueDate && dueDateCol) extraFields.push({ id: `opt-${dueDateCol.id}`, taskId: created.id, columnId: dueDateCol.id, value: dueDate, updatedAt: new Date() });
      const createdWithFields: TaskWithFields = {
        ...(created as TaskWithFields),
        fieldValues: [...(created as TaskWithFields).fieldValues, ...extraFields],
      };
      setTasks((prev) => prev.map((t) => (t.id === tempId ? createdWithFields : t)));
      router.refresh();
    });
  };

  // Open task lookup
  const findTaskInTree = (list: TaskWithFields[], taskId: string): TaskWithFields | null => {
    for (const task of list) {
      if (task.id === taskId) return task;
      const found = findTaskInTree((task.subtasks ?? []) as TaskWithFields[], taskId);
      if (found) return found;
    }
    return null;
  };
  const openTask = openTaskId ? findTaskInTree(tasks as TaskWithFields[], openTaskId) : null;
  const openGroupId = openTaskId ? (taskGroupMap.get(openTaskId) ?? firstGroupId) : null;
  const openGroup = openGroupId ? orderedGroups.find((g) => g.id === openGroupId) ?? null : null;

  if (!statusCol) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <p className="text-sm">{trKey(locale, "kanban.statusColumnDisabled")}</p>
        <p className="text-xs mt-1 text-gray-300">{trKey(locale, "kanban.statusColumnDisabledHint")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="sm:hidden px-1 pt-2.5 pb-1 overflow-x-auto overflow-y-hidden h-full">
        <div className="flex gap-2.5 h-full min-w-max snap-x snap-mandatory pr-1">
          {statusOptions.map((status) => {
            const colTasks = tasks.filter((t) => getStatus(t) === status.value);
            const tasksByGroup = new Map<string, TaskWithFields[]>();
            colTasks.forEach((task) => {
              const gid = task.groupId ?? firstGroupId;
              if (!gid) return;
              const bucket = tasksByGroup.get(gid) ?? [];
              bucket.push(task);
              tasksByGroup.set(gid, bucket);
            });
            return (
              <section
                key={status.value}
                className="mobile-surface-soft snap-start rounded-[20px] p-2.5 w-[82vw] max-w-[340px] min-w-[15rem] h-full flex flex-col"
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${status.color}`}>
                    {status.label}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums">{colTasks.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {orderedGroups.map((group) => {
                    const grouped = tasksByGroup.get(group.id) ?? [];
                    if (grouped.length === 0) return null;
                    const groupKey = mobileGroupKey(status.value, group.id);
                    const groupExpanded = mobileExpandedGroups.has(groupKey);
                    const groupedPreview = grouped.slice(0, 2);
                    return (
                      <div key={`${status.value}-${group.id}`} className="space-y-1.5 rounded-lg border border-gray-200/80 dark:border-gray-700/80 bg-white/70 dark:bg-gray-900/40 overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setMobileExpandedGroups((prev) => {
                              const next = new Set(prev);
                              if (next.has(groupKey)) next.delete(groupKey);
                              else next.add(groupKey);
                              return next;
                            })
                          }
                          className="w-full px-2 py-1.5 text-left flex items-center gap-2 border-b border-gray-200/70 dark:border-gray-700/70 cursor-pointer"
                        >
                          <svg
                            className={`w-3 h-3 text-gray-400 transition-transform ${groupExpanded ? "" : "-rotate-90"}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold truncate flex-1">
                            {group.name}
                          </div>
                          <span className="text-[10px] text-gray-400 tabular-nums">{grouped.length}</span>
                        </button>
                        <div className="px-2 pb-1.5">
                          {groupPathById.get(group.id) && (
                            <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate pt-1">{groupPathById.get(group.id)}</div>
                          )}
                        </div>
                        {groupExpanded ? (
                          <div className="space-y-2 px-1 pb-1.5">
                            {grouped.map((task) => (
                              <div key={task.id}>
                                <KanbanCard
                                  task={task}
                                  columns={columns}
                                  isDragging={false}
                                  onDragStart={() => {}}
                                  onOpen={() => setOpenTaskId(task.id)}
                                  onDelete={() => setArchiveConfirmId(task.id)}
                                  onSubtaskToggle={(subtaskId) => handleSubtaskDone(task.id, subtaskId)}
                                  locale={locale}
                                  draggableEnabled={false}
                                  mobile
                                />
                                <div className="mt-1.5 px-1">
                                  <select
                                    value={getStatus(task)}
                                    onChange={(e) => handleMoveTask(task.id, e.target.value)}
                                    className="w-full select-unified select-unified-sm"
                                  >
                                    {statusOptions.map((opt) => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-2 pb-2">
                            {groupedPreview.map((task) => (
                              <p key={task.id} className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                                • {task.title}
                              </p>
                            ))}
                            {grouped.length > groupedPreview.length && (
                              <p className="text-[11px] text-indigo-500 dark:text-indigo-300 mt-0.5">
                                +{grouped.length - groupedPreview.length} {locale === "fr" ? "autres tâches" : "more tasks"}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {colTasks.length === 0 && (
                    <div className="flex items-center justify-center py-4">
                      <span className="text-xs text-gray-300">{trKey(locale, "common.noTask")}</span>
                    </div>
                  )}
                </div>
                <div className="pt-2.5 mt-2 border-t border-gray-100 dark:border-gray-700">
                  <AddTaskInline locale={locale} columns={columns} onAdd={handleAddTask(status.value)} />
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="hidden sm:flex gap-3 p-5 overflow-x-auto h-full items-start">
        {statusOptions.map((status) => {
          const colTasks = tasks.filter((t) => getStatus(t) === status.value);
          const tasksByGroup = new Map<string, TaskWithFields[]>();
          colTasks.forEach((task) => {
            const gid = task.groupId ?? firstGroupId;
            if (!gid) return;
            const bucket = tasksByGroup.get(gid) ?? [];
            bucket.push(task);
            tasksByGroup.set(gid, bucket);
          });
          const isOver = dragOverCol === status.value;

          return (
            <div
              key={status.value}
              className="flex flex-col flex-shrink-0 w-[260px]"
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(status.value); }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverCol(null);
                }
              }}
              onDrop={(e) => { e.preventDefault(); handleDrop(status.value); }}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${status.color}`}>
                  {status.label}
                </span>
                <span className="text-xs text-gray-400 tabular-nums">{colTasks.length}</span>
              </div>

              {/* Drop zone */}
              <div
                className={[
                  "flex flex-col gap-2 min-h-[80px] rounded-xl p-2 transition-colors",
                  isOver ? "bg-indigo-50 dark:bg-indigo-900/20 border border-dashed border-indigo-300" : "bg-gray-50/60 dark:bg-gray-800/40",
                ].join(" ")}
              >
                {orderedGroups.map((group) => {
                  const grouped = tasksByGroup.get(group.id) ?? [];
                  if (grouped.length === 0) return null;
                  return (
                    <div key={`${status.value}-${group.id}`} className="space-y-2">
                      <div className="space-y-0.5 px-1">
                        <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-semibold">{group.name}</div>
                        {groupPathById.get(group.id) && (
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{groupPathById.get(group.id)}</div>
                        )}
                      </div>
                      {grouped.map((task) => (
                        <KanbanCard
                          key={task.id}
                          task={task}
                          columns={columns}
                          isDragging={draggingId === task.id}
                          onDragStart={() => setDraggingId(task.id)}
                          onOpen={() => setOpenTaskId(task.id)}
                          onDelete={() => setArchiveConfirmId(task.id)}
                          onSubtaskToggle={(subtaskId) => handleSubtaskDone(task.id, subtaskId)}
                          locale={locale}
                        />
                      ))}
                    </div>
                  );
                })}

                {/* Empty state */}
                {colTasks.length === 0 && !isOver && (
                  <div className="flex items-center justify-center py-4">
                    <span className="text-xs text-gray-300">{trKey(locale, "common.noTask")}</span>
                  </div>
                )}
              </div>

              {/* Add task */}
              <div className="mt-2 px-1">
                <AddTaskInline locale={locale} columns={columns} onAdd={handleAddTask(status.value)} />
              </div>
            </div>
          );
        })}
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

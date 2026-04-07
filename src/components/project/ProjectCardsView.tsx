"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { getUiLocale } from "@/lib/ui-locale";
import { usePathname, useRouter } from "next/navigation";
import type { ProjectWithRelations, GroupWithTasks, TaskWithFields } from "@/lib/types";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/lib/constants";
import { getFieldValue, RecurrenceIcon } from "./cells";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { useProjectContext } from "./ProjectContext";
import { localeFromPathname, tr } from "@/lib/i18n/client";
import type { AppLocale } from "@/i18n/config";
import {
  createTask as createTaskAction,
  updateTaskTitle as updateTaskTitleAction,
  upsertTaskField,
  archiveTask as archiveTaskAction,
} from "@/lib/actions";
import { toCanonicalStatus } from "@/lib/status";
import { composeDateTimeValue, splitDateTimeValue } from "@/lib/task-schedule";

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
  isCompleting?: boolean;
  locale: AppLocale;
  mobile?: boolean;
}) {
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

  const { memberAvatars } = useProjectContext();
  const statusMeta = STATUS_OPTIONS.find((o) => o.value === statusVal);
  const priorityMeta = PRIORITY_OPTIONS.find((o) => o.value === priorityVal);
  const isDone = toCanonicalStatus(statusVal) === "DONE" || Boolean(isCompleting);

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
      className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-300 cursor-pointer group/card relative ${
        isCompleting ? "opacity-50 bg-emerald-50/60 dark:bg-emerald-900/10" : ""
      }`}
    >
      {/* Color accent */}
      <div
        className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full opacity-0 group-hover/card:opacity-100 transition-opacity"
        style={{ backgroundColor: groupColor }}
      />

      {/* Title + complete toggle */}
      <div className="flex items-start gap-2.5 mb-3 pr-5">
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
            title={isDone ? tr(locale, "Marquée terminée", "Marked as completed") : tr(locale, "Marquer comme terminée", "Mark as completed")}
          >
            {isDone ? (
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </button>
        ) : null}
        <p
          className={`text-sm font-medium leading-snug min-w-0 transition-all ${
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
        title={tr(locale, "Archiver", "Archive")}
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
      {(subtaskCount > 0 || attachCount > 0 || depCount > 0 || hasNotes || commentCount > 0) && (
        <div className="flex items-center gap-2.5 mb-2 text-gray-400 dark:text-gray-500">
          {subtaskCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${subtaskCount} ${tr(locale, "sous-tâche", "subtask")}${subtaskCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {subtaskCount}
            </span>
          )}
          {attachCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${attachCount} ${tr(locale, "pièce jointe", "attachment")}${attachCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {attachCount}
            </span>
          )}
          {depCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${depCount} ${tr(locale, "dépendance", "dependency")}${depCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.102-1.101" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {depCount}
            </span>
          )}
          {hasNotes && (
            <span title={tr(locale, "Note", "Note")} className="flex items-center">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          )}
          {commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${commentCount} ${tr(locale, "commentaire", "comment")}${commentCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {commentCount}
            </span>
          )}
        </div>
      )}

      {/* Meta row */}
      {(ownerVal || dueDateVal) && (
        <div className="flex items-center justify-between gap-2 mt-1">
          {ownerVal ? (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full flex-shrink-0 overflow-hidden">
                {memberAvatars[ownerVal] ? (
                  <img src={memberAvatars[ownerVal]!} alt={ownerVal} className="w-full h-full object-cover rounded-full" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-[10px] font-semibold text-indigo-600 uppercase">{ownerVal.charAt(0)}</span>
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-500 truncate max-w-[80px]">{ownerVal}</span>
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
  const { memberNames } = useProjectContext();

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
    const dueValue = newDueDate ? composeDateTimeValue(newDueDate, newDueTime || null) : "";
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
          placeholder={tr(locale, "Nom de la tâche…", "Task name...")}
          className="w-full text-sm text-gray-800 dark:text-gray-100 outline-none bg-transparent placeholder-gray-400 dark:placeholder-gray-500"
        />
        {ownerColId && memberNames.length > 0 && (
          <select
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            className="w-full select-unified select-unified-sm"
          >
            <option value="">{tr(locale, "Responsable…", "Owner...")}</option>
            {memberNames.map((name) => (
              <option key={name} value={name}>{name}</option>
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
              className="w-full datetime-field"
            />
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={submit}
            className="flex-1 text-xs bg-indigo-500 text-white rounded-md py-1 hover:bg-indigo-600 transition-colors cursor-pointer"
          >
            {tr(locale, "Ajouter", "Add")}
          </button>
          <button
            onClick={() => { setDraft(""); setNewOwner(""); setNewDueDate(""); setNewDueTime(""); setActive(false); }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 cursor-pointer"
          >
            {tr(locale, "Annuler", "Cancel")}
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
      {tr(locale, "Ajouter une tâche", "Add task")}
    </button>
  );
}

// --- Main ---
export function ProjectCardsView({ project }: { project: ProjectWithRelations }) {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname);
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
    const tempId = `temp-${Date.now()}`;
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
  const openGroup = openTaskId
    ? visibleGroups.find((g) => g.tasks.some((t) => t.id === openTaskId)) ?? null
    : null;
  const openTask = openGroup?.tasks.find((t) => t.id === openTaskId) ?? null;

  return (
    <>
      <div className="sm:hidden p-3 space-y-3 overflow-y-auto h-full">
        {visibleGroups.map((group) => (
          <section key={group.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex-1">
                {group.name}
              </span>
              <span className="text-[11px] text-gray-400 tabular-nums">{group.tasks.length}</span>
            </div>

            <div className="space-y-2.5">
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
                  isCompleting={completingTasks.has(task.id)}
                  locale={locale}
                  mobile
                />
              ))}
              <AddTaskCard locale={locale} columns={columns} onAdd={(title, owner, dueDate) => handleAddTask(group.id, title, owner, dueDate)} />
            </div>
          </section>
        ))}

        {visibleGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
              <rect x="13" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
            </svg>
            <p className="text-sm">{tr(locale, "Aucun groupe dans ce projet.", "No group in this project.")}</p>
          </div>
        )}
      </div>

      <div className="hidden sm:block">
      {/* Layout toggle */}
      <div className="flex justify-end px-4 pt-3 pb-1">
        <button
          onClick={toggleLayout}
          title={isRowsLayout ? tr(locale, "Vue par colonnes", "Column view") : tr(locale, "Vue en lignes", "Row view")}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
        >
          {isRowsLayout ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="5" width="8" height="14" rx="1.5" strokeWidth="1.5" />
                <rect x="13" y="5" width="8" height="14" rx="1.5" strokeWidth="1.5" />
              </svg>
              {tr(locale, "Colonnes", "Columns")}
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M3 6h18M3 12h18M3 18h18" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {tr(locale, "Lignes", "Rows")}
            </>
          )}
        </button>
      </div>

      {isRowsLayout ? (
        /* Rows layout: transposed from columns -> each category becomes one horizontal row */
        <div className="p-4 pt-2 space-y-4 overflow-y-auto h-full">
          {visibleGroups.map((group) => (
            <div key={group.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{group.name}</span>
                <span className="text-[11px] text-gray-400 tabular-nums ml-1">{group.tasks.length}</span>
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
          {visibleGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 w-full">
              <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
                <rect x="13" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
              </svg>
              <p className="text-sm">{tr(locale, "Aucun groupe dans ce projet.", "No group in this project.")}</p>
            </div>
          )}
        </div>
      ) : (
      <div className="flex gap-4 p-4 pt-2 overflow-x-auto h-full items-start pb-4">
        {visibleGroups.map((group) => (
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
              <span className="text-[11px] text-gray-400 tabular-nums">{group.tasks.length}</span>
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
                  isCompleting={completingTasks.has(task.id)}
                  locale={locale}
                />
              ))}
              <AddTaskCard locale={locale} columns={columns} onAdd={(title, owner, dueDate) => handleAddTask(group.id, title, owner, dueDate)} />
            </div>
          </div>
        ))}

        {visibleGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400 w-full">
            <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
              <rect x="13" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
            </svg>
            <p className="text-sm">{tr(locale, "Aucun groupe dans ce projet.", "No group in this project.")}</p>
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
            <p className="text-sm font-medium text-gray-900 dark:text-gray-50 mb-1">{tr(locale, "Archiver cette tâche ?", "Archive this task?")}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{tr(locale, "La tâche sera déplacée dans les archives du projet.", "The task will be moved to project archives.")}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setArchiveConfirmId(null)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer">{tr(locale, "Annuler", "Cancel")}</button>
              <button onClick={() => handleArchiveTask(archiveConfirmId)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer">{tr(locale, "Archiver", "Archive")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

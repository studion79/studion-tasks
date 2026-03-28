"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ProjectWithRelations, TaskWithFields } from "@/lib/types";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/lib/constants";
import { getFieldValue, RecurrenceIcon } from "./cells";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { useProjectContext } from "./ProjectContext";
import {
  createTask as createTaskAction,
  updateTaskTitle as updateTaskTitleAction,
  upsertTaskField,
  archiveTask as archiveTaskAction,
} from "@/lib/actions";

// --- Kanban card ---
function KanbanCard({
  task,
  columns,
  isDragging,
  onDragStart,
  onOpen,
  onDelete,
}: {
  task: TaskWithFields;
  columns: ProjectWithRelations["columns"];
  isDragging: boolean;
  onDragStart: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
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

  const { memberAvatars } = useProjectContext();
  const priorityMeta = PRIORITY_OPTIONS.find((o) => o.value === priorityVal);

  const isOverdue = dueDateVal
    ? new Date(dueDateVal) < new Date(new Date().toDateString())
    : false;

  const formatDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });

  return (
    <div
      draggable
      onDragStart={(e) => {
        onDragStart();
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      className={[
        "bg-white dark:bg-gray-800 border rounded-xl p-3.5 cursor-grab active:cursor-grabbing",
        "hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all group/kcard select-none",
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
          title="Supprimer"
          className="opacity-0 group-hover/kcard:opacity-100 p-0.5 rounded text-gray-300 hover:text-red-400 transition-all cursor-pointer flex-shrink-0 mt-0.5"
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
        <div className="flex items-center gap-2 mb-2 text-gray-400 dark:text-gray-500">
          {subtaskCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${subtaskCount} sous-tâche${subtaskCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {subtaskCount}
            </span>
          )}
          {attachCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${attachCount} pièce${attachCount > 1 ? "s" : ""} jointe${attachCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {attachCount}
            </span>
          )}
          {depCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${depCount} dépendance${depCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.102-1.101" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {depCount}
            </span>
          )}
          {hasNotes && (
            <span title="Note">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          )}
          {commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]" title={`${commentCount} commentaire${commentCount > 1 ? "s" : ""}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {commentCount}
            </span>
          )}
        </div>
      )}

      {/* Footer: owner + due date */}
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
              <span className="text-xs text-gray-400 truncate max-w-[70px]">{ownerVal}</span>
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
}: {
  onAdd: (title: string, owner?: string, dueDate?: string) => void;
  columns: ProjectWithRelations["columns"];
}) {
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
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
    setActive(false);
    if (t) onAdd(t, newOwner || undefined, newDueDate || undefined);
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
            if (e.key === "Escape") { setDraft(""); setNewOwner(""); setNewDueDate(""); setActive(false); }
          }}
          placeholder="Nom de la tâche…"
          className="w-full text-sm text-gray-800 dark:text-gray-100 outline-none placeholder-gray-400 dark:placeholder-gray-500 bg-transparent"
        />
        {ownerColId && memberNames.length > 0 && (
          <select
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            className="w-full text-xs text-gray-600 dark:text-gray-400 bg-transparent border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 outline-none"
          >
            <option value="">Responsable…</option>
            {memberNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
        {dueDateColId && (
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="w-full text-xs text-gray-600 dark:text-gray-400 bg-transparent border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 outline-none"
          />
        )}
        <div className="flex gap-2">
          <button
            onClick={submit}
            className="flex-1 text-xs bg-indigo-500 text-white rounded-md py-1 hover:bg-indigo-600 transition-colors cursor-pointer"
          >
            Ajouter
          </button>
          <button
            onClick={() => { setDraft(""); setNewOwner(""); setNewDueDate(""); setActive(false); }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 cursor-pointer"
          >
            Annuler
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
      Ajouter une tâche
    </button>
  );
}

// --- Main ---
export function ProjectKanbanView({ project }: { project: ProjectWithRelations }) {
  const { columns } = project;
  const statusCol = columns.find((c) => c.type === "STATUS") ?? null;

  // Flat list of all tasks across all groups
  const initialTasks = project.groups.flatMap((g) => g.tasks);
  // Map taskId → groupId for creating tasks in the right group
  const taskGroupMap = new Map(
    project.groups.flatMap((g) => g.tasks.map((t) => [t.id, g.id]))
  );
  const firstGroupId = project.groups[0]?.id ?? null;

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
  const [, startTransition] = useTransition();
  const router = useRouter();

  const getStatus = (task: TaskWithFields): string => {
    if (!statusCol) return "NOT_STARTED";
    return getFieldValue(task.fieldValues, statusCol.id) ?? "NOT_STARTED";
  };

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
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const rest = t.fieldValues.filter((fv) => fv.columnId !== columnId);
        return {
          ...t,
          fieldValues: value !== null
            ? [...rest, { id: `opt-${columnId}`, taskId, columnId, value, updatedAt: new Date() }]
            : rest,
        };
      })
    );
    startTransition(async () => {
      await upsertTaskField(taskId, columnId, value);
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
      position: 9999, archivedAt: null, completedAt: null, recurrence: null, createdAt: new Date(), updatedAt: new Date(),
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
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;
  const openGroupId = openTaskId ? (taskGroupMap.get(openTaskId) ?? firstGroupId) : null;
  const openGroup = openGroupId ? project.groups.find((g) => g.id === openGroupId) ?? null : null;

  if (!statusCol) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <p className="text-sm">La colonne "Status" n'est pas active dans ce projet.</p>
        <p className="text-xs mt-1 text-gray-300">Activez-la depuis les paramètres du projet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-3 p-5 overflow-x-auto h-full items-start">
        {STATUS_OPTIONS.map((status) => {
          const colTasks = tasks.filter((t) => getStatus(t) === status.value);
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
                {colTasks.map((task) => (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    columns={columns}
                    isDragging={draggingId === task.id}
                    onDragStart={() => setDraggingId(task.id)}
                    onOpen={() => setOpenTaskId(task.id)}
                    onDelete={() => setArchiveConfirmId(task.id)}
                  />
                ))}

                {/* Empty state */}
                {colTasks.length === 0 && !isOver && (
                  <div className="flex items-center justify-center py-4">
                    <span className="text-xs text-gray-300">Aucune tâche</span>
                  </div>
                )}
              </div>

              {/* Add task */}
              <div className="mt-2 px-1">
                <AddTaskInline columns={columns} onAdd={handleAddTask(status.value)} />
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
            <p className="text-sm font-medium text-gray-900 dark:text-gray-50 mb-1">Archiver cette tâche ?</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">La tâche sera déplacée dans les archives du projet.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setArchiveConfirmId(null)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer">Annuler</button>
              <button onClick={() => handleArchiveTask(archiveConfirmId)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer">Archiver</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

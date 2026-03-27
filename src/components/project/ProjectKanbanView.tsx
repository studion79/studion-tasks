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

  const priorityVal = priorityCol ? getFieldValue(task.fieldValues, priorityCol.id) : null;
  const dueDateVal = dueDateCol ? getFieldValue(task.fieldValues, dueDateCol.id) : null;
  const ownerVal = ownerCol ? getFieldValue(task.fieldValues, ownerCol.id) : null;

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
}: {
  onAdd: (title: string) => void;
}) {
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  const submit = () => {
    const t = draft.trim();
    setDraft("");
    setActive(false);
    if (t) onAdd(t);
  };

  if (active) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-indigo-300 rounded-xl p-3">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") { setDraft(""); setActive(false); }
          }}
          onBlur={submit}
          placeholder="Nom de la tâche…"
          className="w-full text-sm text-gray-800 dark:text-gray-100 outline-none placeholder-gray-400 dark:placeholder-gray-500 bg-transparent"
        />
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

  const handleAddTask = (statusValue: string) => async (title: string) => {
    if (!firstGroupId) return;
    const tempId = `temp-${Date.now()}`;
    const initialFieldValues = statusCol
      ? [{ id: `opt-${statusCol.id}`, taskId: tempId, columnId: statusCol.id, value: statusValue, updatedAt: new Date() }]
      : [];
    const tempTask: TaskWithFields = {
      id: tempId, groupId: firstGroupId, parentId: null, title,
      position: 9999, archivedAt: null, completedAt: null, recurrence: null, createdAt: new Date(), updatedAt: new Date(),
      fieldValues: initialFieldValues,
    };
    setTasks((prev) => [...prev, tempTask]);
    startTransition(async () => {
      const created = await createTaskAction(firstGroupId, title);
      // Set the status on the newly created task
      if (statusCol) {
        await upsertTaskField(created.id, statusCol.id, statusValue);
        const createdWithStatus: TaskWithFields = {
          ...(created as TaskWithFields),
          fieldValues: [
            ...(created as TaskWithFields).fieldValues,
            { id: `opt-${statusCol.id}`, taskId: created.id, columnId: statusCol.id, value: statusValue, updatedAt: new Date() },
          ],
        };
        setTasks((prev) => prev.map((t) => (t.id === tempId ? createdWithStatus : t)));
      } else {
        setTasks((prev) => prev.map((t) => (t.id === tempId ? (created as TaskWithFields) : t)));
      }
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
                <AddTaskInline onAdd={handleAddTask(status.value)} />
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

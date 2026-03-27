"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ProjectWithRelations, GroupWithTasks, TaskWithFields } from "@/lib/types";
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
}: {
  task: TaskWithFields;
  columns: ProjectWithRelations["columns"];
  groupColor: string;
  onOpen: () => void;
  onDelete: () => void;
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

  const { memberAvatars } = useProjectContext();
  const statusMeta = STATUS_OPTIONS.find((o) => o.value === statusVal);
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
      onClick={onOpen}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer group/card relative"
    >
      {/* Color accent */}
      <div
        className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full opacity-0 group-hover/card:opacity-100 transition-opacity"
        style={{ backgroundColor: groupColor }}
      />

      {/* Title */}
      <p className="text-sm font-medium text-gray-900 dark:text-gray-50 leading-snug mb-3 pr-5">
        {task.title}
      </p>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Supprimer"
        className="absolute top-3 right-3 opacity-0 group-hover/card:opacity-100 p-0.5 rounded text-gray-300 hover:text-red-400 transition-all cursor-pointer"
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
      {(subtaskCount > 0 || attachCount > 0 || depCount > 0 || hasNotes) && (
        <div className="flex items-center gap-2.5 mb-2 text-gray-400 dark:text-gray-500">
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
            <span title="Note" className="flex items-center">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
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
function AddTaskCard({ onAdd }: { onAdd: (title: string) => void }) {
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
      <div className="border border-indigo-300 bg-indigo-50/30 dark:bg-indigo-900/20 rounded-xl p-4">
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
          className="w-full text-sm text-gray-800 dark:text-gray-100 outline-none bg-transparent placeholder-gray-400 dark:placeholder-gray-500"
        />
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
      Ajouter une tâche
    </button>
  );
}

// --- Main ---
export function ProjectCardsView({ project }: { project: ProjectWithRelations }) {
  const { columns } = project;
  const [groups, setGroups] = useState<GroupWithTasks[]>(project.groups);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const handleFieldUpdate = (taskId: string, columnId: string, value: string | null) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        tasks: g.tasks.map((t) => {
          if (t.id !== taskId) return t;
          const rest = t.fieldValues.filter((fv) => fv.columnId !== columnId);
          return {
            ...t,
            fieldValues: value !== null
              ? [...rest, { id: `opt-${columnId}`, taskId, columnId, value, updatedAt: new Date() }]
              : rest,
          };
        }),
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

  const handleAddTask = (groupId: string, title: string) => {
    const tempId = `temp-${Date.now()}`;
    const tempTask: TaskWithFields = {
      id: tempId,
      groupId,
      parentId: null,
      title,
      position: 9999,
      archivedAt: null,
      completedAt: null,
      recurrence: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      fieldValues: [],
    };
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, tasks: [...g.tasks, tempTask] } : g))
    );
    startTransition(async () => {
      const created = await createTaskAction(groupId, title);
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

  // Derive open task for panel
  const openGroup = openTaskId
    ? groups.find((g) => g.tasks.some((t) => t.id === openTaskId)) ?? null
    : null;
  const openTask = openGroup?.tasks.find((t) => t.id === openTaskId) ?? null;

  return (
    <>
      <div className="p-6 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.id} className="mb-8">
            {/* Group header */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: group.color }}
              />
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {group.name}
              </span>
              <span className="text-[11px] text-gray-400 tabular-nums">{group.tasks.length}</span>
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {group.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  columns={columns}
                  groupColor={group.color}
                  onOpen={() => setOpenTaskId(task.id)}
                  onDelete={() => setArchiveConfirmId(task.id)}
                />
              ))}
              <AddTaskCard onAdd={(title) => handleAddTask(group.id, title)} />
            </div>
          </div>
        ))}

        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
              <rect x="13" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
            </svg>
            <p className="text-sm">Aucun groupe dans ce projet.</p>
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

"use client";

import { useState, useEffect, useRef, useTransition, useMemo } from "react";
import { getUiLocale } from "@/lib/ui-locale";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useProjectContext } from "./ProjectContext";
import type { TaskWithFields, SubtaskWithFields, ProjectColumn } from "@/lib/types";
import { getPriorityOptions, getStatusOptions } from "@/lib/constants";
import {
  getTaskComments, createComment,
  createSubtask, deleteSubtask, updateSubtaskTitle as updateSubtaskTitleAction,
  getTaskActivityLog,
  getTaskDependencies, addTaskDependency, removeTaskDependency, getProjectTasksLight,
  setTaskRecurrence, getTaskRecurrence,
  getTaskAttachments, uploadTaskAttachment, deleteTaskAttachment,
} from "@/lib/actions";
import type { RecurrenceConfig } from "@/lib/actions";
import {
  SelectCell,
  TextCell,
  DateCell,
  TimelineCell,
  OwnerCell,
  getFieldValue,
} from "./cells";
import { trKey } from "@/lib/i18n/client";
import { useClientLocale } from "@/lib/i18n/useClientLocale";
import { getDisplayColumnLabel } from "@/lib/i18n/columns";

type Comment = { id: string; author: string; content: string; createdAt: Date };

// --- Render comment content with @mention highlights ---
function CommentContent({ content, memberNames }: { content: string; memberNames: string[] }) {
  if (memberNames.length === 0) {
    return <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug whitespace-pre-wrap">{content}</p>;
  }
  // Build a regex from actual member names (longest first to avoid partial matches)
  const sorted = [...memberNames].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(@(?:${escaped.join("|")}))`, "gi");
  const parts = content.split(pattern);
  return (
    <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug whitespace-pre-wrap">
      {parts.map((part, i) => {
        const isMention =
          part.startsWith("@") &&
          memberNames.some((m) => m.toLowerCase() === part.slice(1).toLowerCase());
        return isMention ? (
          <span key={i} className="inline-flex items-center bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium rounded px-1 text-xs py-0.5 mx-0.5">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </p>
  );
}

// --- Dependencies section ---
type DepTask = { id: string; title: string };

// --- Recurrence section ---
function RecurrenceSection({ taskId, initialRecurrence }: { taskId: string; initialRecurrence: string | null }) {
  const locale = useClientLocale(usePathname());
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<RecurrenceConfig | null>(
    initialRecurrence ? (JSON.parse(initialRecurrence) as RecurrenceConfig) : null
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const FREQ_LABELS: Record<string, string> = {
    daily: trKey(locale, "task.recurrence.days"),
    weekly: trKey(locale, "task.recurrence.weeks"),
    monthly: trKey(locale, "task.recurrence.months"),
  };
  const formatFrDate = (date: string | null | undefined) =>
    date ? new Date(`${date}T00:00:00`).toLocaleDateString(getUiLocale()) : null;

  const persist = (newConfig: RecurrenceConfig | null) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStatus("saving");
    debounceRef.current = setTimeout(async () => {
      try {
        await setTaskRecurrence(taskId, newConfig);
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      } catch {
        setStatus("error");
      }
    }, 600);
  };

  const handleChange = (newConfig: RecurrenceConfig) => {
    setConfig(newConfig);
    persist(newConfig);
  };

  const handleEnable = () => {
    const defaultConfig: RecurrenceConfig = { frequency: "weekly", interval: 1 };
    setConfig(defaultConfig);
    persist(defaultConfig);
  };

  const handleRemove = async () => {
    setConfig(null);
    persist(null);
  };

  return (
    <div className="border-t border-gray-100 dark:border-gray-700">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50/60 dark:hover:bg-gray-700/40 transition-colors cursor-pointer"
      >
        <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {trKey(locale, "task.recurrence")}
        {config && (
          <span className="ml-1 text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-full px-2 py-0.5">
            {trKey(locale, "task.recurrence.every")} {config.interval} {FREQ_LABELS[config.frequency]}
            {config.endDate ? ` · fin ${formatFrDate(config.endDate)}` : ""}
          </span>
        )}
        <svg className={`w-3 h-3 ml-auto transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-2">
          {config ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-600 dark:text-gray-400">{trKey(locale, "task.recurrence.repeatEvery")}</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={config.interval}
                  onChange={(e) => handleChange({ ...config, interval: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-14 text-xs text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 outline-none focus:border-indigo-400 text-center"
                />
                <select
                  value={config.frequency}
                  onChange={(e) => handleChange({ ...config, frequency: e.target.value as RecurrenceConfig["frequency"] })}
                  className="select-unified select-unified-sm"
                >
                  <option value="daily">{trKey(locale, "task.recurrence.days")}</option>
                  <option value="weekly">{trKey(locale, "task.recurrence.weeks")}</option>
                  <option value="monthly">{trKey(locale, "task.recurrence.months")}</option>
                </select>
                <button
                  onClick={handleRemove}
                  className="ml-auto text-xs text-red-400 hover:text-red-600 transition-colors cursor-pointer"
                >
                  {trKey(locale, "common.delete")}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 dark:text-gray-400">{trKey(locale, "task.endDate")}</label>
                <input
                  type="date"
                  value={config.endDate ?? ""}
                  onChange={(e) => handleChange({ ...config, endDate: e.target.value || null })}
                  className="datetime-field"
                />
                {config.endDate && (
                  <button
                    onClick={() => handleChange({ ...config, endDate: null })}
                    className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
                  >
                    {trKey(locale, "task.infinite")}
                  </button>
                )}
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                {!config.endDate && trKey(locale, "task.recurrenceInfiniteHint")}
                {status === "saving" && trKey(locale, "task.saving")}
                {status === "saved" && trKey(locale, "task.saved")}
                {status === "error" && trKey(locale, "task.saveError")}
              </p>
            </>
          ) : (
            <button
              onClick={handleEnable}
              className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 4v16m8-8H4" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {trKey(locale, "task.configureRecurrence")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Attachments section ---
type AttachmentItem = { id: string; filename: string; filesize: number; mimetype: string; path: string; createdAt: Date };

function AttachmentsSection({ taskId }: { taskId: string }) {
  const locale = useClientLocale(usePathname());
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getTaskAttachments(taskId).then((rows) => {
      setAttachments(rows as AttachmentItem[]);
      setLoaded(true);
    });
  }, [taskId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const created = await uploadTaskAttachment(taskId, fd);
      setAttachments((prev) => [...prev, created as AttachmentItem]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    await deleteTaskAttachment(id);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} ${trKey(locale, "task.byte.b")}`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ${trKey(locale, "task.byte.kb")}`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} ${trKey(locale, "task.byte.mb")}`;
  };

  const isImage = (mime: string) => mime.startsWith("image/");

  return (
    <div className="border-t border-gray-100 dark:border-gray-700">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50/60 dark:hover:bg-gray-700/40 transition-colors cursor-pointer"
      >
        <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {trKey(locale, "task.attachments")}
        {loaded && attachments.length > 0 && (
          <span className="ml-1 text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 leading-none">
            {attachments.length}
          </span>
        )}
        <svg className={`w-3 h-3 ml-auto transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-2">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-2.5 group">
              {isImage(a.mimetype) ? (
                <img src={a.path} alt={a.filename} className="w-8 h-8 rounded object-cover flex-shrink-0 border border-gray-100 dark:border-gray-700" />
              ) : (
                <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <a href={a.path} download={a.filename} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium truncate block">
                  {a.filename}
                </a>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">{formatSize(a.filesize)}</p>
              </div>
              <button
                onClick={() => handleDelete(a.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-all cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}

          <div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={handleUpload}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 4v16m8-8H4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {uploading ? trKey(locale, "task.uploading") : trKey(locale, "task.addFile")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DependenciesSection({ taskId, projectId }: { taskId: string; projectId: string }) {
  const locale = useClientLocale(usePathname());
  const [blockedBy, setBlockedBy] = useState<DepTask[]>([]);
  const [blocking, setBlocking] = useState<DepTask[]>([]);
  const [allTasks, setAllTasks] = useState<{ id: string; title: string; groupId: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showAddBlockedBy, setShowAddBlockedBy] = useState(false);
  const [showAddBlocking, setShowAddBlocking] = useState(false);
  const [query, setQuery] = useState("");
  const [addingMode, setAddingMode] = useState<"blockedBy" | "blocking" | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!expanded || loaded) return;
    Promise.all([
      getTaskDependencies(taskId),
      getProjectTasksLight(projectId),
    ]).then(([deps, tasks]) => {
      setBlockedBy(deps.blockerDeps.map((d) => ({ id: d.blocker.id, title: d.blocker.title })));
      setBlocking(deps.blockedDeps.map((d) => ({ id: d.blocked.id, title: d.blocked.title })));
      setAllTasks(tasks);
      setLoaded(true);
    });
  }, [taskId, projectId, expanded, loaded]);

  // Reset when task changes
  useEffect(() => {
    setLoaded(false);
    setBlockedBy([]);
    setBlocking([]);
    setExpanded(false);
  }, [taskId]);

  const filteredTasks = allTasks.filter(
    (t) =>
      t.id !== taskId &&
      t.title.toLowerCase().includes(query.toLowerCase()) &&
      !blockedBy.some((d) => d.id === t.id) &&
      !blocking.some((d) => d.id === t.id)
  );

  const handleAdd = (targetId: string) => {
    if (!addingMode) return;
    const target = allTasks.find((t) => t.id === targetId);
    if (!target) return;

    if (addingMode === "blockedBy") {
      setBlockedBy((prev) => [...prev, target]);
      startTransition(async () => {
        await addTaskDependency(targetId, taskId);
      });
    } else {
      setBlocking((prev) => [...prev, target]);
      startTransition(async () => {
        await addTaskDependency(taskId, targetId);
      });
    }
    setQuery("");
    setAddingMode(null);
    setShowAddBlockedBy(false);
    setShowAddBlocking(false);
  };

  const handleRemoveBlockedBy = (blockerId: string) => {
    setBlockedBy((prev) => prev.filter((d) => d.id !== blockerId));
    startTransition(async () => {
      await removeTaskDependency(blockerId, taskId);
    });
  };

  const handleRemoveBlocking = (blockedId: string) => {
    setBlocking((prev) => prev.filter((d) => d.id !== blockedId));
    startTransition(async () => {
      await removeTaskDependency(taskId, blockedId);
    });
  };

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {trKey(locale, "task.dependencies")}
        {(blockedBy.length > 0 || blocking.length > 0) && (
          <span className="ml-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold rounded-full px-1.5">
            {blockedBy.length + blocking.length}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Bloqué par */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{trKey(locale, "task.blockedBy")}</span>
              <button
                onClick={() => { setAddingMode("blockedBy"); setShowAddBlockedBy((v) => !v); setShowAddBlocking(false); setQuery(""); }}
                className="text-[10px] text-indigo-500 hover:text-indigo-700 cursor-pointer"
              >
                + {trKey(locale, "common.add")}
              </button>
            </div>
            {blockedBy.length === 0 && !showAddBlockedBy && (
              <p className="text-xs text-gray-300 dark:text-gray-600 italic">{trKey(locale, "task.noBlocker")}</p>
            )}
            {blockedBy.map((dep) => (
              <div key={dep.id} className="flex items-center gap-1.5 py-0.5 group">
                <div className="w-4 h-4 rounded-sm bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-2.5 h-2.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 15V9m0 0l-3 3m3-3l3 3" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">{dep.title}</span>
                <button
                  onClick={() => handleRemoveBlockedBy(dep.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 dark:text-gray-600 hover:text-red-500 transition-all cursor-pointer"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
            {showAddBlockedBy && (
              <DepSearchBox
                query={query}
                setQuery={setQuery}
                tasks={filteredTasks}
                onSelect={handleAdd}
                onCancel={() => { setShowAddBlockedBy(false); setAddingMode(null); }}
              />
            )}
          </div>

          {/* Bloque */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{trKey(locale, "task.blocks")}</span>
              <button
                onClick={() => { setAddingMode("blocking"); setShowAddBlocking((v) => !v); setShowAddBlockedBy(false); setQuery(""); }}
                className="text-[10px] text-indigo-500 hover:text-indigo-700 cursor-pointer"
              >
                + {trKey(locale, "common.add")}
              </button>
            </div>
            {blocking.length === 0 && !showAddBlocking && (
              <p className="text-xs text-gray-300 dark:text-gray-600 italic">{trKey(locale, "task.blocksNone")}</p>
            )}
            {blocking.map((dep) => (
              <div key={dep.id} className="flex items-center gap-1.5 py-0.5 group">
                <div className="w-4 h-4 rounded-sm bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-2.5 h-2.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 9v6m0 0l-3-3m3 3l3-3" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">{dep.title}</span>
                <button
                  onClick={() => handleRemoveBlocking(dep.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 dark:text-gray-600 hover:text-red-500 transition-all cursor-pointer"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
            {showAddBlocking && (
              <DepSearchBox
                query={query}
                setQuery={setQuery}
                tasks={filteredTasks}
                onSelect={handleAdd}
                onCancel={() => { setShowAddBlocking(false); setAddingMode(null); }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DepSearchBox({
  query,
  setQuery,
  tasks,
  onSelect,
  onCancel,
}: {
  query: string;
  setQuery: (q: string) => void;
  tasks: { id: string; title: string }[];
  onSelect: (id: string) => void;
  onCancel: () => void;
}) {
  const locale = useClientLocale(usePathname());
  return (
    <div className="mt-1.5 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        placeholder={trKey(locale, "task.searchTask")}
        className="w-full px-3 py-1.5 text-xs text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 outline-none placeholder-gray-400 dark:placeholder-gray-500"
      />
      <div className="max-h-32 overflow-y-auto bg-white dark:bg-gray-800">
        {tasks.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic px-3 py-2">{trKey(locale, "task.noMatchingTask")}</p>
        ) : (
          tasks.slice(0, 8).map((t) => (
            <button
              key={t.id}
              onMouseDown={() => onSelect(t.id)}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors cursor-pointer"
            >
              {t.title}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// --- Activity log section ---
function ActivitySection({ taskId }: { taskId: string }) {
  const locale = useClientLocale(usePathname());
  const ACTION_LABELS: Record<string, string> = {
    CREATED: trKey(locale, "task.activity.created"),
    TITLE_UPDATED: trKey(locale, "task.activity.titleUpdated"),
    FIELD_UPDATED: trKey(locale, "task.activity.fieldUpdated"),
    ARCHIVED: trKey(locale, "task.activity.archived"),
    COMMENT_ADDED: trKey(locale, "task.activity.commentAdded"),
  };
  type LogEntry = { id: string; action: string; actor: string; details: string | null; createdAt: Date };
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLogs([]);
    setLoaded(false);
    if (!expanded) return;
    getTaskActivityLog(taskId).then((l) => {
      setLogs(l as LogEntry[]);
      setLoaded(true);
    });
  }, [taskId, expanded]);

  const fmt = (d: Date | string) => new Date(d).toLocaleDateString(getUiLocale(), {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  const describe = (log: LogEntry) => {
    const base = ACTION_LABELS[log.action] ?? log.action;
    if (log.action === "FIELD_UPDATED" && log.details) {
      try {
        const d = JSON.parse(log.details);
        return `${trKey(locale, "task.activity.updated")} "${d.field}"${d.value ? ` → ${d.value}` : trKey(locale, "task.activity.cleared")}`;
      } catch { /* ignore */ }
    }
    return base;
  };

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {trKey(locale, "task.activity")}
      </button>

      {expanded && (
        <div className="space-y-2">
          {!loaded ? (
            <p className="text-xs text-gray-300 dark:text-gray-600 italic">{trKey(locale, "project.loading")}</p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">{trKey(locale, "task.noActivity")}</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[8px] font-bold text-gray-400 dark:text-gray-500">{log.actor.charAt(0).toUpperCase()}</span>
                </div>
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-gray-600 dark:text-gray-300">{log.actor}</span>
                  {" "}{describe(log)}
                </span>
                <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">{fmt(log.createdAt)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// --- Comments section ---
function CommentsSection({ taskId }: { taskId: string }) {
  const locale = useClientLocale(usePathname());
  const { data: session } = useSession();
  const { memberNames, memberAvatars } = useProjectContext();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);

  useEffect(() => {
    setLoaded(false);
    setComments([]);
    getTaskComments(taskId).then((c) => {
      setComments(c as Comment[]);
      setLoaded(true);
    });
  }, [taskId]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    const author = session?.user?.name ?? trKey(locale, "task.me");
    setDraft("");
    setMentionQuery(null);
    const temp: Comment = {
      id: `temp-${Date.now()}`,
      author,
      content: text,
      createdAt: new Date(),
    };
    setComments((prev) => [...prev, temp]);
    startTransition(async () => {
      const created = await createComment(taskId, text, author);
      setComments((prev) =>
        prev.map((c) => (c.id === temp.id ? (created as Comment) : c))
      );
    });
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    setDraft(val);
    // Detect @mention: find last @ before cursor
    const before = val.slice(0, cursor);
    const atIdx = before.lastIndexOf("@");
    if (atIdx !== -1) {
      const query = before.slice(atIdx + 1);
      // Keep autocomplete open as long as at least one member matches the prefix
      const hasCandidate = memberNames.some((n) =>
        n.toLowerCase().startsWith(query.toLowerCase())
      );
      if (hasCandidate) {
        setMentionQuery(query);
        setMentionStart(atIdx);
      } else {
        setMentionQuery(null);
      }
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (name: string) => {
    const before = draft.slice(0, mentionStart);
    const after = draft.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const newDraft = `${before}@${name} ${after}`;
    setDraft(newDraft);
    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return [];
    return memberNames.filter((n) => n.toLowerCase().startsWith(mentionQuery.toLowerCase()));
  }, [memberNames, mentionQuery]);

  const formatTime = (d: Date | string) => {
    const date = new Date(d);
    return date.toLocaleDateString(getUiLocale(), {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const authorInitial = session?.user?.name?.charAt(0).toUpperCase() ?? "M";
  const authorAvatar = session?.user?.image ?? null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
      <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
        {trKey(locale, "task.comments")}
      </p>

      {/* Comment list */}
      {loaded && comments.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic mb-3">{trKey(locale, "task.noCommentsYet")}</p>
      )}
      <div className="space-y-3 mb-3">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5 overflow-hidden">
              {memberAvatars[c.author] ? (
                <img src={memberAvatars[c.author]!} alt={c.author} className="w-full h-full object-cover rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">{c.author.charAt(0)}</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">{c.author}</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatTime(c.createdAt)}</span>
              </div>
              <CommentContent content={c.content} memberNames={memberNames} />
            </div>
          </div>
        ))}
      </div>

      {/* New comment input */}
      <div className="flex gap-2.5">
        <div className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5 overflow-hidden">
          {authorAvatar ? (
            <img src={authorAvatar} alt="moi" className="w-full h-full object-cover rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">{authorInitial}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 relative">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={handleTextareaChange}
            onKeyDown={(e) => {
              if (mentionQuery !== null && filteredMembers.length > 0) {
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  insertMention(filteredMembers[0]);
                  return;
                }
                if (e.key === "Escape") { setMentionQuery(null); return; }
              }
              if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={memberNames.length > 0 ? trKey(locale, "task.commentWithMention") : trKey(locale, "task.commentEnterToSend")}
            rows={2}
            className="w-full text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-gray-600 transition-colors resize-none placeholder-gray-300 dark:placeholder-gray-500"
          />

          {/* @mention dropdown */}
          {mentionQuery !== null && filteredMembers.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 z-50 w-48">
              {filteredMembers.slice(0, 6).map((name) => (
                <button
                  key={name}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(name); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <span className="w-5 h-5 rounded-full flex-shrink-0 overflow-hidden">
                    {memberAvatars[name] ? (
                      <img src={memberAvatars[name]!} alt={name} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold text-[10px] flex items-center justify-center">
                        {name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="font-medium">{name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Notes textarea ---
function NotesField({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const locale = useClientLocale(usePathname());
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed !== (value ?? "")) onSave(trimmed || null);
  };

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      placeholder={trKey(locale, "task.addNotes")}
      rows={4}
      className="w-full text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-gray-600 transition-colors resize-none placeholder-gray-300 dark:placeholder-gray-500"
    />
  );
}

// --- Subtasks section ---
function SubtasksSection({
  parentId,
  groupId,
  initialSubtasks,
  statusColId,
}: {
  parentId: string;
  groupId: string;
  initialSubtasks: SubtaskWithFields[];
  statusColId: string | null;
}) {
  const locale = useClientLocale(usePathname());
  const [subtasks, setSubtasks] = useState<SubtaskWithFields[]>(initialSubtasks);
  const [draft, setDraft] = useState("");
  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (addingParentId) inputRef.current?.focus();
  }, [addingParentId]);

  useEffect(() => {
    setSubtasks(initialSubtasks);
  }, [parentId, initialSubtasks]);

  const getSubtaskStatus = (s: SubtaskWithFields) =>
    statusColId ? s.fieldValues.find((fv) => fv.columnId === statusColId)?.value ?? null : null;

  const mapSubtaskTree = (
    nodes: SubtaskWithFields[],
    updater: (node: SubtaskWithFields) => SubtaskWithFields
  ): SubtaskWithFields[] =>
    nodes.map((node) => {
      const updated = updater(node);
      const nextChildren = mapSubtaskTree((updated.subtasks ?? []) as SubtaskWithFields[], updater);
      return { ...updated, subtasks: nextChildren };
    });

  const findSubtask = (
    nodes: SubtaskWithFields[],
    taskId: string
  ): SubtaskWithFields | null => {
    for (const node of nodes) {
      if (node.id === taskId) return node;
      const found = findSubtask((node.subtasks ?? []) as SubtaskWithFields[], taskId);
      if (found) return found;
    }
    return null;
  };

  const removeSubtaskTree = (
    nodes: SubtaskWithFields[],
    taskId: string
  ): SubtaskWithFields[] =>
    nodes
      .filter((node) => node.id !== taskId)
      .map((node) => ({
        ...node,
        subtasks: removeSubtaskTree((node.subtasks ?? []) as SubtaskWithFields[], taskId),
      }));

  const insertSubtaskUnderParent = (
    nodes: SubtaskWithFields[],
    targetParentId: string,
    child: SubtaskWithFields
  ): SubtaskWithFields[] =>
    nodes.map((node) => {
      if (node.id === targetParentId) {
        return { ...node, subtasks: [...((node.subtasks ?? []) as SubtaskWithFields[]), child] };
      }
      return {
        ...node,
        subtasks: insertSubtaskUnderParent(
          (node.subtasks ?? []) as SubtaskWithFields[],
          targetParentId,
          child
        ),
      };
    });

  const countDone = (nodes: SubtaskWithFields[]): number =>
    nodes.reduce((acc, node) => {
      const selfDone = getSubtaskStatus(node) === "DONE" ? 1 : 0;
      return acc + selfDone + countDone((node.subtasks ?? []) as SubtaskWithFields[]);
    }, 0);

  const countAll = (nodes: SubtaskWithFields[]): number =>
    nodes.reduce((acc, node) => acc + 1 + countAll((node.subtasks ?? []) as SubtaskWithFields[]), 0);

  const handleToggle = (subtaskId: string) => {
    if (!statusColId) return;
    const sub = findSubtask(subtasks, subtaskId);
    if (!sub) return;
    const isDone = getSubtaskStatus(sub) === "DONE";
    const newStatus = isDone ? "NOT_STARTED" : "DONE";
    setSubtasks((prev) =>
      mapSubtaskTree(prev, (s) => {
        if (s.id !== subtaskId) return s;
        const rest = s.fieldValues.filter((fv) => fv.columnId !== statusColId);
        return {
          ...s,
          fieldValues: [
            ...rest,
            {
              id: `opt-${statusColId}`,
              taskId: subtaskId,
              columnId: statusColId,
              value: newStatus,
              updatedAt: new Date(),
            },
          ],
        };
      })
    );
    startTransition(async () => {
      const { upsertTaskField } = await import("@/lib/actions");
      await upsertTaskField(subtaskId, statusColId, newStatus);
      router.refresh();
    });
  };

  const handleDelete = (subtaskId: string) => {
    setSubtasks((prev) => removeSubtaskTree(prev, subtaskId));
    startTransition(async () => {
      await deleteSubtask(subtaskId);
      router.refresh();
    });
  };

  const handleRename = (subtaskId: string) => {
    const title = editDraft.trim();
    setEditingId(null);
    setEditDraft("");
    if (!title) return;
    setSubtasks((prev) =>
      mapSubtaskTree(prev, (s) => (s.id === subtaskId ? { ...s, title } : s))
    );
    startTransition(async () => { await updateSubtaskTitleAction(subtaskId, title); });
  };

  const handleAdd = (keepInputOpen = true) => {
    const title = draft.trim();
    const currentParentId = addingParentId ?? parentId;
    const currentParent =
      currentParentId === parentId ? null : findSubtask(subtasks, currentParentId);
    const currentPosition =
      currentParentId === parentId
        ? subtasks.length
        : ((currentParent?.subtasks ?? []) as SubtaskWithFields[]).length;
    setDraft("");
    if (!title) {
      if (!keepInputOpen) setAddingParentId(null);
      return;
    }
    const tempId = `temp-sub-${Date.now()}`;
    const temp: SubtaskWithFields = {
      id: tempId, groupId, parentId: currentParentId, title,
      position: currentPosition, archivedAt: null, completedAt: null, reminderOffsetMinutes: null, reminderSentFor: null, recurrence: null, createdAt: new Date(), updatedAt: new Date(),
      fieldValues: [],
      subtasks: [],
    };
    setSubtasks((prev) =>
      currentParentId === parentId
        ? [...prev, temp]
        : insertSubtaskUnderParent(prev, currentParentId, temp)
    );
    startTransition(async () => {
      const created = await createSubtask(currentParentId, groupId, title);
      setSubtasks((prev) =>
        mapSubtaskTree(prev, (s) => (s.id === tempId ? ({ ...(created as SubtaskWithFields), subtasks: [] }) : s))
      );
      router.refresh();
      if (keepInputOpen) {
        setAddingParentId(currentParentId);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else {
        setAddingParentId(null);
      }
    });
  };

  const doneCount = countDone(subtasks);
  const totalCount = countAll(subtasks);

  const renderAddRow = (depth: number) => (
    <div className="flex items-center gap-2 mt-1" style={{ paddingLeft: `${depth * 16}px` }}>
      <div className="w-4 h-4 min-w-4 min-h-4 rounded-full border border-gray-200 dark:border-gray-600 flex-shrink-0" />
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd(true);
          }
          if (e.key === "Escape") {
            setDraft("");
            setAddingParentId(null);
          }
        }}
        onBlur={() => handleAdd(false)}
        placeholder={trKey(locale, "task.subtaskTitle")}
        className="flex-1 text-sm text-gray-700 dark:text-gray-300 outline-none border-b border-indigo-300 pb-0.5 bg-transparent placeholder-gray-300 dark:placeholder-gray-600 focus:placeholder-gray-200"
      />
    </div>
  );

  const renderSubtasks = (nodes: SubtaskWithFields[], depth = 0) =>
    nodes.map((sub) => {
      const done = getSubtaskStatus(sub) === "DONE";
      const children = (sub.subtasks ?? []) as SubtaskWithFields[];
      return (
        <div key={sub.id}>
          <div className="flex items-center gap-2 group/sub py-0.5" style={{ paddingLeft: `${depth * 16}px` }}>
            <button
              onClick={() => handleToggle(sub.id)}
              className={`w-4 h-4 min-w-4 min-h-4 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${done ? "bg-indigo-500 border-indigo-500" : "border-gray-300 dark:border-gray-600 hover:border-indigo-400"}`}
            >
              {done && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            {editingId === sub.id ? (
              <input
                autoFocus
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename(sub.id);
                  if (e.key === "Escape") {
                    setEditingId(null);
                    setEditDraft("");
                  }
                }}
                onBlur={() => handleRename(sub.id)}
                className="flex-1 text-sm text-gray-700 dark:text-gray-300 outline-none border-b border-indigo-300 pb-0.5 bg-transparent"
              />
            ) : (
              <span
                onClick={() => {
                  setEditingId(sub.id);
                  setEditDraft(sub.title);
                }}
                className={`flex-1 text-sm cursor-text ${done ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300"}`}
              >
                {sub.title}
              </span>
            )}
            <button
              onClick={() => {
                setDraft("");
                setAddingParentId(sub.id);
              }}
              className="opacity-0 group-hover/sub:opacity-100 p-0.5 text-gray-300 hover:text-indigo-500 transition-all cursor-pointer"
              title={trKey(locale, "task.addSubtask")}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <button
              onClick={() => handleDelete(sub.id)}
              className="opacity-0 group-hover/sub:opacity-100 p-0.5 text-gray-300 hover:text-red-400 transition-all cursor-pointer"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {addingParentId === sub.id && renderAddRow(depth + 1)}
          {children.length > 0 && <div className="space-y-1">{renderSubtasks(children, depth + 1)}</div>}
        </div>
      );
    });

  return (
    <div className="mt-5 mb-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {trKey(locale, "task.subtasks")} {totalCount > 0 && <span className="font-normal normal-case text-gray-400 dark:text-gray-500">({doneCount}/{totalCount})</span>}
        </p>
        <button
          onClick={() => {
            setDraft("");
            setAddingParentId(parentId);
          }}
          className="text-xs text-gray-400 hover:text-indigo-600 transition-colors cursor-pointer flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M12 4v16m8-8H4" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {trKey(locale, "common.add")}
        </button>
      </div>

      {subtasks.length > 0 && <div className="space-y-1 mb-2">{renderSubtasks(subtasks, 0)}</div>}
      {addingParentId === parentId && renderAddRow(0)}

      {subtasks.length === 0 && addingParentId === null && (
        <button
          onClick={() => {
            setDraft("");
            setAddingParentId(parentId);
          }}
          className="w-full border border-dashed border-gray-200 dark:border-gray-700 rounded-lg py-2 text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors cursor-pointer"
        >
          + {trKey(locale, "task.addSubtask")}
        </button>
      )}
    </div>
  );
}

// --- Field row ---
function FieldRow({
  label,
  column,
  task,
  fieldValues,
  onSave,
  memberNames = [],
  readOnlyOwner = false,
}: {
  label: string;
  column: ProjectColumn;
  task: { id: string; reminderOffsetMinutes?: number | null };
  fieldValues: TaskWithFields["fieldValues"];
  onSave: (v: string | null) => void;
  memberNames?: string[];
  readOnlyOwner?: boolean;
}) {
  const locale = useClientLocale(usePathname());
  const value = getFieldValue(fieldValues, column.id);

  const renderField = () => {
    switch (column.type) {
      case "STATUS":
        return <SelectCell value={value} options={getStatusOptions(locale)} onSave={onSave} />;
      case "PRIORITY":
        return <SelectCell value={value} options={getPriorityOptions(locale)} onSave={onSave} />;
      case "DUE_DATE":
        return <DateCell value={value} onSave={onSave} taskId={task.id} reminderOffsetMinutes={task.reminderOffsetMinutes ?? null} />;
      case "TIMELINE":
        return <TimelineCell value={value} onSave={onSave} />;
      case "BUDGET":
        return <TextCell value={value} onSave={onSave} prefix="€ " />;
      case "NOTES":
        return <NotesField value={value} onSave={onSave} />;
      case "OWNER":
        if (readOnlyOwner) {
          return (
            <div className="w-full px-1 py-1 min-h-[24px] flex items-center">
              {value ? (
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{value}</span>
              ) : (
                <span className="text-gray-300 text-xs select-none">—</span>
              )}
            </div>
          );
        }
        return memberNames.length > 0
          ? <OwnerCell value={value} onSave={onSave} memberNames={memberNames} />
          : <TextCell value={value} onSave={onSave} />;
      default:
        return <TextCell value={value} onSave={onSave} />;
    }
  };

  return (
    <div className="flex items-start gap-2.5 sm:gap-4 py-2.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 -mx-2 transition-colors group/field">
      <div className="w-20 sm:w-24 flex-shrink-0 text-[10px] sm:text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider pt-1.5">
        {label}
      </div>
      <div className="flex-1 min-w-0">{renderField()}</div>
    </div>
  );
}

// --- Date formatter ---
function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString(getUiLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// --- Panel ---
interface Props {
  task: TaskWithFields;
  groupName: string;
  groupColor: string;
  columns: ProjectColumn[];
  projectId: string;
  onClose: () => void;
  onTitleUpdate: (title: string) => void;
  onFieldUpdate: (columnId: string, value: string | null) => void;
  onArchive?: () => void;
  onDuplicate?: () => void;
  readOnlyOwner?: boolean;
}

// Avoid unused import warning
void updateSubtaskTitleAction;

export function TaskDetailPanel({
  task,
  groupName,
  groupColor,
  columns,
  projectId,
  onClose,
  onTitleUpdate,
  onFieldUpdate,
  onArchive,
  onDuplicate,
  readOnlyOwner = false,
}: Props) {
  const locale = useClientLocale(usePathname());
  const { memberNames } = useProjectContext();
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [visible, setVisible] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const statusColId = columns.find((c) => c.type === "STATUS")?.id ?? null;

  // Slide-in on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Sync title when task switches
  useEffect(() => {
    setTitleDraft(task.title);
  }, [task.id, task.title]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const saveTitle = () => {
    const t = titleDraft.trim();
    if (t && t !== task.title) onTitleUpdate(t);
    else if (!t) setTitleDraft(task.title);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/5"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={[
          "fixed right-0 top-0 bottom-0 w-full sm:w-[480px] z-50",
          "bg-white dark:bg-gray-800 shadow-2xl sm:border-l border-gray-200 dark:border-gray-700 flex flex-col",
          "transition-transform duration-200 ease-out",
          visible ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <input
                ref={titleRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    saveTitle();
                    titleRef.current?.blur();
                  }
                  if (e.key === "Escape") {
                    setTitleDraft(task.title);
                    titleRef.current?.blur();
                  }
                }}
                className="w-full text-[17px] font-semibold text-gray-900 dark:text-gray-50 outline-none bg-transparent leading-snug border-b border-transparent hover:border-gray-200 dark:hover:border-gray-600 focus:border-indigo-400 transition-colors pb-0.5 placeholder-gray-300 dark:placeholder-gray-600"
                placeholder={trKey(locale, "task.titlePlaceholder")}
              />
              <div className="flex items-center gap-1.5 mt-2">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: groupColor }}
                />
                <span className="text-xs text-gray-400 dark:text-gray-500">{groupName}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors cursor-pointer flex-shrink-0 mt-0.5"
              title={trKey(locale, "task.closeEsc")}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Fields + Comments */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2">
          {columns.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
              {trKey(locale, "task.noActiveField")}
            </p>
          ) : (
            <div>
              {columns.map((col) => (
                <FieldRow
                  key={col.id}
                  label={getDisplayColumnLabel(col, locale)}
                  column={col}
                  task={{ id: task.id, reminderOffsetMinutes: task.reminderOffsetMinutes ?? null }}
                  fieldValues={task.fieldValues}
                  onSave={(value) => onFieldUpdate(col.id, value)}
                  memberNames={memberNames}
                  readOnlyOwner={readOnlyOwner}
                />
              ))}
            </div>
          )}
          <SubtasksSection
            key={task.id}
            parentId={task.id}
            groupId={task.groupId}
            initialSubtasks={task.subtasks ?? []}
            statusColId={statusColId}
          />
          <RecurrenceSection taskId={task.id} initialRecurrence={task.recurrence ?? null} />
          <AttachmentsSection taskId={task.id} />
          <DependenciesSection taskId={task.id} projectId={projectId} />
          <ActivitySection taskId={task.id} />
          <CommentsSection taskId={task.id} />
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-start justify-between gap-2 flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {onDuplicate && (
              <button
                onClick={() => { onDuplicate(); onClose(); }}
                className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer border border-transparent hover:border-indigo-200 dark:hover:border-indigo-700"
                title={trKey(locale, "task.duplicateTask")}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="1.5" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {trKey(locale, "task.duplicate")}
              </button>
            )}
            {onArchive && (
              <button
                onClick={() => { onArchive(); onClose(); }}
                className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-amber-600 px-2.5 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors cursor-pointer border border-transparent hover:border-amber-200 dark:hover:border-amber-700"
                title={trKey(locale, "task.archiveTask")}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {trKey(locale, "task.archive")}
              </button>
            )}
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{trKey(locale, "task.createdOn")} {fmtDate(task.createdAt)}</span>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{trKey(locale, "task.updatedOn")} {fmtDate(task.updatedAt)}</span>
          </div>
        </div>
      </div>
    </>
  );
}

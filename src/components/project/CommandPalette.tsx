"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { ProjectWithRelations, TaskWithFields } from "@/lib/types";

type Action = {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  onSelect: () => void;
  group: string;
};

type SearchResult = {
  task: TaskWithFields;
  groupName: string;
  groupColor: string;
};

interface Props {
  project: ProjectWithRelations;
  onClose: () => void;
  onOpenTask: (task: TaskWithFields, groupName: string, groupColor: string) => void;
  onSwitchTab: (tab: string) => void;
  onAddTask: (groupId: string) => void;
}

export function CommandPalette({ project, onClose, onOpenTask, onSwitchTab, onAddTask }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 10);
  }, []);

  // Static actions
  const actions: Action[] = useMemo(() => [
    {
      id: "tab-spreadsheet",
      label: "Ouvrir le Tableur",
      icon: <TabIcon type="spreadsheet" />,
      onSelect: () => { onSwitchTab("spreadsheet"); onClose(); },
      group: "Vues",
    },
    {
      id: "tab-cards",
      label: "Ouvrir les Fiches",
      icon: <TabIcon type="cards" />,
      onSelect: () => { onSwitchTab("cards"); onClose(); },
      group: "Vues",
    },
    {
      id: "tab-kanban",
      label: "Ouvrir le Kanban",
      icon: <TabIcon type="kanban" />,
      onSelect: () => { onSwitchTab("kanban"); onClose(); },
      group: "Vues",
    },
    {
      id: "tab-calendar",
      label: "Ouvrir le Calendrier",
      icon: <TabIcon type="calendar" />,
      onSelect: () => { onSwitchTab("calendar"); onClose(); },
      group: "Vues",
    },
    {
      id: "tab-gantt",
      label: "Ouvrir le Gantt",
      icon: <TabIcon type="gantt" />,
      onSelect: () => { onSwitchTab("gantt"); onClose(); },
      group: "Vues",
    },
    {
      id: "tab-timeline",
      label: "Ouvrir l'Échéancier",
      icon: <TabIcon type="timeline" />,
      onSelect: () => { onSwitchTab("timeline"); onClose(); },
      group: "Vues",
    },
    {
      id: "tab-dashboard",
      label: "Ouvrir le Dashboard",
      icon: <TabIcon type="dashboard" />,
      onSelect: () => { onSwitchTab("dashboard"); onClose(); },
      group: "Vues",
    },
    ...project.groups.map((g) => ({
      id: `add-task-${g.id}`,
      label: `Ajouter une tâche dans "${g.name}"`,
      description: g.name,
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M12 4v16m8-8H4" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
      onSelect: () => { onAddTask(g.id); onClose(); },
      group: "Actions",
    })),
    {
      id: "goto-templates",
      label: "Voir les templates",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
        </svg>
      ),
      onSelect: () => { window.location.href = "/templates"; },
      group: "Navigation",
    },
    {
      id: "goto-home",
      label: "Retour à l'accueil",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      onSelect: () => { window.location.href = "/"; },
      group: "Navigation",
    },
  ], [project.groups, onSwitchTab, onAddTask, onClose]);

  // Task search results
  const taskResults: SearchResult[] = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const results: SearchResult[] = [];
    for (const group of project.groups) {
      for (const task of group.tasks) {
        if (task.title.toLowerCase().includes(q)) {
          results.push({ task, groupName: group.name, groupColor: group.color });
          if (results.length >= 8) break;
        }
      }
      if (results.length >= 8) break;
    }
    return results;
  }, [query, project.groups]);

  // Filtered actions
  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q)
    );
  }, [query, actions]);

  type FlatItem = { type: "task"; data: SearchResult } | { type: "action"; data: Action };

  // Build flat list for keyboard navigation
  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];
    for (const r of taskResults) items.push({ type: "task" as const, data: r });
    for (const a of filteredActions) items.push({ type: "action" as const, data: a });
    return items;
  }, [taskResults, filteredActions]);

  // Reset selection when query changes
  useEffect(() => { setSelectedIdx(0); }, [query]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[selectedIdx];
      if (!item) return;
      if (item.type === "task") {
        const { task, groupName, groupColor } = item.data;
        onOpenTask(task, groupName, groupColor);
        onClose();
      } else {
        item.data.onSelect();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  // Group actions by their group label
  const groupedActions = useMemo(() => {
    const map = new Map<string, Action[]>();
    for (const a of filteredActions) {
      if (!map.has(a.group)) map.set(a.group, []);
      map.get(a.group)!.push(a);
    }
    return map;
  }, [filteredActions]);

  let globalIdx = taskResults.length; // start after task results

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Palette */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] pointer-events-none px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-xl pointer-events-auto overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-gray-700">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Rechercher une tâche, une action…"
              className="flex-1 text-sm text-gray-900 dark:text-gray-50 bg-transparent outline-none placeholder-gray-400 dark:placeholder-gray-500"
            />
            <kbd className="text-[10px] text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 font-mono">Échap</kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1.5">
            {flatItems.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8 italic">Aucun résultat</p>
            )}

            {/* Task results */}
            {taskResults.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-4 py-1.5 pt-2">
                  Tâches
                </p>
                {taskResults.map((r, i) => (
                  <button
                    key={r.task.id}
                    data-idx={i}
                    onClick={() => { onOpenTask(r.task, r.groupName, r.groupColor); onClose(); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${i === selectedIdx ? "bg-indigo-50 dark:bg-indigo-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-700"}`}
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.groupColor }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{r.task.title}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{r.groupName}</p>
                    </div>
                    <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M9 5l7 7-7 7" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {/* Action groups */}
            {Array.from(groupedActions.entries()).map(([groupLabel, groupActions]) => (
              <div key={groupLabel}>
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-4 py-1.5 pt-2">
                  {groupLabel}
                </p>
                {groupActions.map((action) => {
                  const idx = globalIdx++;
                  return (
                    <button
                      key={action.id}
                      data-idx={idx}
                      onClick={action.onSelect}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${idx === selectedIdx ? "bg-indigo-50 dark:bg-indigo-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-700"}`}
                    >
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${idx === selectedIdx ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                        {action.icon}
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-200 flex-1 truncate">{action.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2 flex items-center gap-4 text-[10px] text-gray-400 dark:text-gray-500">
            <span><kbd className="font-mono border border-gray-200 dark:border-gray-600 rounded px-1">↑↓</kbd> Naviguer</span>
            <span><kbd className="font-mono border border-gray-200 dark:border-gray-600 rounded px-1">↵</kbd> Sélectionner</span>
            <span><kbd className="font-mono border border-gray-200 dark:border-gray-600 rounded px-1">Échap</kbd> Fermer</span>
          </div>
        </div>
      </div>
    </>
  );
}

function TabIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    spreadsheet: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="1.5" />
      </svg>
    ),
    cards: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
        <rect x="13" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
      </svg>
    ),
    kanban: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="4" width="5" height="14" rx="1" strokeWidth="1.5" />
        <rect x="9.5" y="4" width="5" height="9" rx="1" strokeWidth="1.5" />
        <rect x="16" y="4" width="5" height="6" rx="1" strokeWidth="1.5" />
      </svg>
    ),
    calendar: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="16" rx="2" strokeWidth="1.5" />
        <path d="M3 10h18M8 3v4M16 3v4" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    gantt: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M3 6h8M3 12h14M3 18h10" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    timeline: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="6" cy="7" r="1.5" fill="currentColor" strokeWidth="0" />
        <circle cx="6" cy="12" r="1.5" fill="currentColor" strokeWidth="0" />
        <circle cx="6" cy="17" r="1.5" fill="currentColor" strokeWidth="0" />
        <rect x="9" y="5.5" width="7" height="3" rx="1.5" strokeWidth="0" fill="currentColor" opacity="0.5" />
        <rect x="9" y="10.5" width="11" height="3" rx="1.5" strokeWidth="0" fill="currentColor" opacity="0.5" />
        <rect x="9" y="15.5" width="5" height="3" rx="1.5" strokeWidth="0" fill="currentColor" opacity="0.5" />
      </svg>
    ),
    dashboard: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="8" height="5" rx="1" strokeWidth="1.5" />
        <rect x="13" y="3" width="8" height="9" rx="1" strokeWidth="1.5" />
        <rect x="3" y="10" width="8" height="11" rx="1" strokeWidth="1.5" />
        <rect x="13" y="14" width="8" height="7" rx="1" strokeWidth="1.5" />
      </svg>
    ),
  };
  return <>{icons[type] ?? null}</>;
}

"use client";

import { useState, useEffect, useRef } from "react";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/lib/constants";
import type { ProjectColumn, TaskFieldValue } from "@/lib/types";
import { useProjectContext } from "./ProjectContext";

export function getFieldValue(
  fieldValues: TaskFieldValue[],
  columnId: string
): string | null {
  return fieldValues.find((fv) => fv.columnId === columnId)?.value ?? null;
}

// ---- Recurrence helpers ----

export function recurrenceLabel(recurrence: string | null): string | null {
  if (!recurrence) return null;
  try {
    const { frequency, interval } = JSON.parse(recurrence) as { frequency: string; interval: number };
    const labels: Record<string, string> = { daily: "jour", weekly: "semaine", monthly: "mois" };
    const unit = labels[frequency] ?? frequency;
    return interval === 1
      ? `Récurrent · chaque ${unit}`
      : `Récurrent · tous les ${interval} ${unit}s`;
  } catch {
    return "Récurrent";
  }
}

/** Small repeat icon badge — drop it next to any task title */
export function RecurrenceIcon({ recurrence }: { recurrence: string | null }) {
  const label = recurrenceLabel(recurrence);
  if (!label) return null;
  return (
    <span title={label} className="inline-flex flex-shrink-0 text-indigo-400 hover:text-indigo-600 transition-colors cursor-default">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 2l4 4-4 4" />
        <path d="M3 11V9a4 4 0 014-4h14" />
        <path d="M7 22l-4-4 4-4" />
        <path d="M21 13v2a4 4 0 01-4 4H3" />
      </svg>
    </span>
  );
}

// --- Badge ---
function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}

// --- SelectCell (Status, Priority) ---
type SelectOption = { value: string; label: string; color: string };

export function SelectCell({
  value,
  options,
  onSave,
}: {
  value: string | null;
  options: readonly SelectOption[];
  onSave: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer min-h-[24px]"
      >
        {current ? (
          <Badge label={current.label} className={current.color} />
        ) : (
          <span className="text-gray-300 text-xs select-none">—</span>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-[160px] py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onSave(opt.value);
                setOpen(false);
              }}
              className={`w-full flex items-center px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
                value === opt.value ? "bg-gray-50 dark:bg-gray-700" : ""
              }`}
            >
              <Badge label={opt.label} className={opt.color} />
            </button>
          ))}
          {value && (
            <button
              onClick={() => {
                onSave(null);
                setOpen(false);
              }}
              className="w-full flex items-center px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 mt-1 pt-1.5 cursor-pointer"
            >
              Effacer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- TextCell ---
export function TextCell({
  value,
  onSave,
  placeholder = "—",
  prefix = "",
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  placeholder?: string;
  prefix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value ?? "");
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [editing, value]);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed !== (value ?? "")) onSave(trimmed || null);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full bg-white dark:bg-gray-700 border border-indigo-400 rounded px-2 py-0.5 text-xs text-gray-800 dark:text-gray-100 outline-none focus:ring-1 focus:ring-indigo-200"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="w-full text-left px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer min-h-[24px] flex items-center"
    >
      {value ? (
        <span className="text-xs text-gray-800 dark:text-gray-100 truncate">
          {prefix}
          {value}
        </span>
      ) : (
        <span className="text-gray-300 text-xs select-none">—</span>
      )}
    </button>
  );
}

// --- DateCell ---
export function DateCell({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const isOverdue =
    value
      ? new Date(value) < new Date(new Date().toDateString())
      : false;

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        defaultValue={value ?? ""}
        onBlur={(e) => {
          onSave(e.target.value || null);
          setEditing(false);
        }}
        onChange={(e) => {
          if (e.target.value) {
            onSave(e.target.value);
            setEditing(false);
          }
        }}
        className="bg-white dark:bg-gray-700 dark:text-gray-100 border border-indigo-400 rounded px-2 py-0.5 text-xs outline-none w-full"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="w-full px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer min-h-[24px] flex items-center"
    >
      {value ? (
        <span
          className={`text-xs ${
            isOverdue ? "text-red-500 font-medium" : "text-gray-700 dark:text-gray-300"
          }`}
        >
          {new Date(value + "T12:00:00").toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
          })}
          {isOverdue && (
            <span className="ml-1 text-red-400 text-[10px]">retard</span>
          )}
        </span>
      ) : (
        <span className="text-gray-300 text-xs select-none">—</span>
      )}
    </button>
  );
}

// --- TimelineCell ---
export function TimelineCell({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const parsed = value
    ? (() => {
        try {
          return JSON.parse(value) as { start?: string; end?: string };
        } catch {
          return null;
        }
      })()
    : null;

  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(parsed?.start ?? "");
  const [end, setEnd] = useState(parsed?.end ?? "");

  const save = () => {
    if (start || end) {
      onSave(JSON.stringify({ start, end }));
    } else {
      onSave(null);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          autoFocus
          className="border border-indigo-400 rounded px-1 py-0.5 text-xs outline-none w-[110px]"
        />
        <span className="text-gray-400 text-xs">→</span>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="border border-indigo-400 rounded px-1 py-0.5 text-xs outline-none w-[110px]"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setStart(parsed?.start ?? "");
        setEnd(parsed?.end ?? "");
        setEditing(true);
      }}
      className="w-full px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer min-h-[24px] flex items-center"
    >
      {parsed?.start || parsed?.end ? (
        <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
          {parsed.start &&
            new Date(parsed.start + "T12:00:00").toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
            })}
          {parsed.start && parsed.end && " → "}
          {parsed.end &&
            new Date(parsed.end + "T12:00:00").toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
            })}
        </span>
      ) : (
        <span className="text-gray-300 text-xs select-none">—</span>
      )}
    </button>
  );
}

// --- OwnerCell ---
export function OwnerCell({
  value,
  onSave,
  memberNames,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  memberNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { memberAvatars } = useProjectContext();

  useEffect(() => {
    if (!open) return;
    setDraft(value ?? "");
    setTimeout(() => inputRef.current?.focus(), 0);
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setDraft(value ?? "");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, value]);

  const filtered = draft
    ? memberNames.filter((n) => n.toLowerCase().includes(draft.toLowerCase()))
    : memberNames;

  const commit = (v: string) => {
    onSave(v || null);
    setOpen(false);
  };

  if (memberNames.length === 0) {
    return <TextCell value={value} onSave={onSave} />;
  }

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1 py-1 truncate transition-colors cursor-pointer"
      >
        {value ? (
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full flex-shrink-0 overflow-hidden">
              {memberAvatars[value] ? (
                <img src={memberAvatars[value]!} alt={value} className="w-full h-full object-cover rounded-full" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 font-bold text-[10px] flex items-center justify-center">
                  {value.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="truncate">{value}</span>
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 w-44 overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit(draft.trim());
                if (e.key === "Escape") { setOpen(false); setDraft(value ?? ""); }
              }}
              placeholder="Nom…"
              className="w-full text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-50 dark:placeholder-gray-400 rounded-lg outline-none focus:border-indigo-400 transition-colors"
            />
          </div>
          <div className="max-h-40 overflow-y-auto py-1">
            {value && (
              <button
                onClick={() => commit("")}
                className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
              >
                Effacer
              </button>
            )}
            {filtered.map((name) => (
              <button
                key={name}
                onClick={() => commit(name)}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors cursor-pointer ${value === name ? "text-indigo-600 dark:text-indigo-400 font-medium" : "text-gray-700 dark:text-gray-200"}`}
              >
                <span className="w-5 h-5 rounded-full flex-shrink-0 overflow-hidden">
                  {memberAvatars[name] ? (
                    <img src={memberAvatars[name]!} alt={name} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 font-bold text-[10px] flex items-center justify-center">
                      {name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                {name}
              </button>
            ))}
            {filtered.length === 0 && draft && (
              <button
                onClick={() => commit(draft.trim())}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Utiliser «{draft}»
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- CellRenderer ---
export function CellRenderer({
  column,
  fieldValues,
  onSave,
  memberNames,
}: {
  column: ProjectColumn;
  fieldValues: TaskFieldValue[];
  onSave: (columnId: string, value: string | null) => void;
  memberNames?: string[];
}) {
  const value = getFieldValue(fieldValues, column.id);
  const save = (v: string | null) => onSave(column.id, v);

  switch (column.type) {
    case "STATUS":
      return <SelectCell value={value} options={STATUS_OPTIONS} onSave={save} />;
    case "PRIORITY":
      return <SelectCell value={value} options={PRIORITY_OPTIONS} onSave={save} />;
    case "DUE_DATE":
      return <DateCell value={value} onSave={save} />;
    case "TIMELINE":
      return <TimelineCell value={value} onSave={save} />;
    case "BUDGET":
      return <TextCell value={value} onSave={save} prefix="€ " />;
    case "OWNER":
      return memberNames && memberNames.length > 0
        ? <OwnerCell value={value} onSave={save} memberNames={memberNames} />
        : <TextCell value={value} onSave={save} />;
    case "NOTES":
    default:
      return <TextCell value={value} onSave={save} />;
  }
}

"use client";

import { useState, useEffect, useTransition } from "react";
import {
  listAutomations,
  createAutomation,
  toggleAutomation,
  deleteAutomation,
} from "@/lib/actions";
import type { AutomationTrigger, AutomationAction } from "@/lib/actions";

type AutomationRow = {
  id: string;
  name: string;
  isActive: boolean;
  trigger: string;
  action: string;
  createdAt: Date;
};

const FIELD_LABELS: Record<string, string> = {
  STATUS: "Statut",
  PRIORITY: "Priorité",
  OWNER: "Responsable",
};

const STATUS_VALUES = [
  { value: "todo", label: "À faire" },
  { value: "in_progress", label: "En cours" },
  { value: "done", label: "Terminé" },
  { value: "blocked", label: "Bloqué" },
];

const PRIORITY_VALUES = [
  { value: "low", label: "Basse" },
  { value: "medium", label: "Moyenne" },
  { value: "high", label: "Haute" },
  { value: "critical", label: "Critique" },
];

function getValuesFor(field: string) {
  if (field === "STATUS") return STATUS_VALUES;
  if (field === "PRIORITY") return PRIORITY_VALUES;
  return [];
}

function describeAutomation(trigger: string, action: string): string {
  try {
    const t = JSON.parse(trigger) as AutomationTrigger;
    const a = JSON.parse(action) as AutomationAction;
    const tVals = getValuesFor(t.field);
    const tLabel = tVals.find((v) => v.value === t.value)?.label ?? t.value;
    const tField = FIELD_LABELS[t.field] ?? t.field;
    if (a.type === "SET_FIELD") {
      const aVals = getValuesFor(a.field);
      const aLabel = aVals.find((v) => v.value === a.value)?.label ?? a.value;
      const aField = FIELD_LABELS[a.field] ?? a.field;
      return `Quand ${tField} → "${tLabel}" · Définir ${aField} = "${aLabel}"`;
    }
    return `Quand ${tField} → "${tLabel}" · Notifier le responsable`;
  } catch {
    return "Règle invalide";
  }
}

export function AutomationsPanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [automations, setAutomations] = useState<AutomationRow[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [triggerField, setTriggerField] = useState("STATUS");
  const [triggerValue, setTriggerValue] = useState("done");
  const [actionType, setActionType] = useState<"SET_FIELD" | "NOTIFY_OWNER">("SET_FIELD");
  const [actionField, setActionField] = useState("PRIORITY");
  const [actionValue, setActionValue] = useState("high");

  useEffect(() => {
    listAutomations(projectId).then((rows) => {
      setAutomations(rows as AutomationRow[]);
      setLoaded(true);
    });
  }, [projectId]);

  const handleCreate = () => {
    if (!formName.trim()) return;
    const trigger: AutomationTrigger = { field: triggerField, value: triggerValue };
    const action: AutomationAction =
      actionType === "SET_FIELD"
        ? { type: "SET_FIELD", field: actionField, value: actionValue }
        : { type: "NOTIFY_OWNER" };

    startTransition(async () => {
      const created = await createAutomation(projectId, formName.trim(), trigger, action);
      setAutomations((prev) => [...(prev ?? []), created as AutomationRow]);
      setShowForm(false);
      setFormName("");
    });
  };

  const handleToggle = (id: string, isActive: boolean) => {
    setAutomations((prev) =>
      prev?.map((a) => (a.id === id ? { ...a, isActive } : a)) ?? null
    );
    startTransition(async () => { await toggleAutomation(id, isActive); });
  };

  const handleDelete = (id: string) => {
    setAutomations((prev) => prev?.filter((a) => a.id !== id) ?? null);
    startTransition(async () => { await deleteAutomation(id); });
  };

  const triggerValues = getValuesFor(triggerField);
  const actionValues = getValuesFor(actionField);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Automatisations</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Règles déclenchées automatiquement lors de modifications</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {!loaded ? (
            <p className="text-sm text-gray-400 text-center py-8">Chargement…</p>
          ) : automations?.length === 0 && !showForm ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 font-medium">Aucune règle configurée</p>
              <p className="text-xs text-gray-400 mt-1">Créez une règle pour automatiser les actions répétitives</p>
            </div>
          ) : (
            automations?.map((auto) => (
              <div key={auto.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700 group">
                <button
                  onClick={() => handleToggle(auto.id, !auto.isActive)}
                  className={`relative w-8 h-4.5 h-[18px] rounded-full transition-colors cursor-pointer flex-shrink-0 ${auto.isActive ? "bg-indigo-500" : "bg-gray-300 dark:bg-gray-600"}`}
                  title={auto.isActive ? "Désactiver" : "Activer"}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${auto.isActive ? "left-[18px]" : "left-0.5"}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{auto.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{describeAutomation(auto.trigger, auto.action)}</p>
                </div>
                <button
                  onClick={() => handleDelete(auto.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))
          )}

          {/* Create form */}
          {showForm && (
            <div className="border border-indigo-200 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-900/20 rounded-xl p-4 space-y-3 mt-2">
              <input
                type="text"
                placeholder="Nom de la règle (ex. Clôture auto)"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                autoFocus
              />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 font-medium">Quand</span>
                <select
                  value={triggerField}
                  onChange={(e) => {
                    setTriggerField(e.target.value);
                    setTriggerValue(getValuesFor(e.target.value)[0]?.value ?? "");
                  }}
                  className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 dark:text-gray-100 outline-none focus:border-indigo-400 cursor-pointer"
                >
                  {Object.entries(FIELD_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-400">devient</span>
                <select
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(e.target.value)}
                  className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 dark:text-gray-100 outline-none focus:border-indigo-400 cursor-pointer"
                >
                  {triggerValues.map((v) => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 font-medium">Alors</span>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as "SET_FIELD" | "NOTIFY_OWNER")}
                  className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 dark:text-gray-100 outline-none focus:border-indigo-400 cursor-pointer"
                >
                  <option value="SET_FIELD">Définir un champ</option>
                  <option value="NOTIFY_OWNER">Notifier le responsable</option>
                </select>
                {actionType === "SET_FIELD" && (
                  <>
                    <select
                      value={actionField}
                      onChange={(e) => {
                        setActionField(e.target.value);
                        setActionValue(getValuesFor(e.target.value)[0]?.value ?? "");
                      }}
                      className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 dark:text-gray-100 outline-none focus:border-indigo-400 cursor-pointer"
                    >
                      {Object.entries(FIELD_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-400">=</span>
                    <select
                      value={actionValue}
                      onChange={(e) => setActionValue(e.target.value)}
                      className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 dark:text-gray-100 outline-none focus:border-indigo-400 cursor-pointer"
                    >
                      {actionValues.map((v) => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!formName.trim()}
                  className="text-xs bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
                >
                  Créer
                </button>
                <button
                  onClick={() => { setShowForm(false); setFormName(""); }}
                  className="text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Nouvelle règle
          </button>
        </div>
      </div>
    </div>
  );
}

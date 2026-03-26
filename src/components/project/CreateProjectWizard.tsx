"use client";

import { useState, useTransition } from "react";
import { createProject } from "@/lib/actions";
import { Button } from "@/components/ui/Button";
import type { ColumnType, ViewType, WidgetType } from "@/lib/types";
import {
  AVAILABLE_COLUMNS,
  AVAILABLE_VIEWS,
  AVAILABLE_WIDGETS,
} from "@/lib/types";

const STEPS = [
  { id: 1, label: "Informations" },
  { id: 2, label: "Colonnes" },
  { id: 3, label: "Vue" },
  { id: 4, label: "Dashboard" },
];

// --- Icons ---
function GridIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="1.5" />
    </svg>
  );
}
function CardIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
      <rect x="13" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
    </svg>
  );
}
function KanbanIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="4" width="5" height="14" rx="1" strokeWidth="1.5" />
      <rect x="9.5" y="4" width="5" height="9" rx="1" strokeWidth="1.5" />
      <rect x="16" y="4" width="5" height="6" rx="1" strokeWidth="1.5" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="16" rx="2" strokeWidth="1.5" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const VIEW_ICONS: Record<string, React.FC> = {
  grid: GridIcon,
  card: CardIcon,
  kanban: KanbanIcon,
  calendar: CalendarIcon,
};

// --- Step indicator ---
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8 sm:mb-10">
      {STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={[
                "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold transition-all",
                step.id < current
                  ? "bg-indigo-600 text-white"
                  : step.id === current
                  ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                  : "bg-gray-100 text-gray-400",
              ].join(" ")}
            >
              {step.id < current ? (
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                step.id
              )}
            </div>
            <span
              className={[
                "mt-1.5 text-[10px] sm:text-xs font-medium whitespace-nowrap",
                step.id <= current ? "text-indigo-600" : "text-gray-400",
              ].join(" ")}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={[
                "h-0.5 w-8 sm:w-16 mx-1 -mt-5 transition-all",
                step.id < current ? "bg-indigo-600" : "bg-gray-200",
              ].join(" ")}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// --- Step 1: Basic info ---
function Step1({
  name,
  onChange,
}: {
  name: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Informations de base</h2>
        <p className="text-sm text-gray-500 mt-1">Donnez un nom à votre projet.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Nom du projet <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ex : Campagne Q2, Refonte site, Lancement produit…"
          autoFocus
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
        />
      </div>
    </div>
  );
}

// --- Step 2: Columns ---
function Step2({
  selected,
  onChange,
}: {
  selected: ColumnType[];
  onChange: (v: ColumnType[]) => void;
}) {
  const toggle = (type: ColumnType) => {
    onChange(
      selected.includes(type)
        ? selected.filter((c) => c !== type)
        : [...selected, type]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Colonnes du tableau</h2>
        <p className="text-sm text-gray-500 mt-1">
          Choisissez les informations à afficher pour chaque tâche.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {AVAILABLE_COLUMNS.map((col) => {
          const isSelected = selected.includes(col.type);
          return (
            <button
              key={col.type}
              type="button"
              onClick={() => toggle(col.type)}
              className={[
                "flex items-start gap-3 rounded-lg border p-4 text-left transition-all cursor-pointer",
                isSelected
                  ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50",
              ].join(" ")}
            >
              <div
                className={[
                  "mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all",
                  isSelected ? "bg-indigo-600 border-indigo-600" : "border-gray-300",
                ].join(" ")}
              >
                {isSelected && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div>
                <p className={["text-sm font-medium", isSelected ? "text-indigo-700" : "text-gray-800"].join(" ")}>
                  {col.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{col.description}</p>
              </div>
            </button>
          );
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          Sélectionnez au moins une colonne.
        </p>
      )}
    </div>
  );
}

// --- Step 3: View ---
function Step3({
  selected,
  onChange,
}: {
  selected: ViewType;
  onChange: (v: ViewType) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Vue principale</h2>
        <p className="text-sm text-gray-500 mt-1">
          Choisissez comment vous voulez visualiser vos tâches par défaut.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {AVAILABLE_VIEWS.map((view) => {
          const Icon = VIEW_ICONS[view.icon];
          const isSelected = selected === view.type;
          return (
            <button
              key={view.type}
              type="button"
              onClick={() => onChange(view.type)}
              className={[
                "flex flex-col items-center gap-3 rounded-xl border p-5 text-center transition-all cursor-pointer",
                isSelected
                  ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50",
              ].join(" ")}
            >
              <div
                className={[
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  isSelected ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-500",
                ].join(" ")}
              >
                <Icon />
              </div>
              <div>
                <p className={["text-sm font-semibold", isSelected ? "text-indigo-700" : "text-gray-800"].join(" ")}>
                  {view.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{view.description}</p>
              </div>
              {isSelected && (
                <span className="text-xs font-medium text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                  Par défaut
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Step 4: Dashboard ---
function Step4({
  selected,
  onChange,
}: {
  selected: WidgetType[];
  onChange: (v: WidgetType[]) => void;
}) {
  const toggle = (type: WidgetType) => {
    onChange(
      selected.includes(type)
        ? selected.filter((w) => w !== type)
        : [...selected, type]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Dashboard initial</h2>
        <p className="text-sm text-gray-500 mt-1">
          Sélectionnez les indicateurs à afficher dans le dashboard du projet.
        </p>
      </div>
      <div className="space-y-2">
        {AVAILABLE_WIDGETS.map((widget) => {
          const isSelected = selected.includes(widget.type);
          return (
            <button
              key={widget.type}
              type="button"
              onClick={() => toggle(widget.type)}
              className={[
                "w-full flex items-center gap-4 rounded-lg border p-4 text-left transition-all cursor-pointer",
                isSelected
                  ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50",
              ].join(" ")}
            >
              <div
                className={[
                  "w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all",
                  isSelected ? "bg-indigo-600 border-indigo-600" : "border-gray-300",
                ].join(" ")}
              >
                {isSelected && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={["text-sm font-medium", isSelected ? "text-indigo-700" : "text-gray-800"].join(" ")}>
                  {widget.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{widget.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Main wizard ---
export function CreateProjectWizard() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<ColumnType[]>(
    AVAILABLE_COLUMNS.filter((c) => c.defaultActive).map((c) => c.type)
  );
  const [defaultView, setDefaultView] = useState<ViewType>("SPREADSHEET");
  const [selectedWidgets, setSelectedWidgets] = useState<WidgetType[]>(
    AVAILABLE_WIDGETS.filter((w) => w.defaultActive).map((w) => w.type)
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canNext =
    step === 1 ? name.trim().length > 0 :
    step === 2 ? selectedColumns.length > 0 :
    step === 3 ? true :
    true;

  const handleNext = () => {
    if (step < 4) setStep((s) => s + 1);
    else handleSubmit();
  };

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      try {
        await createProject({ name, selectedColumns, defaultView, selectedWidgets });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Une erreur est survenue");
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-6 sm:mb-8 text-center">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Créer un projet</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configurez votre espace de travail en quelques étapes.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-8">
          <div className="flex justify-center">
            <StepIndicator current={step} />
          </div>

          {/* Step content */}
          <div className="min-h-[200px] sm:min-h-[280px]">
            {step === 1 && <Step1 name={name} onChange={setName} />}
            {step === 2 && <Step2 selected={selectedColumns} onChange={setSelectedColumns} />}
            {step === 3 && <Step3 selected={defaultView} onChange={setDefaultView} />}
            {step === 4 && <Step4 selected={selectedWidgets} onChange={setSelectedWidgets} />}
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Navigation */}
          <div className="mt-6 sm:mt-8 flex items-center justify-between border-t border-gray-100 pt-5 sm:pt-6">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 1 || isPending}
            >
              ← Retour
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{step} / {STEPS.length}</span>
              <Button onClick={handleNext} disabled={!canNext} loading={isPending}>
                {step === 4 ? "Créer le projet" : "Suivant →"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

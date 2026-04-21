"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createProject, inviteMember, listUserGroups, listGroupTemplates } from "@/lib/actions";
import { Button } from "@/components/ui/Button";
import { trKey } from "@/lib/i18n/client";
import { useClientLocale } from "@/lib/i18n/useClientLocale";

type UserGroupRow = { id: string; name: string; emails: string };

const STEPS = [
  { id: 1, label: "Informations" },
  { id: 2, label: "Task groups" },
  { id: 3, label: "Invitations" },
];

type GroupTemplateRow = { id: string; name: string; snapshot: string };

function StepIndicator({ current, locale }: { current: number; locale: "fr" | "en" }) {
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
                  ? "bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-900"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500",
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
              {step.id === 1 ? trKey(locale, "wizard.step.info") : step.id === 2 ? trKey(locale, "wizard.step.taskGroups") : trKey(locale, "wizard.step.invitations")}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={[
                "h-0.5 w-8 sm:w-16 mx-1 -mt-5 transition-all",
                step.id < current ? "bg-indigo-600" : "bg-gray-200 dark:bg-gray-700",
              ].join(" ")}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function normalizeEmails(raw: string): string[] {
  return raw
    .split(/[\n,;\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function parseGroupEmails(raw: string): string[] {
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .map((email) => String(email).trim().toLowerCase())
      .filter((email) => email.length > 0);
  } catch {
    return [];
  }
}

function Step1({ name, onChange, locale }: { name: string; onChange: (v: string) => void; locale: "fr" | "en" }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{trKey(locale, "wizard.basicInfo")}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{trKey(locale, "wizard.giveProjectName")}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          {trKey(locale, "wizard.projectName")} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onChange(e.target.value)}
          placeholder={trKey(locale, "wizard.projectNamePlaceholder")}
          autoFocus
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-all"
        />
      </div>
    </div>
  );
}

function Step2({
  templates,
  selectedTemplateIds,
  onToggleTemplate,
  locale,
}: {
  templates: GroupTemplateRow[];
  selectedTemplateIds: string[];
  onToggleTemplate: (templateId: string) => void;
  locale: "fr" | "en";
}) {
  const getTaskCount = (snapshotRaw: string): number => {
    try {
      const snapshot = JSON.parse(snapshotRaw) as { tasks?: unknown[] };
      return Array.isArray(snapshot.tasks) ? snapshot.tasks.length : 0;
    } catch {
      return 0;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{trKey(locale, "wizard.startWithGroups")}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {trKey(locale, "wizard.startWithGroupsHint")}
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">
          {trKey(locale, "wizard.noSavedTaskGroups")}
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => {
            const checked = selectedTemplateIds.includes(template.id);
            const taskCount = getTaskCount(template.snapshot);
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onToggleTemplate(template.id)}
                className={[
                  "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all cursor-pointer",
                  checked
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-indigo-200 dark:ring-indigo-700"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700",
                ].join(" ")}
              >
                <div
                  className={[
                    "w-4 h-4 rounded border-2 flex items-center justify-center transition-all",
                    checked ? "bg-indigo-600 border-indigo-600" : "border-gray-300 dark:border-gray-600",
                  ].join(" ")}
                >
                  {checked && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className={checked ? "text-indigo-700 dark:text-indigo-300 text-sm font-medium" : "text-gray-800 dark:text-gray-100 text-sm font-medium"}>{template.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{taskCount} {trKey(locale, "wizard.taskSingular")}{taskCount > 1 ? "s" : ""} {trKey(locale, "wizard.templateSingular")}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Step3({
  inviteInput,
  onInviteInputChange,
  groups,
  selectedGroupIds,
  onToggleGroup,
  locale,
}: {
  inviteInput: string;
  onInviteInputChange: (value: string) => void;
  groups: UserGroupRow[];
  selectedGroupIds: string[];
  onToggleGroup: (groupId: string) => void;
  locale: "fr" | "en";
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{trKey(locale, "wizard.inviteMembers")}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {trKey(locale, "wizard.inviteHint")}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          {trKey(locale, "wizard.inviteEmails")}
        </label>
        <textarea
          value={inviteInput}
          onChange={(e) => onInviteInputChange(e.target.value)}
          rows={4}
          placeholder="alice@studio.fr, bob@studio.fr"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-all"
        />
        <p className="mt-1 text-xs text-gray-400">{trKey(locale, "wizard.inviteEmailHint")}</p>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{trKey(locale, "wizard.memberGroups")}</p>
        {groups.length === 0 ? (
          <p className="text-xs text-gray-400">{trKey(locale, "wizard.noGroupAvailable")}</p>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => {
              const checked = selectedGroupIds.includes(group.id);
              const count = parseGroupEmails(group.emails).length;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => onToggleGroup(group.id)}
                  className={[
                    "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all cursor-pointer",
                    checked
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-indigo-200 dark:ring-indigo-700"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "w-4 h-4 rounded border-2 flex items-center justify-center transition-all",
                      checked ? "bg-indigo-600 border-indigo-600" : "border-gray-300 dark:border-gray-600",
                    ].join(" ")}
                  >
                    {checked && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className={checked ? "text-indigo-700 dark:text-indigo-300 text-sm font-medium" : "text-gray-800 dark:text-gray-100 text-sm font-medium"}>{group.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{count} {trKey(locale, "wizard.memberSingular")}{count > 1 ? "s" : ""}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function CreateProjectWizard({ initialGroupId }: { initialGroupId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useClientLocale(pathname);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [groupTemplates, setGroupTemplates] = useState<GroupTemplateRow[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [inviteInput, setInviteInput] = useState("");
  const [groups, setGroups] = useState<UserGroupRow[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listUserGroups(), listGroupTemplates()])
      .then(([memberGroups, templates]) => {
        setGroups(memberGroups as UserGroupRow[]);
        setGroupTemplates(templates as GroupTemplateRow[]);
      })
      .catch(() => {
        setGroups([]);
        setGroupTemplates([]);
      });
  }, []);

  const selectedGroupEmails = useMemo(() => {
    const emails = new Set<string>();
    for (const group of groups) {
      if (!selectedGroupIds.includes(group.id)) continue;
      for (const email of parseGroupEmails(group.emails)) {
        emails.add(email);
      }
    }
    return emails;
  }, [groups, selectedGroupIds]);

  const canNext = step === 1 ? name.trim().length > 0 : true;

  const handleNext = () => {
    if (step < STEPS.length) {
      setStep((s) => s + 1);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const projectId = await createProject({
          name,
          groupTemplateIds: selectedTemplateIds,
          initialGroupId,
        });

        const inviteEmails = new Set<string>([...normalizeEmails(inviteInput), ...selectedGroupEmails]);
        for (const email of inviteEmails) {
          try {
            await inviteMember(projectId, email);
          } catch {
            // Best effort: keep project creation successful even if one invite fails.
          }
        }

        router.push(`/projects/${projectId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : trKey(locale, "wizard.error"));
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 sm:mb-8 text-center">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-50">{trKey(locale, "wizard.createProjectTitle")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {trKey(locale, "wizard.subtitle")}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 sm:p-8">
          <div className="flex justify-center">
            <StepIndicator current={step} locale={locale} />
          </div>

          <div className="min-h-[220px] sm:min-h-[280px]">
            {step === 1 && <Step1 name={name} onChange={setName} locale={locale} />}
            {step === 2 && (
              <Step2
                templates={groupTemplates}
                selectedTemplateIds={selectedTemplateIds}
                locale={locale}
                onToggleTemplate={(templateId) => {
                  setSelectedTemplateIds((prev) =>
                    prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId]
                  );
                }}
              />
            )}
            {step === 3 && (
              <Step3
                inviteInput={inviteInput}
                onInviteInputChange={setInviteInput}
                groups={groups}
                selectedGroupIds={selectedGroupIds}
                locale={locale}
                onToggleGroup={(groupId) => {
                  setSelectedGroupIds((prev) =>
                    prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
                  );
                }}
              />
            )}
          </div>

          {error && <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="mt-6 sm:mt-8 flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-5 sm:pt-6 sticky bottom-0 bg-white dark:bg-gray-800 pb-1">
            <Button
              variant="ghost"
              onClick={() => (step === 1 ? (window.location.href = "/") : setStep((s) => s - 1))}
              disabled={isPending}
            >
              {trKey(locale, "wizard.back")}
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {step} / {STEPS.length}
              </span>
              <Button onClick={handleNext} disabled={!canNext} loading={isPending}>
                {step === STEPS.length ? trKey(locale, "wizard.createProjectAction") : trKey(locale, "wizard.next")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

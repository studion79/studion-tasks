"use client";

import { createContext, useContext } from "react";
import type { ProjectColumn } from "@/lib/types";

export type ProjectMemberOption = {
  id: string;
  name: string;
  avatar: string | null;
};

type ProjectContextValue = {
  memberNames: string[];
  memberAvatars: Record<string, string | null>;
  memberOptions: ProjectMemberOption[];
  resolveOwnerName: (value: string | null | undefined) => string | null;
  resolveOwnerAvatar: (value: string | null | undefined) => string | null;
  normalizeOwnerValue: (value: string | null | undefined) => string | null;
  /** All project columns, including inactive ones. Use for TaskDetailPanel
   *  and any view that must show every field regardless of spreadsheet visibility. */
  allColumns: ProjectColumn[];
};

const ProjectContext = createContext<ProjectContextValue>({
  memberNames: [],
  memberAvatars: {},
  memberOptions: [],
  resolveOwnerName: () => null,
  resolveOwnerAvatar: () => null,
  normalizeOwnerValue: () => null,
  allColumns: [],
});

export function ProjectProvider({
  memberNames,
  memberAvatars = {},
  memberOptions = [],
  allColumns = [],
  children,
}: {
  memberNames: string[];
  memberAvatars?: Record<string, string | null>;
  memberOptions?: ProjectMemberOption[];
  allColumns?: ProjectColumn[];
  children: React.ReactNode;
}) {
  const byId = new Map(memberOptions.map((m) => [m.id, m]));
  const byName = new Map(memberOptions.map((m) => [m.name.trim().toLowerCase(), m]));

  const resolveOwnerName = (value: string | null | undefined): string | null => {
    const raw = value?.trim();
    if (!raw) return null;
    const byExactId = byId.get(raw);
    if (byExactId) return byExactId.name;
    const byExactName = byName.get(raw.toLowerCase());
    if (byExactName) return byExactName.name;
    return raw;
  };

  const resolveOwnerAvatar = (value: string | null | undefined): string | null => {
    const raw = value?.trim();
    if (!raw) return null;
    const byExactId = byId.get(raw);
    if (byExactId) return byExactId.avatar;
    const byExactName = byName.get(raw.toLowerCase());
    if (byExactName) return byExactName.avatar;
    return memberAvatars[raw] ?? null;
  };

  const normalizeOwnerValue = (value: string | null | undefined): string | null => {
    const raw = value?.trim();
    if (!raw) return null;
    const byExactId = byId.get(raw);
    if (byExactId) return byExactId.id;
    const byExactName = byName.get(raw.toLowerCase());
    if (byExactName) return byExactName.id;
    return raw;
  };

  return (
    <ProjectContext.Provider
      value={{
        memberNames,
        memberAvatars,
        memberOptions,
        resolveOwnerName,
        resolveOwnerAvatar,
        normalizeOwnerValue,
        allColumns,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  return useContext(ProjectContext);
}

"use client";

import { createContext, useContext } from "react";
import type { ProjectColumn } from "@/lib/types";

type ProjectContextValue = {
  memberNames: string[];
  memberAvatars: Record<string, string | null>;
  /** All project columns, including inactive ones. Use for TaskDetailPanel
   *  and any view that must show every field regardless of spreadsheet visibility. */
  allColumns: ProjectColumn[];
};

const ProjectContext = createContext<ProjectContextValue>({
  memberNames: [],
  memberAvatars: {},
  allColumns: [],
});

export function ProjectProvider({
  memberNames,
  memberAvatars = {},
  allColumns = [],
  children,
}: {
  memberNames: string[];
  memberAvatars?: Record<string, string | null>;
  allColumns?: ProjectColumn[];
  children: React.ReactNode;
}) {
  return (
    <ProjectContext.Provider value={{ memberNames, memberAvatars, allColumns }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  return useContext(ProjectContext);
}

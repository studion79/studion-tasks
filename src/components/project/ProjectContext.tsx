"use client";

import { createContext, useContext } from "react";

type ProjectContextValue = {
  memberNames: string[];
  memberAvatars: Record<string, string | null>;
};

const ProjectContext = createContext<ProjectContextValue>({ memberNames: [], memberAvatars: {} });

export function ProjectProvider({
  memberNames,
  memberAvatars = {},
  children,
}: {
  memberNames: string[];
  memberAvatars?: Record<string, string | null>;
  children: React.ReactNode;
}) {
  return (
    <ProjectContext.Provider value={{ memberNames, memberAvatars }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  return useContext(ProjectContext);
}

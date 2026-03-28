"use server";

import { prisma, requireMember } from "./_helpers";

type SavedViewSnapshot = {
  tab: string;
  filters: { status: string[]; priority: string[]; owner: string[] };
  sort: { columnType: string; dir: "asc" | "desc" } | null;
  visibleColumnIds: string[];
  search: string;
};

export async function createSavedView(
  projectId: string,
  name: string,
  snapshot: SavedViewSnapshot
) {
  await requireMember(projectId);
  if (!name.trim()) throw new Error("Le nom de la vue est requis");
  return await prisma.savedView.create({
    data: { projectId, name: name.trim(), snapshot: JSON.stringify(snapshot) },
  });
}

export async function listSavedViews(projectId: string) {
  return await prisma.savedView.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
}

export async function deleteSavedView(viewId: string) {
  const v = await prisma.savedView.findUnique({ where: { id: viewId } });
  if (v) await requireMember(v.projectId);
  await prisma.savedView.delete({ where: { id: viewId } });
}

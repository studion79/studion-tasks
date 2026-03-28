"use server";

import { revalidatePath, prisma } from "./_helpers";

export async function getProjectLinks(projectId: string) {
  const links = await prisma.projectLink.findMany({
    where: { OR: [{ projectAId: projectId }, { projectBId: projectId }] },
    include: {
      projectA: { select: { id: true, name: true } },
      projectB: { select: { id: true, name: true } },
    },
  });
  return links.map((l) => ({
    id: l.id,
    project: l.projectAId === projectId ? l.projectB : l.projectA,
  }));
}

export async function addProjectLink(projectId: string, targetProjectId: string) {
  if (projectId === targetProjectId) return;
  // Normalize order to respect unique constraint (smaller id first)
  const [a, b] = [projectId, targetProjectId].sort();
  await prisma.projectLink.upsert({
    where: { projectAId_projectBId: { projectAId: a, projectBId: b } },
    update: {},
    create: { projectAId: a, projectBId: b },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function removeProjectLink(linkId: string, projectId: string) {
  await prisma.projectLink.delete({ where: { id: linkId } });
  revalidatePath(`/projects/${projectId}`);
}

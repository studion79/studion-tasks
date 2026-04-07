"use server";

import { revalidatePath, prisma, requireAdmin, requireMember, emitProjectChanged } from "./_helpers";

export async function getProjectLinks(projectId: string) {
  await requireMember(projectId);
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
  await requireAdmin(projectId);
  await requireAdmin(targetProjectId);
  if (projectId === targetProjectId) return;
  const [projectRows, targetRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ isPersonal: number }>>(
      `SELECT "isPersonal" FROM "Project" WHERE "id" = ? LIMIT 1`,
      projectId
    ),
    prisma.$queryRawUnsafe<Array<{ isPersonal: number }>>(
      `SELECT "isPersonal" FROM "Project" WHERE "id" = ? LIMIT 1`,
      targetProjectId
    ),
  ]);
  if (!projectRows[0] || !targetRows[0]) throw new Error("Project not found.");
  if (Boolean(projectRows[0].isPersonal) || Boolean(targetRows[0].isPersonal)) {
    throw new Error("FORBIDDEN_LINK_PERSONAL_PROJECT");
  }
  // Normalize order to respect unique constraint (smaller id first)
  const [a, b] = [projectId, targetProjectId].sort();
  await prisma.projectLink.upsert({
    where: { projectAId_projectBId: { projectAId: a, projectBId: b } },
    update: {},
    create: { projectAId: a, projectBId: b },
  });
  revalidatePath(`/projects/${projectId}`);
  emitProjectChanged(projectId);
  emitProjectChanged(targetProjectId);
}

export async function removeProjectLink(linkId: string, projectId: string) {
  await requireAdmin(projectId);
  const projectRows = await prisma.$queryRawUnsafe<Array<{ isPersonal: number }>>(
    `SELECT "isPersonal" FROM "Project" WHERE "id" = ? LIMIT 1`,
    projectId
  );
  if (!projectRows[0]) throw new Error("Project not found.");
  if (Boolean(projectRows[0].isPersonal)) {
    throw new Error("FORBIDDEN_LINK_PERSONAL_PROJECT");
  }
  const link = await prisma.projectLink.findUnique({ where: { id: linkId } });
  await prisma.projectLink.delete({ where: { id: linkId } });
  revalidatePath(`/projects/${projectId}`);
  emitProjectChanged(projectId);
  if (link?.projectAId && link.projectAId !== projectId) emitProjectChanged(link.projectAId);
  if (link?.projectBId && link.projectBId !== projectId) emitProjectChanged(link.projectBId);
}

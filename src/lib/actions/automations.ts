"use server";

import { prisma, requireAdmin, emitProjectChanged } from "./_helpers";

export type AutomationTrigger = { field: string; value: string };
export type AutomationAction =
  | { type: "SET_FIELD"; field: string; value: string }
  | { type: "NOTIFY_OWNER" };

export async function listAutomations(projectId: string) {
  return prisma.automation.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
}

export async function createAutomation(
  projectId: string,
  name: string,
  trigger: AutomationTrigger,
  action: AutomationAction
) {
  await requireAdmin(projectId);
  const created = await prisma.automation.create({
    data: { projectId, name, trigger: JSON.stringify(trigger), action: JSON.stringify(action) },
  });
  emitProjectChanged(projectId);
  return created;
}

export async function toggleAutomation(id: string, isActive: boolean) {
  const a = await prisma.automation.findUnique({ where: { id } });
  if (a) await requireAdmin(a.projectId);
  const updated = await prisma.automation.update({ where: { id }, data: { isActive } });
  if (a?.projectId) emitProjectChanged(a.projectId);
  return updated;
}

export async function deleteAutomation(id: string) {
  const a = await prisma.automation.findUnique({ where: { id } });
  if (a) await requireAdmin(a.projectId);
  const deleted = await prisma.automation.delete({ where: { id } });
  if (a?.projectId) emitProjectChanged(a.projectId);
  return deleted;
}

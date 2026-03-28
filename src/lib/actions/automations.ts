"use server";

import { prisma, requireAdmin } from "./_helpers";

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
  return prisma.automation.create({
    data: { projectId, name, trigger: JSON.stringify(trigger), action: JSON.stringify(action) },
  });
}

export async function toggleAutomation(id: string, isActive: boolean) {
  const a = await prisma.automation.findUnique({ where: { id } });
  if (a) await requireAdmin(a.projectId);
  return prisma.automation.update({ where: { id }, data: { isActive } });
}

export async function deleteAutomation(id: string) {
  const a = await prisma.automation.findUnique({ where: { id } });
  if (a) await requireAdmin(a.projectId);
  return prisma.automation.delete({ where: { id } });
}

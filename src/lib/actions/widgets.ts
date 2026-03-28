"use server";

import { prisma, requireMember } from "./_helpers";

export async function toggleDashboardWidget(widgetId: string, isActive: boolean) {
  const w = await prisma.projectDashboardWidget.findUnique({ where: { id: widgetId } });
  if (w) await requireMember(w.projectId);
  return prisma.projectDashboardWidget.update({ where: { id: widgetId }, data: { isActive } });
}

export async function getProjectWidgets(projectId: string) {
  return prisma.projectDashboardWidget.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
  });
}

"use server";

import { prisma, requireMember, emitProjectChanged } from "./_helpers";
import { AVAILABLE_WIDGETS } from "@/lib/types";
import type { WidgetType } from "@/generated/prisma";

export async function toggleDashboardWidget(widgetId: string, isActive: boolean) {
  const w = await prisma.projectDashboardWidget.findUnique({ where: { id: widgetId } });
  if (w) await requireMember(w.projectId);
  const updated = await prisma.projectDashboardWidget.update({ where: { id: widgetId }, data: { isActive } });
  if (w?.projectId) emitProjectChanged(w.projectId);
  return updated;
}

export async function getProjectWidgets(projectId: string) {
  return prisma.projectDashboardWidget.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
  });
}

export async function toggleDashboardWidgetByType(
  projectId: string,
  widgetType: WidgetType,
  isActive: boolean
) {
  await requireMember(projectId);

  const existing = await prisma.projectDashboardWidget.findFirst({
    where: { projectId, type: widgetType },
    orderBy: { position: "asc" },
  });

  if (existing) {
    const updated = await prisma.projectDashboardWidget.update({
      where: { id: existing.id },
      data: { isActive },
    });
    emitProjectChanged(projectId);
    return updated;
  }

  const widgetIndex = AVAILABLE_WIDGETS.findIndex((w) => w.type === widgetType);
  const created = await prisma.projectDashboardWidget.create({
    data: {
      projectId,
      type: widgetType,
      isActive,
      position: widgetIndex >= 0 ? widgetIndex : 999,
    },
  });
  emitProjectChanged(projectId);
  return created;
}

"use server";

import { redirect } from "next/navigation";
import { prisma, getAuthUserId, requireAdmin, emitProjectChanged, emitAdminDataChanged } from "./_helpers";
import { isSuperAdminUserId } from "@/lib/super-admin";

type TemplateTask = {
  title: string;
  priority?: string | null;
  notes?: string | null;
};

type TemplateSnapshot = {
  columns: { type: string; label: string; position: number }[];
  views: { type: string; name: string; isDefault: boolean; position: number }[];
  widgets: { type: string; position: number }[];
  groups: { name: string; color: string; position: number; tasks?: TemplateTask[] }[];
};

interface GroupTemplateSnapshot {
  name: string;
  color: string;
  tasks: { title: string; priority?: string | null; notes?: string | null }[];
}

export async function saveProjectAsTemplate(
  projectId: string,
  templateName: string,
  includeTasks = false
) {
  await requireAdmin(projectId);
  if (!templateName.trim()) throw new Error("Template name is required.");
  const existingTpl = await prisma.projectTemplate.findFirst({ where: { name: templateName.trim() } });
  if (existingTpl) throw new Error(`A template named "${templateName.trim()}" already exists.`);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      columns: { orderBy: { position: "asc" } },
      views: { orderBy: { position: "asc" } },
      dashboardWidgets: { where: { isActive: true }, orderBy: { position: "asc" } },
      groups: {
        orderBy: { position: "asc" },
        include: includeTasks
          ? {
              tasks: {
                where: { archivedAt: null, parentId: null },
                orderBy: { position: "asc" },
                include: { fieldValues: { include: { column: true } } },
              },
            }
          : undefined,
      },
    },
  });
  if (!project) throw new Error("Project not found.");

  const priorityTypes = ["PRIORITY"];
  const notesTypes = ["NOTES"];

  const snapshot: TemplateSnapshot = {
    columns: project.columns.map((c) => ({ type: c.type, label: c.label, position: c.position })),
    views: project.views.map((v) => ({ type: v.type, name: v.name, isDefault: v.isDefault, position: v.position })),
    widgets: project.dashboardWidgets.map((w) => ({ type: w.type, position: w.position })),
    groups: project.groups.map((g) => {
      const base = { name: g.name, color: g.color, position: g.position };
      if (!includeTasks || !("tasks" in g) || !g.tasks) return base;
      return {
        ...base,
        tasks: (g.tasks as Array<{ title: string; fieldValues: Array<{ column: { type: string }; value: string | null }> }>).map((t) => {
          const fv = (type: string) =>
            t.fieldValues.find((f) => f.column.type === type)?.value ?? null;
          return {
            title: t.title,
            priority: fv(priorityTypes[0]),
            notes: fv(notesTypes[0]),
          };
        }),
      };
    }),
  };

  return prisma.projectTemplate.create({
    data: {
      name: templateName.trim(),
      description: `Based on "${project.name}"`,
      snapshot: JSON.stringify(snapshot),
    },
  });
}

export async function listProjectTemplates() {
  return prisma.projectTemplate.findMany({ orderBy: { createdAt: "desc" } });
}

export async function saveGroupAsTemplate(groupId: string, templateName: string) {
  if (!templateName.trim()) throw new Error("Template name is required.");
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      tasks: {
        where: { archivedAt: null, parentId: null },
        orderBy: { position: "asc" },
        include: { fieldValues: { include: { column: true } } },
      },
    },
  });
  if (!group) throw new Error("Group not found.");
  const existing = await prisma.groupTemplate.findFirst({ where: { name: templateName.trim() } });
  if (existing) throw new Error(`A group template named "${templateName.trim()}" already exists.`);

  const snapshot: GroupTemplateSnapshot = {
    name: group.name,
    color: group.color,
    tasks: (group.tasks as Array<{ title: string; fieldValues: Array<{ column: { type: string }; value: string | null }> }>).map((t) => {
      const fv = (type: string) => t.fieldValues.find((f) => f.column.type === type)?.value ?? null;
      return { title: t.title, priority: fv("PRIORITY"), notes: fv("NOTES") };
    }),
  };

  return prisma.groupTemplate.create({
    data: { name: templateName.trim(), snapshot: JSON.stringify(snapshot) },
  });
}

export async function listGroupTemplates() {
  return prisma.groupTemplate.findMany({ orderBy: { createdAt: "desc" } });
}

export async function deleteGroupTemplate(templateId: string) {
  return prisma.groupTemplate.delete({ where: { id: templateId } });
}

export async function importGroupTemplate(projectId: string, templateId: string) {
  await requireAdmin(projectId);
  const template = await prisma.groupTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new Error("Template not found.");
  const snapshot = JSON.parse(template.snapshot) as GroupTemplateSnapshot;

  const maxPos = await prisma.group.aggregate({ where: { projectId }, _max: { position: true } });
  const newPos = (maxPos._max.position ?? -1) + 1;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { columns: true },
  });
  if (!project) throw new Error("Project not found.");

  const priorityCol = project.columns.find((c) => c.type === "PRIORITY");
  const notesCol = project.columns.find((c) => c.type === "NOTES");

  const group = await prisma.group.create({
    data: {
      projectId,
      name: snapshot.name,
      color: snapshot.color,
      position: newPos,
    },
  });

  for (let idx = 0; idx < snapshot.tasks.length; idx++) {
    const t = snapshot.tasks[idx];
    const fieldValues: { columnId: string; value: string }[] = [];
    if (t.priority && priorityCol) fieldValues.push({ columnId: priorityCol.id, value: t.priority });
    if (t.notes && notesCol) fieldValues.push({ columnId: notesCol.id, value: t.notes });
    await prisma.task.create({
      data: {
        groupId: group.id,
        title: t.title,
        position: idx,
        fieldValues: fieldValues.length > 0 ? { create: fieldValues } : undefined,
      },
    });
  }

  const imported = await prisma.group.findUnique({
    where: { id: group.id },
    include: {
      tasks: {
        where: { archivedAt: null },
        orderBy: { position: "asc" },
        include: { fieldValues: true },
      },
    },
  });
  emitProjectChanged(projectId);
  return imported;
}

export async function deleteProjectTemplate(templateId: string) {
  return prisma.projectTemplate.delete({ where: { id: templateId } });
}

export async function createProjectFromTemplate(templateId: string, name: string) {
  if (!name.trim()) throw new Error("Project name is required.");
  const existing = await prisma.project.findFirst({ where: { name: name.trim() } });
  if (existing) throw new Error(`A project named "${name.trim()}" already exists.`);
  const userId = await getAuthUserId();
  const template = await prisma.projectTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new Error("Template not found.");

  const snapshot = JSON.parse(template.snapshot) as TemplateSnapshot;

  // Create project with groups (no tasks yet — need column IDs first)
  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      columns: {
        create: snapshot.columns.map((c) => ({
          type: c.type as import("@/generated/prisma").ColumnType,
          label: c.label,
          position: c.position,
          isActive: true,
        })),
      },
      views: {
        create: snapshot.views.map((v) => ({
          type: v.type as import("@/generated/prisma").ViewType,
          name: v.name,
          isDefault: v.isDefault,
          position: v.position,
        })),
      },
      dashboardWidgets: {
        create: snapshot.widgets.map((w) => ({
          type: w.type as import("@/generated/prisma").WidgetType,
          position: w.position,
          isActive: true,
        })),
      },
      groups: {
        create: snapshot.groups.map((g) => ({
          name: g.name,
          color: g.color,
          position: g.position,
        })),
      },
    },
    include: {
      columns: true,
      groups: true,
    },
  });

  // If any group has tasks, recreate them with proper column IDs
  const hasTasks = snapshot.groups.some((g) => g.tasks && g.tasks.length > 0);
  if (hasTasks) {
    const priorityCol = project.columns.find((c) => c.type === "PRIORITY");
    const notesCol = project.columns.find((c) => c.type === "NOTES");

    for (const snapGroup of snapshot.groups) {
      if (!snapGroup.tasks || snapGroup.tasks.length === 0) continue;
      const dbGroup = project.groups.find((g) => g.name === snapGroup.name && g.position === snapGroup.position);
      if (!dbGroup) continue;

      for (let idx = 0; idx < snapGroup.tasks.length; idx++) {
        const t = snapGroup.tasks[idx];
        const fieldValues: { columnId: string; value: string }[] = [];
        if (t.priority && priorityCol) fieldValues.push({ columnId: priorityCol.id, value: t.priority });
        if (t.notes && notesCol) fieldValues.push({ columnId: notesCol.id, value: t.notes });

        await prisma.task.create({
          data: {
            groupId: dbGroup.id,
            title: t.title,
            position: idx,
            fieldValues: fieldValues.length > 0 ? { create: fieldValues } : undefined,
          },
        });
      }
    }
  }

  // Créateur automatiquement ADMIN du projet (sauf super-admin global, invisible dans les membres)
  if (!isSuperAdminUserId(userId)) {
    await prisma.projectMember.create({
      data: { projectId: project.id, userId, role: "ADMIN" },
    });
  }
  emitProjectChanged(project.id);
  emitAdminDataChanged();
  redirect(`/projects/${project.id}`);
}

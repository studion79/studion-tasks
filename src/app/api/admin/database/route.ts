import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isSuperAdminUserId } from "@/lib/super-admin";
import { resolveDatabaseFilePath } from "@/lib/admin-db";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/generated/prisma";
import { createClient } from "@libsql/client";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { getRequestLocale } from "@/lib/i18n/server";
import { emitAdminDataChanged } from "@/lib/actions/_helpers";

type SessionUser = { id?: string; isSuperAdmin?: boolean };

function isAllowed(user: SessionUser | undefined): boolean {
  return Boolean(user?.isSuperAdmin) || isSuperAdminUserId(user?.id);
}

function hasSqliteHeader(buffer: Buffer): boolean {
  if (buffer.length < 16) return false;
  return buffer.subarray(0, 16).toString("ascii") === "SQLite format 3\u0000";
}

function createPrismaForFile(dbPath: string): PrismaClient {
  const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter } as never);
}

type MergeSummary = {
  projects: number;
  tasks: number;
};

type ImportMode = "overwrite" | "merge";

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

async function getTableColumns(dbPath: string, table: string): Promise<Set<string>> {
  const client = createClient({ url: `file:${dbPath}` });
  try {
    const escaped = table.replace(/"/g, "\"\"");
    const result = await client.execute(`PRAGMA table_info("${escaped}")`);
    const cols = new Set<string>();
    for (const row of result.rows) {
      if (!row || typeof row !== "object") continue;
      const name = asString((row as Record<string, unknown>).name);
      if (name) cols.add(name);
    }
    return cols;
  } finally {
    client.close();
  }
}

async function listTables(dbPath: string): Promise<Set<string>> {
  const client = createClient({ url: `file:${dbPath}` });
  try {
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    const tables = new Set<string>();
    for (const row of result.rows) {
      if (!row || typeof row !== "object") continue;
      const name = asString((row as Record<string, unknown>).name);
      if (name) tables.add(name);
    }
    return tables;
  } finally {
    client.close();
  }
}

async function validateImportedDatabase(
  tempPath: string,
  mode: ImportMode,
  isEn: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const requiredTablesByMode: Record<ImportMode, string[]> = {
    merge: [
      "Project",
      "ProjectColumn",
      "ProjectView",
      "ProjectDashboardWidget",
      "Group",
      "Task",
      "TaskFieldValue",
      "TaskDependency",
      "SavedView",
      "Automation",
    ],
    overwrite: [
      "User",
      "Project",
      "ProjectMember",
      "ProjectColumn",
      "ProjectView",
      "ProjectDashboardWidget",
      "Group",
      "Task",
      "TaskFieldValue",
      "TaskDependency",
      "SavedView",
      "Notification",
    ],
  };

  const requiredColumns: Record<string, string[]> = {
    Project: ["id", "name"],
    Group: ["id", "projectId", "name", "position"],
    Task: ["id", "groupId", "title", "position"],
    ProjectColumn: ["id", "projectId", "type", "label", "position", "isActive"],
    TaskFieldValue: ["id", "taskId", "columnId", "value"],
    TaskDependency: ["id", "blockerId", "blockedId"],
  };

  try {
    const tables = await listTables(tempPath);
    const requiredTables = requiredTablesByMode[mode];
    const missingTables = requiredTables.filter((table) => !tables.has(table));
    if (missingTables.length > 0) {
      return {
        ok: false,
        error: isEn
          ? `Imported database incompatible: missing table(s): ${missingTables.join(", ")}.`
          : `Base importée incompatible: table(s) manquante(s): ${missingTables.join(", ")}.`,
      };
    }

    const missingColumns: string[] = [];
    for (const [table, cols] of Object.entries(requiredColumns)) {
      if (!requiredTables.includes(table)) continue;
      const existingCols = await getTableColumns(tempPath, table);
      for (const col of cols) {
        if (!existingCols.has(col)) {
          missingColumns.push(`${table}.${col}`);
        }
      }
    }

    if (missingColumns.length > 0) {
      return {
        ok: false,
        error: isEn
          ? `Imported database incompatible: missing column(s): ${missingColumns.join(", ")}.`
          : `Base importée incompatible: colonne(s) manquante(s): ${missingColumns.join(", ")}.`,
      };
    }
  } catch {
    return {
      ok: false,
      error: isEn
        ? "Unable to validate imported database structure."
        : "Impossible de valider la structure de la base importée.",
    };
  }

  return { ok: true };
}

async function mergeDatabase(tempPath: string): Promise<MergeSummary> {
  const source = createPrismaForFile(tempPath);
  try {
    const sourceProjects = await source.project.findMany({
      include: {
        columns: { orderBy: { position: "asc" } },
        views: { orderBy: { position: "asc" } },
        dashboardWidgets: { orderBy: { position: "asc" } },
        groups: {
          orderBy: { position: "asc" },
          include: {
            tasks: {
              orderBy: { position: "asc" },
              include: {
                fieldValues: true,
                blockerDeps: { select: { blockedId: true } },
              },
            },
          },
        },
      },
    });

    let importedProjects = 0;
    let importedTasks = 0;

    for (const project of sourceProjects) {
    const savedViews = await source.savedView.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
    });
    const automations = await source.automation.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
    });

      const projectId = randomUUID();

    const columnIdMap = new Map<string, string>();
    const groupIdMap = new Map<string, string>();
    const taskIdMap = new Map<string, string>();

      await prisma.project.create({
        data: {
          id: projectId,
          name: project.name,
          description: project.description,
        },
      });

    for (const column of project.columns) {
      const newId = randomUUID();
      columnIdMap.set(column.id, newId);
      await prisma.projectColumn.create({
        data: {
          id: newId,
          projectId,
          type: column.type,
          label: column.label,
          position: column.position,
          isActive: column.isActive,
        },
      });
    }

    for (const view of project.views) {
      await prisma.projectView.create({
        data: {
          id: randomUUID(),
          projectId,
          type: view.type,
          name: view.name,
          isDefault: view.isDefault,
          position: view.position,
        },
      });
    }

    for (const widget of project.dashboardWidgets) {
      await prisma.projectDashboardWidget.create({
        data: {
          id: randomUUID(),
          projectId,
          type: widget.type,
          position: widget.position,
          isActive: widget.isActive,
          config: widget.config,
        },
      });
    }

    for (const group of project.groups) {
      const newId = randomUUID();
      groupIdMap.set(group.id, newId);
      await prisma.group.create({
        data: {
          id: newId,
          projectId,
          name: group.name,
          color: group.color,
          position: group.position,
        },
      });
    }

    const allTasks = project.groups.flatMap((g) => g.tasks);

    for (const task of allTasks) {
      const newTaskId = randomUUID();
      taskIdMap.set(task.id, newTaskId);
      const mappedGroupId = groupIdMap.get(task.groupId);
      if (!mappedGroupId) continue;

      await prisma.task.create({
        data: {
          id: newTaskId,
          groupId: mappedGroupId,
          parentId: null,
          title: task.title,
          position: task.position,
          archivedAt: task.archivedAt,
          completedAt: task.completedAt,
          recurrence: task.recurrence,
        },
      });
      importedTasks += 1;
    }

    for (const task of allTasks) {
      if (!task.parentId) continue;
      const currentTaskId = taskIdMap.get(task.id);
      const mappedParentId = taskIdMap.get(task.parentId);
      if (!currentTaskId || !mappedParentId) continue;

      await prisma.task.update({
        where: { id: currentTaskId },
        data: { parentId: mappedParentId },
      });
    }

    for (const task of allTasks) {
      const mappedTaskId = taskIdMap.get(task.id);
      if (!mappedTaskId) continue;

      for (const fieldValue of task.fieldValues) {
        const mappedColumnId = columnIdMap.get(fieldValue.columnId);
        if (!mappedColumnId) continue;
        await prisma.taskFieldValue.create({
          data: {
            id: randomUUID(),
            taskId: mappedTaskId,
            columnId: mappedColumnId,
            value: fieldValue.value,
          },
        });
      }
    }

    const dependencyPairs = new Set<string>();
    for (const task of allTasks) {
      for (const dep of task.blockerDeps) {
        const blockerId = taskIdMap.get(task.id);
        const blockedId = taskIdMap.get(dep.blockedId);
        if (!blockerId || !blockedId) continue;
        const key = `${blockerId}->${blockedId}`;
        if (dependencyPairs.has(key)) continue;
        dependencyPairs.add(key);
        await prisma.taskDependency.create({
          data: {
            id: randomUUID(),
            blockerId,
            blockedId,
          },
        });
      }
    }

    for (const savedView of savedViews) {
      await prisma.savedView.create({
        data: {
          id: randomUUID(),
          projectId,
          name: savedView.name,
          snapshot: savedView.snapshot,
        },
      });
    }

    for (const automation of automations) {
      await prisma.automation.create({
        data: {
          id: randomUUID(),
          projectId,
          name: automation.name,
          isActive: automation.isActive,
          trigger: automation.trigger,
          action: automation.action,
        },
      });
    }

      importedProjects += 1;
    }

    return { projects: importedProjects, tasks: importedTasks };
  } finally {
    await source.$disconnect().catch(() => {});
  }
}

export async function GET(request: Request) {
  const locale = getRequestLocale(request);
  const isEn = locale === "en";
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!isAllowed(user)) {
    return new Response(isEn ? "Access denied" : "Accès refusé", { status: 403 });
  }

  const dbPath = resolveDatabaseFilePath();
  const content = await readFile(dbPath);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `task-app-db-${date}.db`;

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const locale = getRequestLocale(request);
  const isEn = locale === "en";
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!isAllowed(user)) {
    return Response.json({ ok: false, error: isEn ? "Access denied." : "Accès refusé" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("database");
  const mode: ImportMode = formData.get("mode") === "merge" ? "merge" : "overwrite";
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ ok: false, error: isEn ? "No file provided." : "Aucun fichier fourni" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasSqliteHeader(bytes)) {
    return Response.json({ ok: false, error: isEn ? "Invalid file: expected SQLite database (.db)." : "Fichier invalide: base SQLite attendue (.db)." }, { status: 400 });
  }

  const dbPath = resolveDatabaseFilePath();
  const dbDir = path.dirname(dbPath);
  await mkdir(dbDir, { recursive: true });

  const stamp = Date.now();
  const backupPath = `${dbPath}.backup-${stamp}`;
  const tempPath = `${dbPath}.import-${stamp}.tmp`;

  await writeFile(tempPath, bytes);
  const imported = await stat(tempPath);
  if (imported.size === 0) {
    await unlink(tempPath).catch(() => {});
    return Response.json({ ok: false, error: isEn ? "Imported database is empty." : "La base importée est vide." }, { status: 400 });
  }

  const validation = await validateImportedDatabase(tempPath, mode, isEn);
  if (!validation.ok) {
    await unlink(tempPath).catch(() => {});
    return Response.json({ ok: false, error: validation.error }, { status: 400 });
  }

  if (mode === "merge") {
    try {
      const merged = await mergeDatabase(tempPath);
      await unlink(tempPath).catch(() => {});
      emitAdminDataChanged();
      return Response.json({
        ok: true,
        message: isEn
          ? `Merged import: ${merged.projects} project(s) and ${merged.tasks} task(s) added.`
          : `Import fusionné: ${merged.projects} projet(s) et ${merged.tasks} tâche(s) ajoutés.`,
      });
    } catch {
      await unlink(tempPath).catch(() => {});
      return Response.json(
        {
          ok: false,
          error: isEn
            ? "Merged import failed. Verify the source database comes from the same application version."
            : "Échec de l'import fusionné. Vérifiez que la base source provient de la même version de l'application.",
        },
        { status: 400 }
      );
    }
  }

  // Close Prisma before filesystem swap to avoid locked file issues.
  await prisma.$disconnect().catch(() => {});

  try {
    await rename(dbPath, backupPath);
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") {
      await unlink(tempPath).catch(() => {});
      throw error;
    }
  }
  await rename(tempPath, dbPath);

  // Reconnect eagerly so next requests use the imported DB.
  await prisma.$connect().catch(() => {});
  emitAdminDataChanged();

  return Response.json({
    ok: true,
    message: isEn
      ? "Database imported successfully (full replacement of active database)."
      : "Base importée avec succès (remplacement complet de la base active).",
    backupFile: path.basename(backupPath),
  });
}

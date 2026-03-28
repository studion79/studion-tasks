import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isSuperAdminUserId } from "@/lib/super-admin";

type SessionUser = {
  id?: string;
  isSuperAdmin?: boolean;
};

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function recurrenceLabel(recurrence: string | null): { rule: string; endDate: string } {
  if (!recurrence) return { rule: "", endDate: "" };
  try {
    const parsed = JSON.parse(recurrence) as {
      frequency?: "daily" | "weekly" | "monthly";
      interval?: number;
      endDate?: string | null;
    };
    const interval = Math.max(1, Number(parsed.interval ?? 1));
    const frequency = parsed.frequency ?? "weekly";
    const unitMap: Record<string, string> = {
      daily: "jour(s)",
      weekly: "semaine(s)",
      monthly: "mois",
    };
    return {
      rule: `tous les ${interval} ${unitMap[frequency] ?? frequency}`,
      endDate: parsed.endDate ?? "",
    };
  } catch {
    return { rule: recurrence, endDate: "" };
  }
}

export async function GET() {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  const isSuperAdmin = Boolean(user?.isSuperAdmin) || isSuperAdminUserId(user?.id);
  if (!isSuperAdmin) {
    return new Response("Accès refusé", { status: 403 });
  }

  const tasks = await prisma.task.findMany({
    include: {
      group: {
        include: {
          project: { select: { id: true, name: true } },
        },
      },
      fieldValues: {
        include: {
          column: { select: { type: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const header = [
    "project_id",
    "project_name",
    "group_name",
    "task_id",
    "task_title",
    "owner",
    "status",
    "priority",
    "due_date",
    "timeline",
    "notes",
    "recurrence_rule",
    "recurrence_end_date",
    "archived_at",
    "completed_at",
    "created_at",
    "updated_at",
  ];

  const rows = tasks.map((task) => {
    const byType = (type: string) =>
      task.fieldValues.find((fv) => fv.column.type === type)?.value ?? "";
    const recurrence = recurrenceLabel(task.recurrence);
    return [
      task.group.project.id,
      task.group.project.name,
      task.group.name,
      task.id,
      task.title,
      byType("OWNER"),
      byType("STATUS"),
      byType("PRIORITY"),
      byType("DUE_DATE"),
      byType("TIMELINE"),
      byType("NOTES"),
      recurrence.rule,
      recurrence.endDate,
      task.archivedAt ? task.archivedAt.toISOString() : "",
      task.completedAt ? task.completedAt.toISOString() : "",
      task.createdAt.toISOString(),
      task.updatedAt.toISOString(),
    ].map((v) => escapeCsv(String(v))).join(",");
  });

  const content = "\uFEFF" + [header.join(","), ...rows].join("\n");
  const today = new Date().toISOString().slice(0, 10);

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="task-app-backup-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

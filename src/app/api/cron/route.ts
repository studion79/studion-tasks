/**
 * GET /api/cron?secret=<CRON_SECRET>
 *
 * Triggered by an external cron job (e.g. server crontab or Vercel cron).
 * Runs for every project:
 *  - generateDueDateReminders — creates DUE_DATE_SOON in-app notifications
 *  - generateRecurringTasks   — creates next occurrence of recurring tasks
 *
 * Config via env vars:
 *   CRON_SECRET — shared secret to authenticate the request (required in production)
 *
 * Crontab example (daily at 08:00):
 *   0 8 * * * curl -s "http://localhost:3000/api/cron?secret=$CRON_SECRET" >> /var/log/cron.log
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateRecurringTasks, generateDueDateReminders } from "@/lib/actions";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // In production, require a secret; in dev without secret configured, allow freely
  if (secret) {
    const provided = req.nextUrl.searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const projects = await prisma.project.findMany({ select: { id: true, name: true } });

  let remindersTotal = 0;
  let recurringTotal = 0;
  const errors: string[] = [];

  for (const project of projects) {
    try {
      await generateDueDateReminders(project.id);
      remindersTotal++;
    } catch (e) {
      errors.push(`reminders[${project.id}]: ${String(e)}`);
    }
    try {
      await generateRecurringTasks(project.id);
      recurringTotal++;
    } catch (e) {
      errors.push(`recurring[${project.id}]: ${String(e)}`);
    }
  }

  console.log(
    `[cron] ${new Date().toISOString()} — ${projects.length} projects processed` +
    ` (reminders: ${remindersTotal}, recurring: ${recurringTotal})` +
    (errors.length ? `\nErrors: ${errors.join(", ")}` : "")
  );

  return NextResponse.json({
    ok: true,
    projects: projects.length,
    remindersProcessed: remindersTotal,
    recurringProcessed: recurringTotal,
    errors,
  });
}

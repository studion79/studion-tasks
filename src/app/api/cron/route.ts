/**
 * GET /api/cron?secret=<CRON_SECRET>
 *
 * Triggered by an external cron job (e.g. server crontab or Vercel cron).
 * Runs for every project:
 *  - generateDueDateReminders — creates DUE_DATE_SOON in-app notifications
 *  - generateOverdueReminders — creates OVERDUE in-app notifications
 *  - generateRecurringTasks   — creates next occurrence of recurring tasks
 * Then globally:
 *  - generateDailySummaries   — creates DAILY_SUMMARY in-app notifications
 *
 * Config via env vars:
 *   CRON_SECRET — shared secret to authenticate the request (required in production)
 *
 * Crontab example (daily at 08:00):
 *   0 8 * * * curl -s "http://localhost:3000/api/cron?secret=$CRON_SECRET" >> /var/log/cron.log
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  generateDailySummaries,
  generateDueDateReminders,
  generateOverdueReminders,
  generateRecurringTasks,
  generateTaskTimeReminders,
} from "@/lib/actions";

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
  let timeRemindersTotal = 0;
  let overdueTotal = 0;
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
      await generateTaskTimeReminders(project.id);
      timeRemindersTotal++;
    } catch (e) {
      errors.push(`time-reminders[${project.id}]: ${String(e)}`);
    }
    try {
      await generateOverdueReminders(project.id);
      overdueTotal++;
    } catch (e) {
      errors.push(`overdue[${project.id}]: ${String(e)}`);
    }
    try {
      await generateRecurringTasks(project.id);
      recurringTotal++;
    } catch (e) {
      errors.push(`recurring[${project.id}]: ${String(e)}`);
    }
  }

  let dailySummaryDone = false;
  try {
    await generateDailySummaries();
    dailySummaryDone = true;
  } catch (e) {
    errors.push(`daily-summary: ${String(e)}`);
  }

  console.log(
    `[cron] ${new Date().toISOString()} — ${projects.length} projects processed` +
    ` (reminders: ${remindersTotal}, time-reminders: ${timeRemindersTotal}, overdue: ${overdueTotal}, recurring: ${recurringTotal}, daily: ${dailySummaryDone ? "ok" : "err"})` +
    (errors.length ? `\nErrors: ${errors.join(", ")}` : "")
  );

  return NextResponse.json({
    ok: true,
    projects: projects.length,
    remindersProcessed: remindersTotal,
    timeRemindersProcessed: timeRemindersTotal,
    overdueProcessed: overdueTotal,
    recurringProcessed: recurringTotal,
    dailySummaryDone,
    errors,
  });
}

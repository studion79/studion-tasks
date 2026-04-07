import { notFound } from "next/navigation";
import {
  generateDueDateReminders,
  generateOverdueReminders,
  generateRecurringTasks,
  getAllProjectColumns,
  getMyDisplaySettings,
  getProject,
  getProjectMembers,
  getUnreadNotificationCount,
  listNotifications,
} from "@/lib/actions";
import { ProjectPageClient } from "@/components/project/ProjectPageClient";
import { auth } from "@/auth";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const currentUser = session?.user as { id?: string; isSuperAdmin?: boolean } | undefined;
  const currentUserId = currentUser?.id ?? null;
  const isGlobalAdmin = Boolean(currentUser?.isSuperAdmin);

  // Generate new instances for overdue recurring tasks (idempotent)
  await generateRecurringTasks(id).catch(() => {});
  // Send due-date reminders for tasks due within 2 days (idempotent)
  await generateDueDateReminders(id).catch(() => {});
  // Send overdue reminders (idempotent, once/day/task)
  await generateOverdueReminders(id).catch(() => {});

  const [project, allColumns, members, notifications, unreadCount, displaySettings] = await Promise.all([
    getProject(id),
    getAllProjectColumns(id),
    getProjectMembers(id),
    currentUserId ? listNotifications(currentUserId) : Promise.resolve([]),
    currentUserId ? getUnreadNotificationCount(currentUserId) : Promise.resolve(0),
    currentUserId ? getMyDisplaySettings().catch(() => null) : Promise.resolve(null),
  ]);

  if (!project) notFound();

  return (
    <ProjectPageClient
      project={project}
      allColumns={allColumns}
      initialMembers={members}
      currentUserId={currentUserId}
      isGlobalAdmin={isGlobalAdmin}
      initialNotifications={notifications}
      initialUnreadCount={unreadCount}
      initialDisplaySettings={displaySettings}
    />
  );
}

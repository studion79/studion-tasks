import { notFound } from "next/navigation";
import { getProject, getAllProjectColumns, getProjectMembers, listNotifications, getUnreadNotificationCount, generateRecurringTasks, generateDueDateReminders } from "@/lib/actions";
import { ProjectPageClient } from "@/components/project/ProjectPageClient";
import { auth } from "@/auth";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const currentUserId = (session?.user as { id?: string })?.id ?? null;

  // Generate new instances for overdue recurring tasks (idempotent)
  await generateRecurringTasks(id).catch(() => {});
  // Send due-date reminders for tasks due within 2 days (idempotent)
  await generateDueDateReminders(id).catch(() => {});

  const [project, allColumns, members, notifications, unreadCount] = await Promise.all([
    getProject(id),
    getAllProjectColumns(id),
    getProjectMembers(id),
    currentUserId ? listNotifications(currentUserId) : Promise.resolve([]),
    currentUserId ? getUnreadNotificationCount(currentUserId) : Promise.resolve(0),
  ]);

  if (!project) notFound();

  return (
    <ProjectPageClient
      project={project}
      allColumns={allColumns}
      initialMembers={members}
      currentUserId={currentUserId}
      initialNotifications={notifications}
      initialUnreadCount={unreadCount}
    />
  );
}

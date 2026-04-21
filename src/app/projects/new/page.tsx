import { CreateProjectWizard } from "@/components/project/CreateProjectWizard";

export const metadata = { title: "Nouveau projet" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams?: Promise<{ groupId?: string }>;
}) {
  const params = (await searchParams) ?? {};
  return <CreateProjectWizard initialGroupId={typeof params.groupId === "string" ? params.groupId : undefined} />;
}

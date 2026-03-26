export const dynamic = 'force-dynamic';

import { listProjectTemplates } from "@/lib/actions";
import { TemplatesPageClient } from "@/components/TemplatesPageClient";

export default async function TemplatesPage() {
  const templates = await listProjectTemplates();
  return <TemplatesPageClient templates={templates} />;
}

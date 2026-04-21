import { auth } from "@/auth";
import { getNotificationDeliveryLog } from "@/lib/actions/_helpers";
import { getRequestLocale } from "@/lib/i18n/server";
import { pickByIsEn } from "@/lib/i18n/pick";
import { isSuperAdminUserId } from "@/lib/super-admin";

type SessionUser = { id?: string; isSuperAdmin?: boolean };

function isAllowed(user: SessionUser | undefined): boolean {
  return Boolean(user?.isSuperAdmin) || isSuperAdminUserId(user?.id);
}

export async function GET(request: Request) {
  const locale = getRequestLocale(request);
  const isEn = locale === "en";
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!isAllowed(user)) {
    return Response.json({ ok: false, error: pickByIsEn(isEn, "Accès refusé", "Access denied.") }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit") ?? "200");
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(1000, Math.floor(rawLimit))) : 200;
  const rows = await getNotificationDeliveryLog(limit);
  return Response.json({ ok: true, count: rows.length, rows });
}

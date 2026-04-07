import { isWebPushEnabled, getWebPushPublicKey } from "@/lib/push";

export async function GET() {
  const key = getWebPushPublicKey();
  return Response.json({
    ok: Boolean(key),
    enabled: isWebPushEnabled(),
    publicKey: key ?? null,
  });
}

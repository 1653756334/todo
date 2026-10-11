import { clearSessionCookie } from "@/lib/auth";
import { handler } from "@/lib/api";

export const runtime = "nodejs";

export const POST = handler(async () => {
  await clearSessionCookie();
  return { ok: true };
});

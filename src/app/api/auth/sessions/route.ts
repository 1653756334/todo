import { handler, requireUser } from "@/server/adapters/http";
import { revokeSessions } from "@/server/auth/accounts";
import { clearSessionCookie } from "@/server/adapters/next-session";
export const POST = handler(async () => { await revokeSessions(await requireUser()); await clearSessionCookie(); return { ok: true }; });

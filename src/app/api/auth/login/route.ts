import { login } from "@/server/auth/accounts";
import { clientIp, issueSessionCookie } from "@/server/adapters/next-session";
import { handler, readJson } from "@/server/adapters/http";
export const runtime = "nodejs";
export const POST = handler(async request => {
  const body = await readJson(request);
  const u = await login(body, clientIp(request));
  await issueSessionCookie(u.id, u.sessionVersion);
  const next = typeof body.next === "string" && /^\/(?![\/\\])/.test(body.next) ? body.next : "/today";
  return { ok: true, next, timezone: u.timezone };
});

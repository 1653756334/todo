import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/server/infra/db";
import { appSecret } from "@/server/infra/env";
import { signSession, verifySession } from "@/server/auth/crypto.mjs";
import type { Actor } from "@/server/auth/permissions";
export const SESSION_COOKIE = "todo_session";
export type SessionUser = Actor;
const TTL = 30 * 86400000;
export async function issueSessionCookie(userId: string, version: number) {
  (await cookies()).set(SESSION_COOKIE, signSession({ userId, version }, appSecret(), TTL), { httpOnly: true, sameSite: "lax", secure: process.env.APP_URL?.startsWith("https://") ?? false, path: "/", maxAge: TTL / 1000 });
}
export async function clearSessionCookie() { (await cookies()).delete(SESSION_COOKIE); }
export const getSessionUser = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const p = verifySession(token, appSecret());
  if (!p) return null;
  const user = await prisma.user.findUnique({ where: { id: p.userId }, select: { id: true, username: true, displayName: true, timezone: true, role: true, status: true, sessionVersion: true } });
  return user?.status === "ACTIVE" && user.sessionVersion === p.version ? user : null;
});
export function clientIp(request: Request) {
  if (process.env.TRUST_PROXY !== "true") return "local";
  return (request.headers.get("x-real-ip") ?? "local").slice(0, 100);
}
export async function currentTimezone() { return (await getSessionUser())?.timezone ?? "Asia/Shanghai"; }

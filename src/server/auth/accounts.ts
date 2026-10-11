import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/server/infra/db";
import { AppError, assert } from "@/shared/errors";
import { loginSchema, tokenConsumeSchema } from "@/shared/accounts";
import { hashPasswordAsync, verifyPasswordAsync } from "./crypto.mjs";
import { requireAdmin, type Actor } from "./permissions";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const WINDOW = 15 * 60000;
export async function login(input: unknown, ip: string) {
  const body = loginSchema.parse(input);
  const since = new Date(Date.now() - WINDOW);
  const [accountFails, ipFails] = await Promise.all([
    prisma.loginAttempt.count({ where: { username: body.username, succeeded: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { ip, succeeded: false, createdAt: { gte: since } } }),
  ]);
  assert(accountFails < 5 && ipFails < 30, 429, "尝试过多，请 15 分钟后重试", "RATE_LIMIT");
  const u = await prisma.user.findUnique({ where: { username: body.username } });
  // Keep a fixed valid dummy hash so nonexistent accounts also perform scrypt.
  const dummy = `scrypt:${"00".repeat(16)}:${"00".repeat(64)}`;
  const valid = await verifyPasswordAsync(body.password, u?.passwordHash ?? dummy);
  await prisma.loginAttempt.create({ data: { ip, username: body.username, succeeded: !!u && valid && u.status === "ACTIVE" } });
  assert(u && valid && u.status === "ACTIVE", 401, "用户名、密码错误或账号不可用", "LOGIN_FAILED");
  await prisma.loginAttempt.deleteMany({ where: { username: body.username, ip, succeeded: false } });
  return u;
}
export async function createToken(purpose: string, userId: string | null, targetEmail: string | null = null, channelId: string | null = null) {
  const token = randomBytes(32).toString("base64url");
  await prisma.accountToken.create({ data: { purpose, userId, targetEmail, channelId, hash: hash(token), expiresAt: new Date(Date.now() + (purpose === "INVITE" ? 7 * 86400000 : 3600000)) } });
  return token;
}
export async function consumeToken(input: unknown) {
  const b = tokenConsumeSchema.parse(input);
  const newHash = b.password ? await hashPasswordAsync(b.password) : null;
  return prisma.$transaction(async tx => {
    const t = await tx.accountToken.findUnique({ where: { hash: hash(b.token) } });
    assert(t && !t.usedAt && t.expiresAt > new Date(), 400, "链接已失效，请重新申请", "TOKEN_EXPIRED");
    const claimed = await tx.accountToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
    assert(claimed.count === 1, 409, "链接已使用");
    if (t.purpose === "INVITE") {
      assert(b.username && newHash, 400, "请填写用户名和密码");
      assert(!await tx.user.findUnique({ where: { username: b.username } }), 409, "用户名已使用");
      const policy = await tx.systemSetting.findUnique({ where: { group: "policy" } });
      const requiresEmail = (policy?.value as { verification?: string } | undefined)?.verification === "on_signup";
      assert(!requiresEmail || t.targetEmail, 400, "本站已开启账号邮箱验证，请重新申请带邮箱的邀请");
      return tx.user.create({ data: { username: b.username, displayName: b.displayName ?? b.username, passwordHash: newHash, accountEmail: t.targetEmail, status: requiresEmail || t.targetEmail ? "PENDING" : "ACTIVE", preference: { create: {} } } });
    }
    assert(t.userId, 400, "链接无效");
    const current = await tx.user.findUnique({ where: { id: t.userId } });
    assert(current && current.status !== "DISABLED", 403, "账号不可用");
    if (t.purpose === "RESET") {
      assert(newHash, 400, "请填写新密码");
      return tx.user.update({ where: { id: t.userId }, data: { passwordHash: newHash, sessionVersion: { increment: 1 } } });
    }
    if (t.purpose === "VERIFY_CHANNEL") {
      const channel = await tx.notificationChannel.findFirst({ where: { id: t.channelId ?? "", ownerId: t.userId, email: t.targetEmail } });
      assert(channel, 400, "邮箱配置已改变，请重新申请");
      await tx.notificationChannel.update({ where: { id: channel.id }, data: { verifiedAt: new Date(), revision: { increment: 1 } } });
      const pref = await tx.userPreference.update({ where: { userId: t.userId }, data: { notificationVersion: { increment: 1 } } });
      await tx.jobOutbox.create({ data: { kind: "REPLAN_USER", targetId: t.userId, dispatchVersion: pref.notificationVersion, availableAt: new Date() } });
      return tx.user.findUniqueOrThrow({ where: { id: t.userId } });
    }
    assert(t.purpose === "VERIFY_EMAIL" && t.targetEmail, 400, "链接用途不正确");
    return tx.user.update({ where: { id: t.userId }, data: { accountEmail: t.targetEmail, accountEmailVerifiedAt: new Date(), status: "ACTIVE", sessionVersion: { increment: 1 } } });
  });
}
export async function adminUsers(actor: Actor) {
  requireAdmin(actor);
  return prisma.user.findMany({ select: { id: true, username: true, displayName: true, role: true, status: true, accountEmail: true, accountEmailVerifiedAt: true, aiDailyQuotaOverride: true, createdAt: true }, orderBy: { createdAt: "asc" } });
}
export async function updateUser(actor: Actor, id: string, b: { role?: "USER" | "ADMIN"; status?: "ACTIVE" | "DISABLED"; aiDailyQuotaOverride?: number | null }) {
  requireAdmin(actor);
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72135412)`;
    const u = await tx.user.findUnique({ where: { id } }); assert(u, 404, "账号不存在");
    if (u.role === "ADMIN" && u.status === "ACTIVE" && (b.role === "USER" || b.status === "DISABLED")) {
      assert(await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE" } }) > 1, 409, "必须保留至少一名可用管理员");
    }
    await tx.user.update({ where: { id }, data: { ...b, sessionVersion: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "USER_UPDATE", targetId: id, result: "OK" } });
  });
}
export async function revokeSessions(actor: Actor) { await prisma.user.update({ where: { id: actor.id }, data: { sessionVersion: { increment: 1 } } }); }

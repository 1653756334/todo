import { smtpConfig, readGroup } from "@/server/settings/service";
import { buildTransport, fromHeader } from "@/server/notifications/transports/email";
import { appUrl } from "@/server/infra/env";
import { createToken } from "./accounts";
import { prisma } from "@/server/infra/db";
import { assert } from "@/shared/errors";
import { usernameSchema, passwordSchema } from "@/shared/accounts";
import { hashPasswordAsync } from "./crypto.mjs";
import { z } from "zod";
export async function sendAccountMail(email: string, purpose: string, token: string) {
  const config = await smtpConfig(); assert(config, 503, "账号邮件服务暂不可用");
  const transport = buildTransport(config);
  try { await transport.sendMail({ from: fromHeader(config), to: email, subject: "Todo 账号确认", text: `请通过以下链接完成账号操作。链接为一次性使用，请勿转发。\n\n${appUrl()}/account?token=${encodeURIComponent(token)}&purpose=${encodeURIComponent(purpose)}` }); }
  finally { transport.close(); }
}
export async function register(input: unknown, ip: string) {
  const b = z.object({ username: usernameSchema, displayName: z.string().trim().min(1).max(80), password: passwordSchema, email: z.email().nullable().optional() }).strict().parse(input);
  const { value: policy } = await readGroup("policy");
  assert(policy.registrationEnabled, 403, "本站未开放注册");
  assert(policy.verification !== "on_signup" || b.email, 400, "注册需提供并验证邮箱");
  assert(await prisma.loginAttempt.count({ where: { ip, username: "@register", createdAt: { gte: new Date(Date.now() - 3600000) } } }) < 5, 429, "申请过多，请稍后重试");
  await prisma.loginAttempt.create({ data: { ip, username: "@register", succeeded: true } });
  assert(!await prisma.user.findUnique({ where: { username: b.username } }), 409, "用户名已使用");
  const u = await prisma.user.create({ data: { username: b.username, displayName: b.displayName, passwordHash: await hashPasswordAsync(b.password), accountEmail: b.email, status: policy.verification === "on_signup" ? "PENDING" : "ACTIVE", preference: { create: {} } } });
  if (policy.verification === "on_signup" && b.email) { const token = await createToken("VERIFY_EMAIL", u.id, b.email); await sendAccountMail(b.email, "VERIFY_EMAIL", token); }
  return { ok: true, verificationRequired: u.status === "PENDING" };
}
export async function forgot(input: unknown, ip: string) {
  const b = z.object({ email: z.email() }).strict().parse(input);
  const count = await prisma.loginAttempt.count({ where: { ip, username: "@forgot", createdAt: { gte: new Date(Date.now() - 3600000) } } });
  assert(count < 5, 429, "申请过多，请稍后重试");
  await prisma.loginAttempt.create({ data: { ip, username: "@forgot", succeeded: true } });
  const u = await prisma.user.findUnique({ where: { accountEmail: b.email } });
  if (u && u.status === "PENDING") { const t = await createToken("VERIFY_EMAIL", u.id, b.email); await sendAccountMail(b.email, "VERIFY_EMAIL", t).catch(() => {}); }
  else if (u && u.accountEmailVerifiedAt && u.status === "ACTIVE") { const t = await createToken("RESET", u.id, b.email); await sendAccountMail(b.email, "RESET", t).catch(() => {}); }
  return { ok: true, message: "如该邮箱绑定可用账号，将收到验证或重置邮件。" };
}

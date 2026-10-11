import { z } from "zod";
import { handler, requireUser, readJson } from "@/server/adapters/http";
import { prisma } from "@/server/infra/db";
import { hashPasswordAsync, verifyPasswordAsync } from "@/server/auth/crypto.mjs";
import { passwordSchema } from "@/shared/accounts";
import { createToken } from "@/server/auth/accounts";
import { sendAccountMail } from "@/server/auth/account-mail";
import { assert } from "@/shared/errors";
export const GET = handler(async () => {
  const actor = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { id: true, username: true, displayName: true, accountEmail: true, accountEmailVerifiedAt: true, role: true } });
  return { user };
});
export const PUT = handler(async request => {
  const actor = await requireUser();
  const b = z.object({ displayName: z.string().trim().min(1).max(80).optional(), currentPassword: z.string().max(256).optional(), newPassword: passwordSchema.optional(), email: z.email().optional() }).strict().parse(await readJson(request));
  const u = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (b.newPassword || b.email) assert(b.currentPassword && await verifyPasswordAsync(b.currentPassword, u.passwordHash), 403, "请验证当前密码");
  if (b.email) { const token = await createToken("VERIFY_EMAIL", actor.id, b.email); await sendAccountMail(b.email, "VERIFY_EMAIL", token); }
  await prisma.user.update({ where: { id: actor.id }, data: { displayName: b.displayName, ...(b.newPassword ? { passwordHash: await hashPasswordAsync(b.newPassword), sessionVersion: { increment: 1 } } : {}) } });
  return { ok: true, verificationRequired: !!b.email };
});

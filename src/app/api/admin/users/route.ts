import { z } from "zod";
import { handler, requireUser, readJson } from "@/server/adapters/http";
import { adminUsers, updateUser, createToken } from "@/server/auth/accounts";
import { requireAdmin } from "@/server/auth/permissions";
import { sendAccountMail } from "@/server/auth/account-mail";
import { readGroup } from "@/server/settings/service";
import { assert } from "@/shared/errors";
import { appUrl } from "@/server/infra/env";
export const GET = handler(async () => ({ users: await adminUsers(await requireUser()) }));
export const PATCH = handler(async request => {
  const u = await requireUser();
  const b = z.object({ id: z.string(), role: z.enum(["ADMIN", "USER"]).optional(), status: z.enum(["ACTIVE", "DISABLED"]).optional(), aiDailyQuotaOverride: z.number().int().min(0).max(100000).nullable().optional() }).strict().parse(await readJson(request));
  const { id, ...values } = b; await updateUser(u, id, values); return { ok: true };
});
export const POST = handler(async request => {
  const u = await requireUser(); requireAdmin(u);
  const b = z.object({ action: z.enum(["invite", "reset"]), userId: z.string().optional(), email: z.email().nullable().optional(), sendEmail: z.boolean().default(false) }).strict().parse(await readJson(request));
  const { value: policy } = await readGroup("policy");
  if (b.action === "invite") assert(policy.verification !== "on_signup" || b.email, 400, "新账号验证已开启，邀请需指定邮箱");
  else assert(b.userId, 400, "请指定账号");
  const token = await createToken(b.action === "invite" ? "INVITE" : "RESET", b.userId ?? null, b.email ?? null);
  if (b.sendEmail) { assert(b.email, 400, "请填写邮箱"); await sendAccountMail(b.email, b.action === "invite" ? "INVITE" : "RESET", token); return { ok: true, sent: true }; }
  return { ok: true, url: `${appUrl()}/account?token=${encodeURIComponent(token)}&purpose=${b.action === "invite" ? "INVITE" : "RESET"}` };
});

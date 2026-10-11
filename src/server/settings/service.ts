import type { Prisma, NotificationChannel } from "@prisma/client";
import { prisma } from "@/server/infra/db";
import { encryptionKey } from "@/server/infra/env";
import { decryptSecret, encryptSecret } from "@/server/auth/crypto.mjs";
import { requireAdmin, type Actor } from "@/server/auth/permissions";
import { AppError, assert } from "@/shared/errors";
import { smtpSchema, aiSchema, policySchema, preferenceSchema, channelSchema } from "@/shared/settings";
import type { NotifyPolicy } from "@/shared/types";
const schemas = { smtp: smtpSchema, ai: aiSchema, policy: policySchema };
export type Group = keyof typeof schemas;
export async function readGroup<G extends Group>(group: G) {
  const row = await prisma.systemSetting.findUnique({ where: { group } });
  const value = schemas[group].parse(row?.value ?? {});
  return { value, revision: row?.revision ?? 0 } as { value: ReturnType<(typeof schemas)[G]["parse"]>; revision: number };
}
function secretValue(next: unknown, old: unknown) { return next === undefined ? old : next ? encryptSecret(String(next), encryptionKey()) : null; }
export async function saveGroup(actor: Actor, group: Group, input: unknown, expectedRevision: number) {
  requireAdmin(actor);
  const parsed = schemas[group].parse(input) as Record<string, unknown>;
  const old = await readGroup(group);
  if (group === "smtp") parsed.pass = secretValue(parsed.pass, (old.value as Record<string,unknown>).pass);
  if (group === "ai") {
    parsed.apiKey = secretValue(parsed.apiKey, (old.value as Record<string,unknown>).apiKey);
    assert(!parsed.enabled || !!parsed.baseUrl && !!parsed.model, 400, "开启 AI 前请填写接口和模型");
    if (parsed.baseUrl) { const url = new URL(String(parsed.baseUrl)); assert(["https:", "http:"].includes(url.protocol) && !url.username && !url.password, 400, "AI 地址必须为 HTTP(S) 且不含用户名密码"); }
  }
  if (group === "policy" && parsed.verification === "on_signup") assert(await smtpConfig(), 400, "注册验证需要先配置 SMTP");
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72135413)`;
    const row = await tx.systemSetting.findUnique({ where: { group } });
    if (group === "smtp" && (!parsed.host || !parsed.fromAddress)) {
      const policy = policySchema.parse((await tx.systemSetting.findUnique({where:{group:"policy"}}))?.value ?? {});
      assert(policy.verification !== "on_signup",400,"请先关闭新账号邮箱验证，再清除 SMTP 配置");
    }
    assert((row?.revision ?? 0) === expectedRevision, 409, "配置已被修改，请重新加载", "CONFLICT");
    await tx.systemSetting.upsert({ where: { group }, create: { group, value: parsed as Prisma.InputJsonValue, updatedBy: actor.id }, update: { value: parsed as Prisma.InputJsonValue, revision: { increment: 1 }, updatedBy: actor.id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: `SETTINGS_${group}`, result: "OK" } });
    if (group === "policy" || group === "smtp") await tx.jobOutbox.create({ data: { kind: "REPLAN_ALL", targetId: group, dispatchVersion: (row?.revision ?? 0) + 1, availableAt: new Date() } });
  });
}
export async function publicGroup(actor: Actor, group: Group) {
  requireAdmin(actor);
  const r = await readGroup(group);
  const v = { ...r.value } as Record<string,unknown>;
  for (const k of ["pass", "apiKey"]) if (k in v) { v[`${k}Configured`] = !!v[k]; delete v[k]; }
  return { value: v, revision: r.revision };
}
export async function smtpConfig() {
  const { value: v } = await readGroup("smtp");
  if (!v.host || !v.fromAddress) return null;
  return { ...v, pass: v.pass ? decryptSecret(v.pass, encryptionKey()) : "", toAddress: "" };
}
export async function aiConfig(actor?: Actor) {
  const { value: v, revision } = await readGroup("ai");
  if (!v.enabled || !v.baseUrl || !v.model || actor && actor.role !== "ADMIN" && !v.publicEnabled) return null;
  return { ...v, revision, apiKey: v.apiKey ? decryptSecret(v.apiKey, encryptionKey()) : "" };
}
export async function preference(actor: Actor) {
  const p = await prisma.userPreference.upsert({ where: { userId: actor.id }, create: { userId: actor.id }, update: {} });
  return { timezone: actor.timezone, remindEnabled: p.remindEnabled, remindLeadMin: p.remindLeadMin };
}
export async function savePreference(actor: Actor, input: unknown) {
  const b = preferenceSchema.parse(input);
  await prisma.$transaction([
    prisma.user.update({ where: { id: actor.id }, data: { timezone: b.timezone } }),
    prisma.userPreference.upsert({ where: { userId: actor.id }, create: { userId: actor.id, remindEnabled: b.remindEnabled, remindLeadMin: b.remindLeadMin }, update: { remindEnabled: b.remindEnabled, remindLeadMin: b.remindLeadMin } }),
  ]);
}
export function channelPublic(c: NotificationChannel) {
  const { webhookEncrypted, signSecretEncrypted, ...rest } = c;
  return { ...rest, webhookConfigured: !!webhookEncrypted, signSecretConfigured: !!signSecretEncrypted };
}
export async function listChannels(actor: Actor) { return (await prisma.notificationChannel.findMany({ where: { ownerId: actor.id }, orderBy: { createdAt: "asc" } })).map(channelPublic); }
export async function saveChannel(actor: Actor, input: unknown) {
  const b = channelSchema.parse(input);
  const old = b.id ? await prisma.notificationChannel.findFirst({ where: { id: b.id, ownerId: actor.id } }) : null;
  assert(!b.id || old, 404, "渠道不存在");
  assert(!old || old.type === b.type, 400, "不能更改渠道类型");
  const policy = (await readGroup("policy")).value;
  assert(!b.enabled || old?.enabled || (b.type === "EMAIL" ? policy.emailAllowed : policy.webhookAllowed), 403, "管理员已暂停此通知类型");
  if (b.webhook) { const u = new URL(b.webhook); assert(["https:", "http:"].includes(u.protocol) && !u.username && !u.password, 400, "Webhook 地址无效"); }
  const email = b.email === undefined ? old?.email ?? null : b.email;
  const webhookEncrypted = secretValue(b.webhook, old?.webhookEncrypted) as string | null ?? null;
  const signSecretEncrypted = secretValue(b.signSecret, old?.signSecretEncrypted) as string | null ?? null;
  assert(!b.enabled || (b.type === "EMAIL" ? email : webhookEncrypted), 400, "启用前请填写渠道地址");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  const verifiedAt = old?.email === email ? old?.verifiedAt : user.accountEmail === email ? user.accountEmailVerifiedAt : null;
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.id}))`;
    if (old) assert((await tx.notificationChannel.findUniqueOrThrow({ where: { id: old.id } })).revision === b.expectedRevision, 409, "渠道已被修改，请重新加载", "CONFLICT");
    const data = { label: b.label, enabled: b.enabled, minPriority: b.minPriority, brief: b.brief, email, verifiedAt, webhookEncrypted, signSecretEncrypted };
    const c = old ? await tx.notificationChannel.update({ where: { id: old.id }, data: { ...data, revision: { increment: 1 } } }) : await tx.notificationChannel.create({ data: { ...data, ownerId: actor.id, type: b.type } });
    const p = await tx.userPreference.upsert({ where: { userId: actor.id }, create: { userId: actor.id, notificationVersion: 2 }, update: { notificationVersion: { increment: 1 } } });
    await tx.jobOutbox.create({ data: { kind: "REPLAN_USER", targetId: actor.id, dispatchVersion: p.notificationVersion, availableAt: new Date() } });
    return channelPublic(c);
  });
}
export async function removeChannel(actor: Actor, id: string) {
  await prisma.$transaction(async tx => {
    const c = await tx.notificationChannel.findFirst({ where: { id, ownerId: actor.id } }); assert(c, 404, "渠道不存在");
    await tx.notificationDelivery.updateMany({ where: { channelId: id, status: { in: ["PENDING", "RETRY_WAIT", "SENDING"] } }, data: { status: "CANCELED", claimToken: null, lockedUntil: null } });
    await tx.notificationChannel.delete({ where: { id } });
    const p = await tx.userPreference.update({ where: { userId: actor.id }, data: { notificationVersion: { increment: 1 } } });
    await tx.jobOutbox.create({ data: { kind: "REPLAN_USER", targetId: actor.id, dispatchVersion: p.notificationVersion, availableAt: new Date() } });
  });
}
export async function capabilities(actor: Actor) {
  const [{ value: policy }, smtp, ai, channels] = await Promise.all([readGroup("policy"), smtpConfig().catch(() => null), aiConfig(actor).catch(() => null), prisma.notificationChannel.findMany({ where: { ownerId: actor.id, enabled: true } })]);
  const active = channels.filter(c => c.type === "EMAIL" ? policy.emailAllowed && smtp && c.email && c.verifiedAt : policy.webhookAllowed && c.webhookEncrypted);
  const notify: NotifyPolicy = { email: null, bot: null };
  const levels = ["low", "normal", "high"];
  for (const c of active) { const key = c.type === "EMAIL" ? "email" : "bot"; if (!notify[key] || levels.indexOf(c.minPriority) < levels.indexOf(notify[key]!)) notify[key] = c.minPriority as NonNullable<NotifyPolicy["email"]>; }
  return { aiConfigured: !!ai, smtpConfigured: active.some(c => c.type === "EMAIL"), botConfigured: active.some(c => c.type === "WEBHOOK"), notify, policy };
}

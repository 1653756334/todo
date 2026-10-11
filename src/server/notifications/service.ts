import { prisma } from "@/server/infra/db";
import type { Prisma } from "@prisma/client";
import { smtpSchema, policySchema } from "@/shared/settings";
import { reminderIntent, ACTIVE_DELIVERIES } from "./plan";
export async function cancelPlans(tx: Prisma.TransactionClient, taskId: string) {
  await tx.notificationDelivery.updateMany({ where: { reminder: { taskId }, status: { in: ACTIVE_DELIVERIES } }, data: { status: "CANCELED", claimToken: null, lockedUntil: null } });
  await tx.reminder.updateMany({ where: { taskId, status: { in: ["pending", "claimed"] } }, data: { status: "canceled" } });
}
export async function replanTask(tx: Prisma.TransactionClient, taskId: string, now = new Date()) {
  const task = await tx.task.findUnique({ where: { id: taskId }, include: { project: true, owner: { include: { preference: true, channels: true } } } });
  if (!task) return;
  const groups = await tx.systemSetting.findMany({ where: { group: { in: ["policy", "smtp"] } } });
  const policy = policySchema.parse(groups.find(x => x.group === "policy")?.value ?? {});
  const smtp = smtpSchema.parse(groups.find(x => x.group === "smtp")?.value ?? {});
  const ranks = ["low", "normal", "high"];
  const channels = task.owner.status === "ACTIVE" ? task.owner.channels.filter(c => c.enabled && ranks.indexOf(task.priority) >= ranks.indexOf(c.minPriority) && (c.type === "EMAIL" ? policy.emailAllowed && smtp.host && smtp.fromAddress && c.email && c.verifiedAt : policy.webhookAllowed && c.webhookEncrypted)).sort((a,b)=>a.id.localeCompare(b.id)) : [];
  const intent = reminderIntent(task, !!task.project?.archivedAt, channels.length, now);
  const key = intent ? JSON.stringify({ intent: intent.intentKey, channels: channels.map(c=>[c.id,c.revision]), userVersion: task.owner.preference?.notificationVersion ?? 1 }) : null;
  if (key === task.reminderFingerprint) return;
  const previous = task.reminderFingerprint ? JSON.parse(task.reminderFingerprint) as { intent: string } : null;
  // Text edits/config changes cannot create another immediate notification after acceptance.
  const settled = intent && previous?.intent === intent.intentKey && await tx.notificationDelivery.count({ where: { reminder: { taskId, planVersion: task.reminderVersion }, status: "SENT" } });
  await cancelPlans(tx, taskId);
  if (settled) { await tx.task.update({ where: { id: taskId }, data: { reminderFingerprint: key } }); return; }
  const version = task.reminderVersion + 1;
  await tx.task.update({ where: { id: taskId }, data: { reminderVersion: version, reminderFingerprint: key } });
  if (!intent) return;
  const reminder = await tx.reminder.create({ data: { taskId, recipientUserId: task.ownerId, planVersion: version, triggerAt: intent.triggerAt, dueSnapshot: task.dueAt! } });
  for (const c of channels) {
    const d = await tx.notificationDelivery.create({ data: { reminderId: reminder.id, channelId: c.id, channelType: c.type, labelSnapshot: c.label, channelRevision: c.revision, recipientVersion: task.owner.preference?.notificationVersion ?? 1, nextAttemptAt: intent.triggerAt } });
    await tx.jobOutbox.create({ data: { kind: "DELIVERY", targetId: d.id, dispatchVersion: d.dispatchVersion, availableAt: intent.triggerAt } });
  }
}
export async function replanUser(userId: string) {
  const rows = await prisma.task.findMany({ where: { ownerId: userId, status: { not: "done" } }, select: { id: true } });
  for (const t of rows) await prisma.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${t.id} FOR UPDATE`; await replanTask(tx, t.id); });
}

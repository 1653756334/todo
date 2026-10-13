import { prisma } from "@/server/infra/db";
import type { Prisma } from "@prisma/client";
import { smtpSchema, policySchema } from "@/shared/settings";
import { reminderIntents, parsePlanFingerprint, ACTIVE_DELIVERIES, type ReminderSlot } from "./plan";
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
  const intents = reminderIntents(task, !!task.project?.archivedAt, channels.length, now);
  const userVersion = task.owner.preference?.notificationVersion ?? 1;
  const key = intents.length
    ? JSON.stringify({
        intents: Object.fromEntries(intents.map(i => [i.slot, i.intentKey])),
        channels: channels.map(c => [c.id, c.revision]),
        userVersion,
      })
    : null;
  if (key === task.reminderFingerprint) return;
  const previous = parsePlanFingerprint(task.reminderFingerprint);
  // 这个任务上已经发出去过的锚点：文字改动/渠道调整不会让它再发一次。
  // 提醒分槽保存，改期后旧版的「已发送」记录也要算数，所以按（锚点, 时刻）比对，而不是按计划版本。
  const keep = new Set<ReminderSlot>();
  if (previous && intents.length) {
    const sent = await tx.notificationDelivery.findMany({
      where: { reminder: { taskId, slot: { in: intents.map(i => i.slot) } }, status: "SENT" },
      select: { reminder: { select: { slot: true, dueSnapshot: true } } },
    });
    const sentKeys = new Set(sent.map(d => `${d.reminder.slot}:${d.reminder.dueSnapshot.toISOString()}`));
    for (const intent of intents) {
      if (previous.intents[intent.slot] === intent.intentKey && sentKeys.has(`${intent.slot}:${intent.anchorAt.toISOString()}`)) keep.add(intent.slot);
    }
  }
  await cancelPlans(tx, taskId);
  // 所有锚点都已经发过：只更新指纹，保留版本号，让界面上那条「已发送」记录留着。
  if (intents.length > 0 && keep.size === intents.length) {
    await tx.task.update({ where: { id: taskId }, data: { reminderFingerprint: key } });
    return;
  }
  const version = task.reminderVersion + 1;
  await tx.task.update({ where: { id: taskId }, data: { reminderVersion: version, reminderFingerprint: key } });
  for (const intent of intents) {
    if (keep.has(intent.slot)) continue;
    const reminder = await tx.reminder.create({
      data: { taskId, recipientUserId: task.ownerId, planVersion: version, slot: intent.slot, triggerAt: intent.triggerAt, dueSnapshot: intent.anchorAt },
    });
    for (const c of channels) {
      const d = await tx.notificationDelivery.create({ data: { reminderId: reminder.id, channelId: c.id, channelType: c.type, labelSnapshot: c.label, channelRevision: c.revision, recipientVersion: userVersion, nextAttemptAt: intent.triggerAt } });
      await tx.jobOutbox.create({ data: { kind: "DELIVERY", targetId: d.id, dispatchVersion: d.dispatchVersion, availableAt: intent.triggerAt } });
    }
  }
}
export async function replanUser(userId: string) {
  const rows = await prisma.task.findMany({ where: { ownerId: userId, status: { not: "done" } }, select: { id: true } });
  for (const t of rows) await prisma.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${t.id} FOR UPDATE`; await replanTask(tx, t.id); });
}

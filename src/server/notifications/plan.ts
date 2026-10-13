import type { Task } from "@prisma/client";

/** 提醒锚点：start = 区间开始时提醒，end = 截止时间时提醒。 */
export const REMINDER_SLOTS = ["start", "end"] as const;
export type ReminderSlot = (typeof REMINDER_SLOTS)[number];

export type ReminderIntent = {
  slot: ReminderSlot;
  triggerAt: Date;
  /** 锚点时刻（开始或截止），用于通知正文与提醒记录。 */
  anchorAt: Date;
  intentKey: string;
};

type PlannableTask = Pick<
  Task,
  "status" | "startAt" | "dueAt" | "remindEnabled" | "remindLeadMin" | "remindStartLeadMin"
>;

/**
 * 任务当前应该排哪些提醒：有时间区间的任务有「开始前」「截止前」各一条，
 * 只有截止时间的任务还是「截止前」一条。
 * 已经过去的时间点不补提醒（和原来的行为一致）。
 */
export function reminderIntents(
  task: PlannableTask,
  archived: boolean,
  channels: number,
  now: Date,
): ReminderIntent[] {
  if (task.status === "done" || !task.dueAt || !task.remindEnabled || archived || !channels) return [];
  const intents: ReminderIntent[] = [];
  const add = (slot: ReminderSlot, anchorAt: Date | null, leadMin: number) => {
    if (!anchorAt || anchorAt <= now) return;
    intents.push({
      slot,
      anchorAt,
      triggerAt: new Date(Math.max(now.getTime(), anchorAt.getTime() - leadMin * 60000)),
      intentKey: `${slot}:${anchorAt.toISOString()}/${leadMin}`,
    });
  };
  if (task.startAt) add("start", task.startAt, task.remindStartLeadMin);
  add("end", task.dueAt, task.remindLeadMin);
  return intents;
}

/** 计划指纹里记录的槽位 -> 意图键 */
export type PlanIntents = Partial<Record<ReminderSlot, string>>;

/**
 * 读取任务上保存的计划指纹。第一版只有一条截止提醒（形如 `2026-01-01T00:00:00.000Z/60`），
 * 这里把它归到 end 槽，避免升级后已发出的提醒被当成新的再发一次。
 */
export function parsePlanFingerprint(raw: string | null): { intents: PlanIntents } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { intent?: string; intents?: PlanIntents };
    if (parsed.intents && typeof parsed.intents === "object") return { intents: parsed.intents };
    if (typeof parsed.intent === "string") return { intents: { end: `end:${parsed.intent}` } };
  } catch {
    // 指纹损坏时按「没有历史计划」处理
  }
  return null;
}

export const ACTIVE_DELIVERIES = ["PENDING", "RETRY_WAIT", "SENDING"];

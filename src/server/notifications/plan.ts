import type { Task } from "@prisma/client";
export function reminderIntent(task: Pick<Task, "status" | "dueAt" | "remindEnabled" | "remindLeadMin">, archived: boolean, channels: number, now: Date) {
  if (task.status === "done" || !task.dueAt || !task.remindEnabled || archived || !channels) return null;
  if (task.dueAt <= now) return null;
  return { triggerAt: new Date(Math.max(now.getTime(), task.dueAt.getTime() - task.remindLeadMin * 60000)), intentKey: `${task.dueAt.toISOString()}/${task.remindLeadMin}` };
}
export const ACTIVE_DELIVERIES = ["PENDING", "RETRY_WAIT", "SENDING"];

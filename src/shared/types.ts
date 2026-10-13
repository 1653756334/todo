export type ProjectOption = {
  id: string;
  name: string;
  color: string | null;
  repoUrl?: string | null;
  openCount?: number;
};

export type TaskLinkDTO = { kind: string; url: string; label: string | null };

export type TaskDTO = {
  revision: number;
  id: string;
  title: string;
  notes: string | null;
  status: string;
  priority: string;
  /** 区间开始时间；null 表示这个任务只有一个截止时间。 */
  startAt: string | null;
  dueAt: string | null;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  tags: string[];
  links: TaskLinkDTO[];
  remindEnabled: boolean;
  remindLeadMin: number;
  remindStartLeadMin: number;
  sourceId: string | null;
  sourceText: string | null;
  sourceImages: { id: string; name: string; url: string }[];
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 按锚点分槽的提醒：start = 区间开始，end = 截止。单点任务只有 end。 */
  reminders: { start: ReminderDTO | null; end: ReminderDTO | null };
};

export type ReminderDTO = {
  id: string;
  slot: string;
  status: string;
  triggerAt: string;
  sentAt: string | null;
  attempt: number;
  lastError: string | null;
};

/** 列表排序与「今天」判定用的时间戳：有区间取开始，否则取截止，都没有则 Infinity。 */
export function taskScheduleTime(task: Pick<TaskDTO, "startAt" | "dueAt">): number {
  const value = task.startAt ?? task.dueAt;
  return value ? Date.parse(value) : Number.POSITIVE_INFINITY;
}

/** 逾期判断用的时间戳：截止时间过了才算逾期（没有截止时间时退回开始时间）。 */
export function taskDueTime(task: Pick<TaskDTO, "startAt" | "dueAt">): number {
  const value = task.dueAt ?? task.startAt;
  return value ? Date.parse(value) : Number.POSITIVE_INFINITY;
}

/** 现在是否正落在任务区间里（进行中）。仅用于展示，不会改写任务状态。 */
export function taskIsActive(
  task: Pick<TaskDTO, "startAt" | "dueAt" | "status">,
  now: Date = new Date(),
): boolean {
  if (task.status === "done" || !task.startAt || !task.dueAt) return false;
  return Date.parse(task.startAt) <= now.getTime() && now.getTime() < Date.parse(task.dueAt);
}

/** 提醒锚点的中文名 */
export const REMINDER_SLOT_LABELS: Record<string, string> = {
  start: "开始",
  end: "截止",
};

export type TaskViewName = "today" | "inbox" | "all" | "completed" | "project";

/** 通知门槛：任务优先级不低于该值时，对应渠道才发送 */
export type NotifyLevel = "low" | "normal" | "high";

/** 提醒渠道的门槛，null 表示该渠道未配置 */
export type NotifyPolicy = {
  email: NotifyLevel | null;
  bot: NotifyLevel | null;
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "低",
  normal: "普通",
  high: "高",
};

export const STATUS_LABELS: Record<string, string> = {
  todo: "待处理",
  doing: "进行中",
  done: "已完成",
};

export const LINK_KIND_LABELS: Record<string, string> = {
  repo: "仓库",
  file: "文件",
  issue: "Issue",
  pr: "PR",
  test: "测试/笔试",
  other: "链接",
};

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
  dueAt: string | null;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  tags: string[];
  links: TaskLinkDTO[];
  remindEnabled: boolean;
  remindLeadMin: number;
  sourceId: string | null;
  sourceText: string | null;
  sourceImages: { id: string; name: string; url: string }[];
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reminder: ReminderDTO | null;
};

export type ReminderDTO = {
  id: string;
  status: string;
  triggerAt: string;
  sentAt: string | null;
  attempt: number;
  lastError: string | null;
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

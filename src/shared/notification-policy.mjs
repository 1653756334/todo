// 通知优先级：把任务优先级映射成数值，每个渠道设一个门槛，达到门槛才发送。
//   低 = 10，普通 = 20，高 = 30
// 例：邮件门槛设「高」、推送门槛设「普通」，则低优先级不发，普通只推送，高两个都发。
//
// 网页（任务详情的说明文案）与 Worker（真正投递时的判断）共用这一份实现，
// 避免两边的规则漂移。只依赖纯 JS，客户端组件也能直接引入。

/** 任务优先级 → 数值 */
export const PRIORITY_RANK = { low: 10, normal: 20, high: 30 };

/** 优先级与门槛的中文名 */
export const PRIORITY_LABELS = { low: "低", normal: "普通", high: "高" };

/** 允许的取值：任务优先级与渠道门槛共用同一套 */
export const PRIORITY_LEVELS = ["low", "normal", "high"];

/** 门槛默认值：全部任务都发，与加这个功能之前的行为一致 */
export const DEFAULT_MIN_PRIORITY = "low";

/** 任务优先级，认不出来时按「普通」处理 */
export function normalizePriority(value) {
  return PRIORITY_LEVELS.includes(value) ? value : "normal";
}

/** 渠道门槛，认不出来（含未设置）时按「低」处理，即不拦任何任务 */
export function normalizeMinPriority(value) {
  return PRIORITY_LEVELS.includes(value) ? value : DEFAULT_MIN_PRIORITY;
}

export function priorityRank(value) {
  return PRIORITY_RANK[normalizePriority(value)];
}

export function priorityLabel(value) {
  return PRIORITY_LABELS[value] ?? value ?? "";
}

/** 任务优先级是否达到渠道门槛 */
export function meetsMinPriority(priority, minPriority) {
  return (
    priorityRank(priority) >= PRIORITY_RANK[normalizeMinPriority(minPriority)]
  );
}

/**
 * 这个任务实际会走哪些渠道。
 * @param {{ priority?: string, email?: string | null, bot?: string | null }} input
 *   email / bot 传渠道门槛，null 表示该渠道未配置
 */
export function channelPlan({ priority, email = null, bot = null }) {
  const emailFires = email !== null && meetsMinPriority(priority, email);
  const botFires = bot !== null && meetsMinPriority(priority, bot);

  const suppressed = [];
  if (email !== null && !emailFires)
    suppressed.push(`邮件需「${priorityLabel(email)}」`);
  if (bot !== null && !botFires)
    suppressed.push(`推送需「${priorityLabel(bot)}」`);

  return {
    configured: email !== null || bot !== null,
    email: emailFires,
    bot: botFires,
    /** 会发送的渠道名 */
    labels: [emailFires ? "邮件" : null, botFires ? "推送" : null].filter(
      Boolean,
    ),
    suppressed,
  };
}

/** 一个渠道都不发时的原因，写进提醒记录，也显示在任务详情里 */
export function suppressionReason({ priority, plan }) {
  const detail = plan.suppressed.length ? `（${plan.suppressed.join("、")}）` : "";
  return `当前优先级「${priorityLabel(priority)}」不发送通知${detail}`;
}

/** 说明这次走哪些渠道，例如「通知渠道：推送（邮件需「高」）」 */
export function channelSummary({ priority, plan }) {
  if (!plan.labels.length) return "";
  const head =
    plan.labels.length > 1
      ? `通知渠道：${plan.labels.join(" + ")}`
      : `通知渠道：${plan.labels[0]}`;
  return plan.suppressed.length
    ? `${head}（${plan.suppressed.join("、")}）`
    : head;
}

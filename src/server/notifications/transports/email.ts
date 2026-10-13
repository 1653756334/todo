/** 邮件发送：Web 进程用于测试邮件，Worker 使用相同逻辑（见 worker/index.mjs）。 */

import nodemailer from "nodemailer";
import { appUrl } from "@/server/infra/env";
import type { smtpConfig } from "@/server/settings/service";
type SmtpConfig = NonNullable<Awaited<ReturnType<typeof smtpConfig>>>;
import { formatFullDateTime } from "@/shared/time";

export function buildTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.encryption === "tls",
    requireTLS: config.encryption === "starttls",
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

/** 把 SMTP 错误归类为可读的提示 */
export function describeSmtpError(error: unknown): string {
  const err = error as { code?: string; responseCode?: number; message?: string };
  const code = err?.code ?? "";
  if (code === "EAUTH" || err?.responseCode === 535) return "认证失败，请检查用户名与密码";
  if (code === "ECONNECTION" || code === "ESOCKET") return "无法连接服务器，请检查主机与端口";
  if (code === "ETIMEDOUT" || code === "ECONNECTIONTIMEOUT") return "连接超时";
  if (code === "EENVELOPE") return "收件地址被服务器拒绝";
  if (code === "ESOCKET" || err?.responseCode === 465) return "加密方式与端口不匹配";
  return err?.message ? err.message.slice(0, 200) : "发送失败";
}

export function fromHeader(config: SmtpConfig): string {
  return config.fromName ? `"${config.fromName}" <${config.fromAddress}>` : config.fromAddress;
}

export async function sendTestMail(config: SmtpConfig): Promise<{ messageId: string }> {
  const transport = buildTransport(config);
  try {
    const info = await transport.sendMail({
      from: fromHeader(config),
      to: config.toAddress,
      subject: "Todo 测试邮件",
      text: [
        "这是一封来自 Todo 的测试邮件。",
        "",
        `发送时间：${formatFullDateTime(new Date(), "UTC")} (UTC)`,
        "收到本邮件说明 SMTP 配置可用。",
      ].join("\n"),
    });
    return { messageId: info.messageId };
  } finally {
    transport.close();
  }
}

export type ReminderMail = {
  title: string;
  projectName?: string | null;
  /** 这次提醒对应的时刻（区间开始或截止），不是任务的全部时间。 */
  anchorAt: Date;
  /** 时刻的称呼，用于正文与主题：「开始」或「截止」。 */
  anchorLabel: string;
  timeZone: string;
  notes?: string | null;
  taskId: string;
};

export function renderReminderMail(mail: ReminderMail) {
  const anchor = formatFullDateTime(mail.anchorAt, mail.timeZone);
  const link = `${appUrl()}/tasks?task=${mail.taskId}`;
  const lines = [
    `任务：${mail.title}`,
  ];
  if (mail.projectName) lines.push(`项目：${mail.projectName}`);
  lines.push(`${mail.anchorLabel}：${anchor}`);
  if (mail.notes) {
    lines.push("", "说明：", mail.notes.slice(0, 1000));
  }
  lines.push("", link);
  return {
    subject: mail.anchorLabel === "开始" ? `该开始了：${mail.title}` : `即将到期：${mail.title}`,
    text: lines.join("\n"),
  };
}

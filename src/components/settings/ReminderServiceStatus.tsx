"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { formatDueLabel } from "@/lib/time";
import { REMINDER_SLOT_LABELS } from "@/lib/types";

type WorkerStatus = { healthy: boolean; lastSeen: string | null };

type ReminderRecord = {
  id: string;
  slot: string;
  status: string;
  triggerAt: string;
  sentAt: string | null;
  attempt: number;
  lastError: string | null;
  taskTitle: string;
};

/** 浏览器时区只在这里做提醒时间的粗展示，真正的任务时间仍按用户时区渲染。 */
const BROWSER_TIME_ZONE =
  typeof Intl === "undefined"
    ? "UTC"
    : Intl.DateTimeFormat().resolvedOptions().timeZone;

const REMINDER_STATUS_LABELS: Record<string, string> = {
  pending: "待发送",
  claimed: "发送中",
  sent: "已发送",
  partial: "部分成功",
  failed: "发送失败",
  canceled: "已取消",
};

function reminderTone(status: string): string {
  if (status === "failed") return "text-danger";
  if (status === "pending" || status === "claimed") return "text-warn";
  return "text-muted";
}

/** 组件所在页面会把账号时区传进来；拿不到时退回浏览器时区。 */
export function ReminderServiceStatus({ timeZone }: { timeZone?: string } = {}) {
  const displayZone = timeZone ?? BROWSER_TIME_ZONE;
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const load = useCallback(async () => {
    if (locked.current) return;
    locked.current = true;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ worker: WorkerStatus; reminders: ReminderRecord[] }>(
        "/api/reminders?take=6",
      );
      setStatus(data.worker);
      setReminders(data.reminders ?? []);
    } catch {
      setError("暂时无法查询提醒服务状态，请稍后重试。");
    } finally {
      locked.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mt-4" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`status-pill ${loading ? "" : !error && status?.healthy ? "is-ok" : "is-warn"}`} role="status">
          {loading ? "正在检查提醒服务…" : error ? "状态暂不可用" : status?.healthy ? "提醒服务正常" : "提醒服务暂不可用"}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />{loading ? "检查中…" : "重新检查"}
        </button>
      </div>
      {error ? <p className="error-text mt-3" role="alert">{error}</p> : !loading && status && (
        <p className="hint mt-3">{status.healthy
          ? "系统可以处理到期提醒。请同时确认通知渠道已启用并完成配置。"
          : "任务仍可正常使用，但提醒可能延迟。请稍后重新检查；持续不可用时请联系管理员。"}</p>
      )}
      {!loading && !error && reminders.length > 0 ? (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <h3 className="section-title">最近提醒记录</h3>
          <ul className="space-y-2">
            {reminders.map((reminder) => {
              const slotLabel = REMINDER_SLOT_LABELS[reminder.slot] ?? reminder.slot;
              const time = formatDueLabel(new Date(reminder.triggerAt), displayZone);
              return (
                <li
                  key={reminder.id}
                  className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3 text-[13px]"
                >
                  <span className="status-pill shrink-0" title={displayZone}>
                    {slotLabel} · {time.text}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={reminder.taskTitle}>
                    {reminder.taskTitle}
                  </span>
                  <span className={`shrink-0 ${reminderTone(reminder.status)}`}>
                    {REMINDER_STATUS_LABELS[reminder.status] ?? reminder.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

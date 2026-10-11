"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/client";

type WorkerStatus = { healthy: boolean; lastSeen: string | null };

export function ReminderServiceStatus() {
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const load = useCallback(async () => {
    if (locked.current) return;
    locked.current = true;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ worker: WorkerStatus }>("/api/reminders?take=1");
      setStatus(data.worker);
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
    </div>
  );
}

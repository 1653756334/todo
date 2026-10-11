"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, History, LogOut, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/Toast";
import { formatDateTimeShort } from "@/lib/time";

type Attempt = { id: string; ip: string; succeeded: boolean; createdAt: string };

export function DataSettings({ attempts, timeZone, attemptsError }: {
  attempts: Attempt[];
  timeZone: string;
  attemptsError?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"current" | "all" | null>(null);
  const [confirmation, setConfirmation] = useState<"current" | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [format, setFormat] = useState<"json" | "zip">("json");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function logout(scope: "current" | "all") {
    if (busy) return;
    setConfirmation(null);
    setBusy(scope);
    setError(null);
    try {
      await apiFetch(scope === "all" ? "/api/auth/sessions" : "/api/auth/logout", { method: "POST" });
      window.location.assign("/login");
    } catch (err) {
      const text = (err as Error).message;
      setError(text);
      toast.show({ message: text, tone: "error" });
      setBusy(null);
    }
  }

  async function exportData() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    setExportMessage(null);
    try {
      let response: Response;
      try { response = await fetch(`/api/export?format=${format}`, { cache: "no-store", headers: { "x-requested-with": "todo" } }); }
      catch { throw new Error("网络连接中断，请检查后重试。"); }
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error ?? `导出失败（${response.status}），请稍后重试。`);
      }
      if (!response.headers.get("content-type")?.includes(format === "zip" ? "application/zip" : "application/json")) throw new Error("无法获取导出文件，请确认登录状态后重试。");
      const blob = await response.blob();
      if (!blob.size) throw new Error("导出文件为空，请重试。");
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `todo-export-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      const text = "文件已准备好，已开始下载。可在浏览器下载记录中查看。";
      setExportMessage(text);
      toast.show({ message: text });
    } catch (err) {
      const text = (err as Error).message;
      setExportError(text);
      toast.show({ message: text, tone: "error" });
    } finally { setExporting(false); }
  }

  return (
    <>
      <ConfirmDialog open={confirmation !== null} onOpenChange={open => { if (!open) setConfirmation(null); }} title={confirmation === "all" ? "退出所有设备" : "退出当前设备"} description={confirmation === "all" ? "所有登录会话都会失效，包括当前设备。请先保存尚未提交的修改，退出后需要重新登录。" : "请先保存尚未提交的修改。退出后，当前设备需要重新登录。"} confirmLabel={confirmation === "all" ? "退出所有设备" : "确认退出"} onConfirm={() => confirmation ? logout(confirmation) : undefined} />
      <section className="settings-card">
        <h2 className="section-title">登录与会话</h2>
        <p className="hint mt-1">管理当前设备和其他设备的登录状态。</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex items-start gap-3 rounded-lg border border-line bg-sunken/50 px-4 py-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
            <p className="hint">在公共设备上使用后请退出当前设备；担心其他设备还登录着，可以退出所有设备。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary flex-1 sm:flex-none" onClick={() => setConfirmation("current")} disabled={busy !== null}><LogOut size={16} aria-hidden="true" />{busy === "current" ? "退出中…" : "退出当前设备"}</button>
            <button type="button" className="btn btn-secondary flex-1 sm:flex-none" onClick={() => setConfirmation("all")} disabled={busy !== null}>{busy === "all" ? "退出中…" : "退出所有设备"}</button>
          </div>
        </div>
        {error && <p className="error-text mt-3" role="alert">{error}</p>}
      </section>
      <section className="settings-card" aria-busy={refreshing}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="section-title">最近登录记录</h2><p className="hint mt-1">最近 10 次登录尝试，包括成功和失败的记录。</p></div><button type="button" className="btn btn-ghost" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}>{refreshing ? "刷新中…" : "刷新记录"}</button></div>
        {attemptsError ? <div className="mt-5 rounded-lg border border-line p-4"><p className="error-text" role="alert">{attemptsError}</p><button type="button" className="btn btn-secondary mt-3" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}>{refreshing ? "加载中…" : "重新加载"}</button></div> : attempts.length === 0 ? (
          <div className="mt-5 flex flex-col items-center rounded-lg border border-dashed border-line px-4 py-8 text-center"><History size={24} strokeWidth={1.5} className="text-muted" aria-hidden="true" /><p className="mt-3 text-sm font-medium">暂无登录记录</p><p className="hint mt-1">后续登录尝试会显示在这里。</p></div>
        ) : (
          <ul className="mt-3 divide-y divide-line border-t border-line">{attempts.map(attempt => <li key={attempt.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 text-[13px]"><span className={`status-pill ${attempt.succeeded ? "is-ok" : "is-danger"}`}>{attempt.succeeded ? "登录成功" : "登录失败"}</span><span className="min-w-0 truncate font-mono text-muted" title={attempt.ip || "未知地址"}>{attempt.ip || "未知地址"}</span><time dateTime={attempt.createdAt} className="text-muted tabular-nums">{formatDateTimeShort(new Date(attempt.createdAt), timeZone)}</time></li>)}</ul>
        )}
      </section>
      <section className="settings-card" aria-busy={exporting}>
        <h2 className="section-title">数据导出</h2>
        <p className="hint mt-1">备份任务、项目、标签和导入原文；如需保留导入图片，请选择 ZIP。</p>
        <fieldset disabled={exporting} className="mt-4 min-w-0">
          <legend className="label">导出格式</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { value: "json", title: "JSON · 任务数据", hint: "便于迁移与处理数据，不包含图片文件。" },
              { value: "zip", title: "ZIP · 数据与导入图片", hint: "包含 JSON 数据和已保存的导入图片。" },
            ] as const).map(option => {
              const active = format === option.value;
              return (
                <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${active ? "border-accent bg-accent-soft" : "border-line hover:bg-sunken"}`}>
                  <input className="mt-1 accent-accent" type="radio" name="export-format" value={option.value} checked={active} onChange={() => setFormat(option.value)} />
                  <span className="min-w-0"><span className={`text-sm ${active ? "font-medium text-accent" : "font-medium"}`}>{option.title}</span><span className="hint mt-1 block">{option.hint}</span></span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={exporting || busy !== null} onClick={() => void exportData()}><Download size={16} aria-hidden="true" />{exporting ? "正在准备文件…" : "导出数据"}</button>
          <p className="hint">{format === "zip" ? "图片较多时可能需要稍候，完成后会自动开始下载。" : "完成后会自动开始下载，可在浏览器下载记录中查看。"}</p>
        </div>
        {exportMessage && <p className="mt-3 text-[13px] text-accent" role="status">{exportMessage}</p>}
        {exportError && <p className="error-text mt-3" role="alert">{exportError}</p>}
      </section>
    </>
  );
}

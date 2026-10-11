"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, Wifi, WifiOff } from "lucide-react";

export default function OfflinePage() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = "网络连接 · Todo";
    const update = () => { setOnline(navigator.onLine); setMessage(null); setPending(false); };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  function retry() {
    if (pending) return;
    if (!navigator.onLine) {
      setOnline(false);
      setMessage("仍未连接网络，请检查 Wi-Fi 或移动网络后重试。");
      return;
    }
    setPending(true);
    setMessage(null);
    if (window.location.pathname === "/offline") window.location.replace("/today");
    else window.location.reload();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8 sm:px-6">
      <section className="settings-card w-full max-w-[400px] text-center" aria-busy={pending}>
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sunken text-muted">{online ? <Wifi size={24} aria-hidden="true" /> : <WifiOff size={24} aria-hidden="true" />}</span>
        <h1 className="mt-5 text-xl font-semibold">{online ? "可以尝试重新连接" : "暂时无法连接"}</h1>
        <p className="hint mt-3">任务保存在服务器上。连接恢复后，即可继续查看和修改。</p>
        <p className="hint mt-2">{online ? "设备已连接网络，请重试。如果仍无法打开，服务可能暂时不可用。" : "请检查 Wi-Fi 或移动网络，然后重试。"}</p>
        <button type="button" className="btn btn-primary mt-6 w-full" onClick={retry} disabled={pending}>{pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}{pending ? "正在连接…" : online ? "重新打开任务" : "重试连接"}</button>
        {message && <p className="error-text mt-4" role="alert">{message}</p>}
        <span className="status-pill mt-5" role="status">{online === null ? "正在检查网络…" : online ? "设备已连接网络" : "设备处于离线状态"}</span>
      </section>
    </main>
  );
}

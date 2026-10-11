"use client";

import { useState } from "react";
import * as Alert from "@radix-ui/react-alert-dialog";

export function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, confirmLabel = "确认", destructive = false }: {
  open: boolean; onOpenChange: (value: boolean) => void; title: string; description: string;
  onConfirm: () => void | Promise<void>; confirmLabel?: string; destructive?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function changeOpen(next: boolean) {
    if (pending) return;
    setError(null);
    onOpenChange(next);
  }
  async function confirm(event: React.MouseEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message || "操作未完成，请重试。");
    } finally {
      setPending(false);
    }
  }
  return (
    <Alert.Root open={open} onOpenChange={changeOpen}>
      <Alert.Portal>
        <Alert.Overlay className="dialog-overlay fixed inset-0 z-[210] bg-black/30 backdrop-blur-sm" />
        <Alert.Content className="dialog-panel fixed left-1/2 top-1/2 z-[211] max-h-[90dvh] w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-xl" onEscapeKeyDown={event => { if (pending) event.preventDefault(); }}>
          <Alert.Title className="text-lg font-semibold">{title}</Alert.Title>
          <Alert.Description className="mt-3 text-sm text-muted">{description}</Alert.Description>
          {error && <p className="error-text mt-4" role="alert">{error}</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Alert.Cancel className="btn btn-secondary" disabled={pending}>取消</Alert.Cancel>
            <Alert.Action className={`btn ${destructive ? "btn-danger-solid" : "btn-primary"}`} disabled={pending} onClick={event => void confirm(event)}>
              {pending ? "处理中…" : confirmLabel}
            </Alert.Action>
          </div>
        </Alert.Content>
      </Alert.Portal>
    </Alert.Root>
  );
}

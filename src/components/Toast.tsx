"use client";

import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useUiMotion } from "@/components/Motion";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type Toast = {
  id: number;
  message: string;
  tone: "info" | "error";
  actionLabel?: string;
  onAction?: () => void;
};

type ToastApi = {
  show: (toast: {
    message: string;
    tone?: "info" | "error";
    actionLabel?: string;
    onAction?: () => void;
    durationMs?: number;
  }) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast 必须在 ToastProvider 内使用");
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback<ToastApi["show"]>(
    ({ message, tone = "info", actionLabel, onAction, durationMs }) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [
        ...current.slice(-2),
        { id, message, tone, actionLabel, onAction },
      ]);
      const timer = window.setTimeout(
        () => dismiss(id),
        durationMs ?? (actionLabel ? 8000 : 4000),
      );
      return () => window.clearTimeout(timer);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="toast-stack pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  dismiss,
}: {
  toast: Toast;
  dismiss: (id: number) => void;
}) {
  const { reduced, transition } = useUiMotion();
  const present = useIsPresent();
  return (
    <motion.div
      layout="position"
      initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: reduced ? 0 : 6, scale: reduced ? 1 : 0.98 }}
      transition={transition}
      inert={!present}
      data-toast
      className="pointer-events-auto flex w-full max-w-[440px] items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-lg"
    >
      {toast.tone === "error" ? (
        <CircleAlert size={18} className="shrink-0 text-danger" />
      ) : (
        <CircleCheck size={18} className="shrink-0 text-ok" />
      )}
      <span
        className={`flex-1 text-[13px] ${toast.tone === "error" ? "text-danger" : "text-ink"}`}
      >
        {toast.message}
      </span>
      {toast.actionLabel && toast.onAction ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            toast.onAction?.();
            dismiss(toast.id);
          }}
        >
          {toast.actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        className="icon-button !h-7 !w-7"
        onClick={() => dismiss(toast.id)}
        aria-label="关闭提示"
      >
        <X size={15} />
      </button>
    </motion.div>
  );
}

"use client";

import { AnimatePresence, motion } from "motion/react";
import { Download, RefreshCw, Wifi, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUiMotion } from "@/components/Motion";
import { useToast } from "@/components/Toast";

/** 安装提示被关掉后，这段时间内不再出现。 */
const DISMISS_KEY = "todo-install-dismissed";
const DISMISS_DAYS = 30;
/** 新版本提示停留时间：足够点，又不至于赖着不走。 */
const UPDATE_TOAST_MS = 20000;
/** 恢复联网后，「网络已恢复」提示停留多久。 */
const RESTORED_MS = 10000;
/** 探活超时与间隔：断开时更勤一点，正常时不用频繁打扰服务器。 */
const PROBE_TIMEOUT_MS = 4000;
const PROBE_INTERVAL_OFFLINE_MS = 8000;
const PROBE_INTERVAL_ONLINE_MS = 30000;

/**
 * 是否连得上服务器。不能只看 navigator.onLine：手机连着 WiFi、但隧道或服务器挂了
 * 的时候它仍然是「在线」，而那时看到的其实是页面快照。
 * 这里用一次轻量探活来判断，同时给点击拦截留一个同步可读的标记。
 */
const reachability = { offline: false };

async function probeServer(): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

function useOffline() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let running = false;

    const mark = (value: boolean) => {
      reachability.offline = value;
      if (!cancelled) setOffline(value);
    };

    const probe = async () => {
      if (running || cancelled) return;
      running = true;
      window.clearTimeout(timer);
      const reachable = await probeServer();
      running = false;
      if (cancelled) return;
      const next = !reachable || !navigator.onLine;
      mark(next);
      timer = window.setTimeout(probe, next ? PROBE_INTERVAL_OFFLINE_MS : PROBE_INTERVAL_ONLINE_MS);
    };

    const onOffline = () => mark(true);
    const onOnline = () => void probe();

    void probe();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return offline;
}

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  // iOS Safari 的老写法
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && window.navigator.maxTouchPoints > 1);
  // iOS 上的其它浏览器（Chrome/Firefox/Edge）不能添加主屏幕，只有 Safari 可以。
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua);
  return ios && !otherBrowser;
}

/** 注册更新、提供安装入口，并在无法连接服务器时说明保存需要联网。 */
export function PwaRuntime() {
  useServiceWorkerUpdate();
  useOfflineNavigation();
  return (
    <div className="pwa-overlays">
      <OfflineBanner />
      <InstallHint />
    </div>
  );
}

function useServiceWorkerUpdate() {
  const { show } = useToast();
  const notified = useRef(false);
  const reloading = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // 首次安装时 Service Worker 会立刻接管（clients.claim），这时不重载页面；
    // 只有本来已在托管状态、又换了新版本，才需要重载拿到新资源。
    const controlledBefore = Boolean(navigator.serviceWorker.controller);
    let registration: ServiceWorkerRegistration | null = null;

    const promptUpdate = () => {
      if (notified.current || !registration) return;
      notified.current = true;
      show({
        message: "Todo 有新版本",
        actionLabel: "立即更新",
        durationMs: UPDATE_TOAST_MS,
        onAction: () => {
          registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
        },
      });
    };

    const trackInstalling = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) promptUpdate();
      });
    };

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (registration.waiting && navigator.serviceWorker.controller) promptUpdate();
        registration.addEventListener("updatefound", () => trackInstalling(registration?.installing ?? null));
      } catch {
        /* 注册失败不影响正常使用 */
      }
    };

    // 回到前台时顺手查一次更新，装到桌面的应用也能及时更新。
    const onVisible = () => {
      if (document.visibilityState === "visible") void registration?.update().catch(() => {});
    };

    const onControllerChange = () => {
      if (!controlledBefore || reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };

    void register();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [show]);
}

/** 离线时使用整页导航，让 Service Worker 展示联网后可重试的兜底页。 */
function useOfflineNavigation() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!reachability.offline && navigator.onLine) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin) return;
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(target.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

function OfflineBanner() {
  const { transition, reduced } = useUiMotion();
  const offline = useOffline();
  const [restored, setRestored] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    const online = !offline;
    if (!online) {
      wasOffline.current = true;
      setRestored(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setRestored(true);
    const timer = window.setTimeout(() => setRestored(false), RESTORED_MS);
    return () => window.clearTimeout(timer);
  }, [offline]);

  const online = !offline;
  const visible = !online || restored;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : 8 }}
          transition={transition}
          className="pwa-card"
          role="status"
          aria-live="polite"
        >
          {online ? (
            <Wifi size={18} className="shrink-0 text-ok" aria-hidden />
          ) : (
            <WifiOff size={18} className="shrink-0 text-warn" aria-hidden />
          )}
          <span className="flex-1 text-[13px] leading-snug text-ink">
            {online
              ? "网络已恢复，可以继续保存修改"
              : "无法连接服务器，请联网后再保存修改"}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
            <RefreshCw size={14} aria-hidden />
            {online ? "刷新" : "重试"}
          </button>
          {online ? (
            <button type="button" className="icon-button" onClick={() => setRestored(false)} aria-label="关闭提示">
              <X size={16} />
            </button>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function InstallHint() {
  const { transition, reduced } = useUiMotion();
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;

    let dismissedUntil = 0;
    try {
      dismissedUntil = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0) || 0;
    } catch {
      dismissedUntil = 0;
    }
    if (Date.now() < dismissedUntil) return;

    if (isIosSafari()) {
      setIosHint(true);
      setHidden(false);
      return;
    }

    const onBeforeInstall = (event: Event) => {
      // 拦下浏览器自带的迷你提示，改用页面里这条。
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
      setHidden(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const dismiss = useCallback(() => {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400000));
    } catch {
      /* 隐私模式下写不了就只隐藏本次 */
    }
  }, []);

  const install = useCallback(async () => {
    if (!installEvent) return;
    setHidden(true);
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } catch {
      /* 用户取消或浏览器不支持 */
    }
  }, [installEvent]);

  return (
    <AnimatePresence>
      {hidden ? null : (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : 8 }}
          transition={transition}
          className="pwa-card"
          role="status"
        >
          <Download size={18} className="shrink-0 text-accent" aria-hidden />
          <span className="flex-1 text-[13px] leading-snug text-ink">
            {iosHint ? "在 Safari 里点「分享」，选「添加到主屏幕」。" : "把 Todo 装到桌面，打开更快。"}
          </span>
          {iosHint ? null : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void install()}>
              安装
            </button>
          )}
          <button type="button" className="icon-button" onClick={dismiss} aria-label="不再提示">
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

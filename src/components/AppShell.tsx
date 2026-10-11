"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { PageTransition, useUiMotion } from "@/components/Motion";
import { NavigationLink } from "@/components/NavigationLink";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  CalendarDays,
  Inbox,
  ListTodo,
  LoaderCircle,
  CircleCheck,
  Settings2,
  LogOut,
  Plus,
  Search,
  ClipboardList,
  Menu,
  X,
  ChevronRight,
  Folder,
  PanelLeft,
  UserRound,
  ShieldCheck,
} from "lucide-react";
import { ImportDialog } from "@/components/ImportDialog";
import { NewTaskDialog } from "@/components/NewTaskDialog";
import { ToastProvider } from "@/components/Toast";
import { RoleContext } from "@/components/auth-role";
import { PwaRuntime } from "@/components/Pwa";
import { apiFetch } from "@/lib/client";
import type { ProjectOption } from "@/lib/types";

type NavCounts = {
  today: number;
  inbox: number;
  all: number;
  projects: Record<string, number>;
};
type Props = {
  projects: ProjectOption[];
  counts: NavCounts;
  timeZone: string;
  aiConfigured: boolean;
  isAdmin?: boolean;
  displayName?: string;
  username?: string;
  children: React.ReactNode;
};

const TaskActions = createContext({ newTask: () => {}, importText: () => {} });
export function useTaskActions() {
  return useContext(TaskActions);
}

const NAV = [
  { href: "/today", label: "今天", key: "today" as const, icon: CalendarDays },
  { href: "/inbox", label: "收件箱", key: "inbox" as const, icon: Inbox },
  { href: "/tasks", label: "全部任务", key: "all" as const, icon: ListTodo },
  { href: "/completed", label: "已完成", key: null, icon: CircleCheck },
];

/** 计数变化时轻推入；首次渲染不动，避免首屏无意义动画 */
function NavCount({ value }: { value: number }) {
  const previous = useRef(value);
  const changed = previous.current !== value;
  useEffect(() => {
    previous.current = value;
  }, [value]);
  if (value <= 0) return null;
  return (
    <span className={`nav-count ${changed ? "nav-count-pop" : ""}`}>
      {value}
    </span>
  );
}

export function AppShell({
  projects,
  counts,
  timeZone,
  aiConfigured,
  isAdmin = false,
  displayName = "个人工作空间",
  username,
  children,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchPending, startSearchTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const { reduced, transition } = useUiMotion();
  const [navVisible, setNavVisible] = useState(false);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const managementPage = pathname.startsWith("/settings") || pathname.startsWith("/admin");

  const activeProjectId = useMemo(
    () => /^\/projects\/([^/]+)/.exec(pathname)?.[1] ?? null,
    [pathname],
  );
  const pageLabel =
    NAV.find((item) => item.href === pathname)?.label ??
    (pathname.startsWith("/admin")
      ? "站点管理"
      : pathname.startsWith("/settings")
        ? "设置"
        : (projects.find((p) => p.id === activeProjectId)?.name ?? "任务"));
  const actions = useMemo(
    () => ({
      newTask: () => {
        setImportOpen(false);
        setNewTaskOpen(true);
      },
      importText: () => {
        setNewTaskOpen(false);
        setImportOpen(true);
      },
    }),
    [],
  );

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);
  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (navOpen) {
      setNavVisible(true);
      return;
    }
    if (reduced) {
      setNavVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setNavVisible(false), 180);
    return () => window.clearTimeout(timer);
  }, [navOpen, reduced]);

  useEffect(() => {
    if (!navOpen) return;
    const panel = navRef.current;
    panel?.querySelector<HTMLElement>("a, button")?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNavOpen(false);
        menuRef.current?.focus();
      }
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>("a, button"),
      ).filter((el) => el.offsetParent !== null);
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0]?.focus();
      }
    }
    const resize = () => {
      if (window.innerWidth >= 1024) setNavOpen(false);
    };
    document.addEventListener("keydown", keydown);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", resize);
    };
  }, [navOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.matches("input, textarea, select") || target?.isContentEditable || target?.closest('[role="combobox"], [role="menu"], [role="switch"], [role="alertdialog"]');
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing)
        return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        setMobileSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (event.key.toLowerCase() === "n" && !typing) {
        event.preventDefault();
        actions.newTask();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [actions]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    startSearchTransition(() =>
      router.push(
        query.trim()
          ? `/tasks?q=${encodeURIComponent(query.trim())}`
          : "/tasks",
      ),
    );
    searchRef.current?.blur();
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (err) {
      setLogoutError((err as Error).message);
      setLoggingOut(false);
    }
  }

  return (
    <ToastProvider>
      <TaskActions.Provider value={actions}>
        <a
          href="#main-content"
          className="sr-only z-50 rounded bg-surface p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          跳到主要内容
        </a>
        <div className="flex h-dvh min-h-0 overflow-hidden">
          <AnimatePresence>
            {navOpen ? (
              <motion.button
                key="navigation-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
                className="fixed inset-0 z-30 bg-black/30 lg:hidden"
                onClick={() => {
                  setNavOpen(false);
                  menuRef.current?.focus();
                }}
                aria-label="关闭导航遮罩"
                tabIndex={-1}
              />
            ) : null}
          </AnimatePresence>
          <aside
            ref={navRef}
            role={navOpen ? "dialog" : undefined}
            aria-modal={navOpen ? true : undefined}
            aria-label="工作空间导航"
            className={`app-sidebar mobile-navigation fixed inset-y-0 left-0 z-40 flex w-[236px] shrink-0 flex-col border-r border-line lg:relative lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"} ${!navOpen && !navVisible ? "max-lg:invisible" : ""}`}
          >
            <div className="flex h-[68px] shrink-0 items-center gap-3 px-5">
              <Link
                href="/today"
                className="flex items-center gap-3"
                aria-label="Todo 首页"
              >
                <span className="brand-mark">
                  <ListTodo size={21} strokeWidth={2} />
                </span>
                <span className="text-[18px] font-semibold tracking-tight">
                  Todo
                  <span className="ml-2 text-[11px] font-normal tracking-normal text-muted">
                    私人空间
                  </span>
                </span>
              </Link>
              <button
                type="button"
                className="icon-button ml-auto lg:hidden"
                onClick={() => {
                  setNavOpen(false);
                  menuRef.current?.focus();
                }}
                aria-label="关闭导航"
              >
                <X size={18} />
              </button>
            </div>
            <nav
              className="scroll-y min-h-0 flex-1 px-3 py-5"
              aria-label="主导航"
            >
              <p className="mb-2 px-3 text-[11px] font-medium text-muted">
                工作空间
              </p>
              <ul className="space-y-1">
                {NAV.map(({ icon: Icon, ...item }) => {
                  const active = pathname === item.href;
                  const count = item.key ? counts[item.key] : 0;
                  return (
                    <li key={item.href}>
                      <NavigationLink
                        href={item.href}
                        className="nav-link"
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon size={18} strokeWidth={1.7} />
                        <span>{item.label}</span>
                        <NavCount value={count} />
                      </NavigationLink>
                    </li>
                  );
                })}
              </ul>
              <div className="mb-2 mt-8 flex items-center justify-between px-3">
                <span className="text-[11px] font-medium text-muted">项目</span>
                <Link
                  href="/settings/projects"
                  className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-sunken hover:text-ink"
                  aria-label="管理项目"
                  title="管理项目"
                >
                  <Plus size={15} />
                </Link>
              </div>
              <ul className="space-y-1">
                {projects.map((project) => (
                  <li key={project.id}>
                    <NavigationLink
                      href={`/projects/${project.id}`}
                      className="nav-link"
                      aria-current={
                        activeProjectId === project.id ? "page" : undefined
                      }
                    >
                      <Folder
                        size={17}
                        strokeWidth={1.7}
                        style={{ color: project.color ?? "var(--muted)" }}
                        className="shrink-0"
                      />
                      <span className="truncate">{project.name}</span>
                      <NavCount value={counts.projects[project.id] ?? 0} />
                    </NavigationLink>
                  </li>
                ))}
              </ul>
              {projects.length === 0 ? (
                <div className="mx-3 mt-3 rounded-lg border border-dashed border-line px-3 py-4">
                  <p className="text-[12px] text-muted">用项目整理相关任务</p>
                  <Link
                    href="/settings/projects"
                    className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
                  >
                    <Plus size={13} />
                    创建项目
                  </Link>
                </div>
              ) : null}
            </nav>
            <div className="shrink-0 border-t border-line px-3 pb-4 pt-3">
              <NavigationLink
                href="/settings/general"
                className="nav-link"
                aria-current={
                  pathname.startsWith("/settings") ? "page" : undefined
                }
              >
                <Settings2 size={18} strokeWidth={1.7} />
                设置
              </NavigationLink>
              {isAdmin && <NavigationLink href="/admin" className="nav-link" aria-current={pathname.startsWith("/admin") ? "page" : undefined}>
                <ShieldCheck size={18} strokeWidth={1.7} />站点管理
              </NavigationLink>}
              <div className="mt-3 flex items-center gap-2.5 px-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-muted">
                  <UserRound size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium" title={displayName}>{displayName}</p>
                  <p className="truncate text-[11px] text-muted">{username ? `@${username}` : "仅自己可见"}</p>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => void logout()}
                  disabled={loggingOut}
                  aria-label={loggingOut ? "正在退出登录" : "退出登录"}
                  title="退出登录"
                >
                  {loggingOut ? <LoaderCircle size={16} className="animate-spin" /> : <LogOut size={16} />}
                </button>
              </div>
              {logoutError && <p className="error-text mt-2 px-3" role="alert">{logoutError}</p>}
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col" inert={navOpen}>
            <header className="shell-header z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3 sm:gap-3 sm:px-7 lg:px-8">
              <button
                ref={menuRef}
                type="button"
                className="icon-button lg:hidden"
                onClick={() => setNavOpen(true)}
                aria-expanded={navOpen}
                aria-label="打开导航"
              >
                <Menu size={20} />
              </button>
              <div className="mr-auto flex min-w-0 items-center gap-2 text-[12px]">
                <PanelLeft size={16} className="hidden text-muted lg:block" />
                <span className="hidden text-muted xl:inline">工作空间</span>
                <ChevronRight
                  size={13}
                  className="hidden text-muted xl:inline"
                />
                <span className="truncate font-medium">{pageLabel}</span>
              </div>
              <div
                className={`mobile-search ${mobileSearchOpen ? "is-open" : ""}`}
              >
                <form onSubmit={submitSearch} className="w-full" role="search">
                  <div className="search-box w-full">
                    <Search size={16} className="shrink-0 text-muted" />
                    <label className="sr-only" htmlFor="global-search">
                      搜索任务
                    </label>
                    <input
                      id="global-search"
                      type="search"
                      ref={searchRef}
                      placeholder="搜索任务…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Escape" &&
                          !event.nativeEvent.isComposing
                        ) {
                          setMobileSearchOpen(false);
                          searchToggleRef.current?.focus();
                        }
                      }}
                    />
                    {searchPending ? (
                      <span
                        className="navigation-pending text-muted"
                        role="status"
                        aria-label="正在搜索"
                      >
                        <LoaderCircle size={14} className="animate-spin" />
                      </span>
                    ) : query ? (
                      <button
                        type="button"
                        className="text-muted hover:text-ink"
                        aria-label="清除搜索"
                        onClick={() => {
                          setQuery("");
                          if (pathname === "/tasks" && searchParams.has("q")) {
                            const params = new URLSearchParams(searchParams.toString());
                            params.delete("q");
                            startSearchTransition(() => router.replace(`/tasks${params.size ? `?${params}` : ""}`));
                          }
                          searchRef.current?.focus();
                        }}
                      >
                        <X size={14} />
                      </button>
                    ) : (
                      <kbd className="shortcut hidden md:inline-flex">/</kbd>
                    )}
                  </div>
                </form>
              </div>
              <button
                ref={searchToggleRef}
                type="button"
                className="icon-button md:hidden"
                aria-label="搜索任务"
                aria-expanded={mobileSearchOpen}
                onClick={() => {
                  const next = !mobileSearchOpen;
                  setMobileSearchOpen(next);
                  if (next)
                    requestAnimationFrame(() => searchRef.current?.focus());
                  else {
                    searchRef.current?.blur();
                    searchToggleRef.current?.focus();
                  }
                }}
              >
                <Search size={18} />
              </button>
              {!managementPage && <div className="flex items-center gap-2 sm:ml-1 sm:border-l sm:border-line sm:pl-4">
                <button
                  type="button"
                  className="btn btn-secondary max-sm:min-w-10 max-sm:px-2.5"
                  onClick={actions.importText}
                  aria-label="粘贴内容"
                >
                  <ClipboardList size={16} />
                  <span className="hidden sm:inline">导入任务</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary max-sm:px-3"
                  onClick={actions.newTask}
                  aria-label="新建任务"
                >
                  <Plus size={17} />
                  <span className="sm:hidden">新建</span>
                  <span className="hidden sm:inline">新建任务</span>
                </button>
              </div>}
            </header>
            <main
              id="main-content"
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface"
              tabIndex={-1}
            >
              <PageTransition>
                <RoleContext.Provider value={isAdmin ? "ADMIN" : "USER"}>
                  {children}
                </RoleContext.Provider>
              </PageTransition>
            </main>
          </div>
        </div>
        <NewTaskDialog
          open={newTaskOpen}
          onClose={() => setNewTaskOpen(false)}
          projects={projects}
          defaultProjectId={activeProjectId}
          timeZone={timeZone}
          onSaved={() => router.refresh()}
        />
        <ImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          projects={projects}
          defaultProjectId={activeProjectId}
          timeZone={timeZone}
          aiConfigured={aiConfigured}
          onCommitted={() => router.refresh()}
          onConfigureAi={() => {
            setImportOpen(false);
            router.push("/settings/ai");
          }}
        />
      </TaskActions.Provider>
      <PwaRuntime />
    </ToastProvider>
  );
}

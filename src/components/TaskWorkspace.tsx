"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownWideNarrow,
  CalendarDays,
  CheckCheck,
  CircleCheck,
  ClipboardList,
  Inbox,
  ListTodo,
  Plus,
  Search,
  SquareMousePointer,
  X,
  Trash2,
} from "lucide-react";
import { useTaskActions } from "@/components/AppShell";
import { AnimatePresence, motion } from "motion/react";
import { useUiMotion } from "@/components/Motion";
import { TaskDetail } from "@/components/TaskDetail";
import { TaskRow } from "@/components/TaskRow";
import { useToast } from "@/components/Toast";
import { patchTask, rememberRevision } from "@/components/tasks/mutations";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/controls";
import { apiFetch } from "@/lib/client";
import { nextDayStartInZone } from "@/lib/time";
import {
  taskScheduleTime,
  type NotifyPolicy,
  type ProjectOption,
  type TaskDTO,
} from "@/lib/types";

type Props = {
  initialTasks: TaskDTO[];
  initialNextCursor?: string | null;
  projectId?: string;
  projects: ProjectOption[];
  timeZone: string;
  view: "today" | "inbox" | "all" | "completed" | "project";
  notify: NotifyPolicy;
  groupOverdue?: boolean;
  header?: React.ReactNode;
  filters?: React.ReactNode;
};

type SortKey = "due" | "priority" | "created";

const PRIORITY_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 };

function sortTasks(tasks: TaskDTO[], key: SortKey): TaskDTO[] {
  const list = [...tasks];
  if (key === "priority") {
    list.sort((a, b) => {
      const diff =
        (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
      if (diff !== 0) return diff;
      const ta = taskScheduleTime(a);
      const tb = taskScheduleTime(b);
      return ta === tb ? 0 : ta - tb;
    });
    return list;
  }
  if (key === "created") {
    list.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return list;
  }
  list.sort((a, b) => {
    const ta = taskScheduleTime(a);
    const tb = taskScheduleTime(b);
    return (
      (ta === tb ? 0 : ta - tb) ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );
  });
  return list;
}

function useDocked() {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const update = () => setDocked(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return docked;
}

export function TaskWorkspace({
  initialTasks,
  initialNextCursor = null,
  projectId,
  projects,
  timeZone,
  view,
  notify,
  groupOverdue = false,
  header,
  filters,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navigating, startNavigation] = useTransition();
  const queryKey = `${pathname}?${searchParams}`;
  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;
  const leaveDetailRef = useRef<((next: () => void) => void) | null>(null);
  const actions = useTaskActions();
  const toast = useToast();
  const docked = useDocked();
  const { reduced, transition } = useUiMotion();

  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const statusPending = useRef(new Set<string>());
  const [pendingStatusIds, setPendingStatusIds] = useState<Set<string>>(new Set());
  const loadedIds = useRef(new Set<string>());
  const serverSnapshotRef = useRef({ initialTasks, queryKey });
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const bulkPendingRef = useRef(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [moveProjectId, setMoveProjectId] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const requestedSort = searchParams.get("sort");
  const sortKey: SortKey = view !== "completed" && (requestedSort === "priority" || requestedSort === "created") ? requestedSort : "due";
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    const queryChanged = serverSnapshotRef.current.queryKey !== queryKey;
    if (queryChanged || loadedIds.current.size === 0 || !initialNextCursor) setNextCursor(initialNextCursor);
  }, [initialNextCursor, initialTasks, queryKey]);
  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const requestedQuery = queryKey;
    try {
      const q = new URLSearchParams(searchParams.toString()); q.set("view", view); q.set("cursor", nextCursor); q.set("sort", sortKey); if (projectId) q.set("projectId", projectId);
      const r = await apiFetch<{tasks: TaskDTO[];nextCursor: string|null}>(`/api/tasks?${q}`);
      if (queryKeyRef.current !== requestedQuery) return;
      for (const task of r.tasks) loadedIds.current.add(task.id);
      setTasks(v => [...v, ...r.tasks.filter(t => !v.some(x => x.id === t.id))]); setNextCursor(r.nextCursor);
    } catch(e) { if (queryKeyRef.current === requestedQuery) toast.show({message:(e as Error).message,tone:"error"}); } finally {setLoadingMore(false);}
  }
  const pendingRemoval = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    function matchesView(task: TaskDTO) {
      const status = view === "completed" ? "done" : searchParams.get("status");
      if (status ? task.status !== status : task.status === "done") return false;
      if (view === "inbox" && task.projectId) return false;
      if (view === "project" && task.projectId !== projectId) return false;
      if (view === "today" && taskScheduleTime(task) >= nextDayStartInZone(new Date(), timeZone).getTime()) return false;
      if (searchParams.get("priority") && task.priority !== searchParams.get("priority")) return false;
      if (searchParams.get("tag") && !task.tags.includes(searchParams.get("tag")!)) return false;
      const query = searchParams.get("q")?.trim().toLocaleLowerCase();
      return !query || `${task.title}\n${task.notes ?? ""}`.toLocaleLowerCase().includes(query);
    }
    const queryChanged = serverSnapshotRef.current.queryKey !== queryKey;
    const dataChanged = queryChanged || serverSnapshotRef.current.initialTasks !== initialTasks;
    if (queryChanged) loadedIds.current.clear();
    serverSnapshotRef.current = { initialTasks, queryKey };
    setTasks(current => {
      if (!dataChanged) return current.filter(task => pendingRemoval.current.has(task.id) || task.id === selectedId || matchesView(task));
      const refreshed = initialTasks.map(task => {
        const local = current.find(item => item.id === task.id);
        return local && local.revision > task.revision ? local : task;
      });
      const retained = current.filter(task => !initialTasks.some(item => item.id === task.id) && (
        pendingRemoval.current.has(task.id) || task.id === selectedId || loadedIds.current.has(task.id) && matchesView(task)
      ));
      return [...refreshed, ...retained];
    });
  }, [initialTasks, queryKey, selectedId, view, projectId, timeZone, searchParams]);

  const sorted = useMemo(() => view === "completed" ? tasks : sortTasks(tasks, sortKey), [tasks, sortKey, view]);

  useEffect(() => {
    const visibleIds = new Set(tasks.map(task => task.id));
    setBulkIds(current => {
      const next = new Set([...current].filter(id => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [tasks]);
  useEffect(() => {
    setBulkIds(new Set());
    setBulkMode(false);
    setFocusedIndex(-1);
  }, [queryKey]);

  function clearFilters() {
    const q = new URLSearchParams(searchParams.toString());
    for (const key of ["q", "status", "priority", "tag", "cursor"]) q.delete(key);
    startNavigation(() => router.push(q.size ? `${pathname}?${q}` : pathname));
  }
  function openTask(id: string) {
    if (id === selectedId) return;
    if (leaveDetailRef.current) leaveDetailRef.current(() => setSelectedId(id));
    else setSelectedId(id);
  }

  function toggleBulkSelection(id: string) {
    if (!bulkIds.has(id) && bulkIds.size >= 200) { toast.show({ message: "一次最多选择 200 条任务" }); return; }
    setBulkIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selected = useMemo(
    () => sorted.find((task) => task.id === selectedId) ?? null,
    [sorted, selectedId],
  );

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);

  const replaceTask = useCallback(
    (updated: TaskDTO) => {
      rememberRevision(updated);
      setTasks((current) =>
        current.some((task) => task.id === updated.id)
          ? current.map((task) => (task.id === updated.id ? updated : task))
          : [updated, ...current],
      );
      router.refresh();
    },
    [router],
  );

  const removeTask = useCallback(
    (taskId: string) => {
      setTasks((current) => current.filter((task) => task.id !== taskId));
      setSelectedId((current) => (current === taskId ? null : current));
      router.refresh();
    },
    [router],
  );

  const setStatus = useCallback(
    async (task: TaskDTO, status: "todo" | "doing" | "done") => {
      if (statusPending.current.has(task.id)) return;
      statusPending.current.add(task.id);
      setPendingStatusIds(new Set(statusPending.current));
      const previous = task;
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, status } : item,
        ),
      );
      try {
        const result = { task: await patchTask(task, { status }) };
        setTasks((current) =>
          current.map((item) => (item.id === task.id ? result.task : item)),
        );

        const oldTimer = pendingRemoval.current.get(task.id);
        if (oldTimer) window.clearTimeout(oldTimer);
        pendingRemoval.current.delete(task.id);
        if (status === "done" && view !== "completed") {
          const timer = window.setTimeout(() => {
            setTasks((current) =>
              current.filter((item) => item.id !== task.id || selectedIdRef.current === task.id),
            );
            pendingRemoval.current.delete(task.id);
          }, 8000);
          pendingRemoval.current.set(task.id, timer);
          toast.show({
            message: "已完成",
            actionLabel: "撤销",
            durationMs: 8000,
            onAction: () => {
              const handle = pendingRemoval.current.get(task.id);
              if (handle) window.clearTimeout(handle);
              pendingRemoval.current.delete(task.id);
              void patchTask(result.task, {
                  status: previous.status === "done" ? "todo" : previous.status,
              })
                .then((revertedTask) => {
                  const reverted = { task: revertedTask };
                  setTasks((current) =>
                    current.some((item) => item.id === reverted.task.id)
                      ? current.map((item) =>
                          item.id === reverted.task.id ? reverted.task : item,
                        )
                      : [reverted.task, ...current],
                  );
                  router.refresh();
                })
                .catch((err: Error) =>
                  toast.show({ message: err.message, tone: "error" }),
                );
            },
          });
        } else if (view === "completed" && status !== "done") {
          toast.show({ message: "任务已恢复到未完成列表", actionLabel: "查看任务", onAction: () => router.push("/tasks") });
        }
        router.refresh();
      } catch (err) {
        setTasks((current) =>
          current.map((item) => (item.id === previous.id && item.status === status ? { ...item, status: previous.status } : item)),
        );
        toast.show({ message: (err as Error).message, tone: "error" });
      } finally { statusPending.current.delete(task.id); setPendingStatusIds(new Set(statusPending.current)); }
    },
    [replaceTask, router, toast, view],
  );

  // 列表键盘操作：J/K 移动，X 完成，E 编辑
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.closest('[role="combobox"], [role="menu"], [role="switch"], [role="alertdialog"]') ||
        target?.isContentEditable
      )
        return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing)
        return;
      if (
        selectedId || bulkMode || bulkPending || navigating ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      )
        return;

      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        setFocusedIndex((index) => {
          const next = event.key === "j" ? index + 1 : index - 1;
          return Math.max(0, Math.min(sorted.length - 1, next));
        });
        return;
      }
      if (event.key === "x") {
        const task = sorted[focusedIndex];
        if (task) {
          event.preventDefault();
          void setStatus(task, task.status === "done" ? "todo" : "done");
        }
        return;
      }
      if (event.key === "e") {
        const task = sorted[focusedIndex];
        if (task) {
          event.preventDefault();
          setSelectedId(task.id);
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focusedIndex, selectedId, sorted, setStatus, bulkMode, bulkPending, navigating]);

  useEffect(() => {
    const row = sorted[focusedIndex];
    if (!row) return;
    document
      .querySelector(`[data-task-row="${row.id}"] button`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex, sorted]);

  useEffect(() => {
    return () => {
      for (const timer of pendingRemoval.current.values())
        window.clearTimeout(timer);
    };
  }, []);

  async function runBulk(
    action: "complete" | "reopen" | "move" | "delete",
    targetProjectId?: string,
  ) {
    const ids = Array.from(bulkIds).filter(id => tasks.some(task => task.id === id));
    if (ids.length === 0 || bulkPendingRef.current) return;
    if (ids.some(id => statusPending.current.has(id))) { toast.show({ message: "所选任务正在保存，请稍后操作" }); return; }
    if (ids.length > 200) { toast.show({ message: "一次最多操作 200 条任务，请减少选择", tone: "error" }); return; }
    bulkPendingRef.current = true;
    setBulkPending(true);
    try {
      const result = await apiFetch<{
        succeeded: number;
        failed: { id: string; error: string }[];
        tasks: TaskDTO[];
      }>("/api/tasks/bulk", {
        method: "POST",
        body: { action, ids, projectId: targetProjectId || null, revisions: Object.fromEntries(tasks.filter(t => ids.includes(t.id)).map(t => [t.id,t.revision])) },
      });
      for (const task of result.tasks) rememberRevision(task);
      for (const id of ids.filter(id => !result.failed.some(failure => failure.id === id))) {
        const timer = pendingRemoval.current.get(id);
        if (timer) window.clearTimeout(timer);
        pendingRemoval.current.delete(id);
      }
      if (action === "delete" || (action === "complete" && view !== "completed") || (action === "reopen" && view === "completed") || (action === "move" && (view === "inbox" && targetProjectId || view === "project" && targetProjectId !== projectId))) {
        setTasks((current) =>
          current.filter(
            (task) =>
              !ids.includes(task.id) ||
              result.failed.some((f) => f.id === task.id),
          ),
        );
      } else {
        setTasks((current) =>
          current.map((task) =>
            result.tasks.find(t => t.id === task.id) ?? task,
          ),
        );
      }
      const verb = { complete: "完成", reopen: "恢复", move: "移动", delete: "删除" }[action];
      toast.show({
        message: result.failed.length > 0
          ? `已${verb} ${result.succeeded} 条，${result.failed.length} 条未成功，请重试`
          : `已${verb} ${result.succeeded} 条任务`,
        tone: result.failed.length > 0 ? "error" : "info",
      });
      setBulkIds(new Set(result.failed.map(failure => failure.id)));
      setBulkMode(result.failed.length > 0);
      router.refresh();
    } catch (err) {
      const conflict = err instanceof Error && /任务.*(修改|改变)|版本/.test(err.message);
      toast.show({ message: (err as Error).message, tone: "error", ...(conflict ? { actionLabel: "刷新任务", onAction: () => router.refresh() } : {}) });
    } finally {
      bulkPendingRef.current = false;
      setBulkPending(false);
    }
  }

  // 逾期：结束时间（区间任务用截止时间）已过且任务未完成。
  const nowMs = Date.now();
  const isOverdue = (task: TaskDTO) =>
    task.status !== "done" &&
    task.dueAt !== null &&
    Date.parse(task.dueAt) < nowMs;
  const overdue = groupOverdue ? sorted.filter(isOverdue) : [];
  const rest = groupOverdue ? sorted.filter((task) => !isOverdue(task)) : sorted;

  function renderRow(task: TaskDTO) {
    const index = sorted.findIndex((item) => item.id === task.id);
    return (
      <TaskRow
        key={task.id}
        task={task}
        timeZone={timeZone}
        now={new Date()}
        focused={index === focusedIndex}
        active={task.id === selectedId}
        bulkMode={bulkMode}
        selected={bulkIds.has(task.id)}
        busy={bulkPending || pendingStatusIds.has(task.id)}
        onOpen={() => bulkMode ? toggleBulkSelection(task.id) : openTask(task.id)}
        onToggleStatus={() =>
          void setStatus(task, task.status === "done" ? "todo" : "done")
        }
        onToggleSelect={() => toggleBulkSelection(task.id)}
      />
    );
  }

  const filtered = Boolean(
    searchParams.get("q") ||
      searchParams.get("status") ||
      searchParams.get("priority") ||
      searchParams.get("tag"),
  );
  const EmptyIcon = filtered
    ? Search
    : view === "today"
      ? CalendarDays
      : view === "completed"
        ? CircleCheck
        : view === "inbox"
          ? Inbox
          : ListTodo;
  const emptyTitle = filtered
    ? "没有匹配的任务"
    : view === "today"
      ? "今天没有到期任务"
      : view === "completed"
        ? "还没有已完成的任务"
        : view === "inbox"
          ? "收件箱是空的"
          : "从第一条任务开始";
  const emptyDescription = filtered
    ? "试试其他关键词，或清除筛选条件。"
    : view === "today"
      ? "可以记录新任务，或到全部任务中安排接下来的工作。"
      : view === "completed"
        ? "完成的任务会保留在这里，随时可以查看和恢复。"
        : view === "inbox"
          ? "先记录想做的事，之后再按项目整理。"
          : "手动新建任务，或粘贴邮件和需求来生成待办。";

  return (
    <>
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transition}
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      aria-busy={navigating || bulkPending}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header}
        {filters}
        <div className="workspace-list flex min-h-0 flex-1 flex-col">
          <div className="workspace-inner flex shrink-0 flex-wrap items-center gap-2 pb-3">
            <span className="mr-auto inline-flex items-center gap-2 text-[13px] font-medium">
              <ListTodo size={16} className="text-muted" />
              任务列表
              <span className="text-[12px] font-normal text-muted">
                <motion.span
                  key={sorted.length}
                  className="inline-block"
                  initial={reduced ? false : { opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={transition}
                >
                  {nextCursor ? `已加载 ${sorted.length} 条` : `${sorted.length} 条`}
                </motion.span>
              </span>
            </span>
            <button
              type="button"
              className={`btn btn-sm ${bulkMode ? "btn-secondary" : "btn-ghost"}`}
              disabled={bulkPending || navigating || (!bulkMode && sorted.length === 0)}
              onClick={() => {
                if (!bulkMode && leaveDetailRef.current) { leaveDetailRef.current(() => { setSelectedId(null); setBulkMode(true); setBulkIds(new Set()); }); return; }
                setBulkMode((value) => !value);
                setBulkIds(new Set());
              }}
            >
              {bulkMode ? <X size={14} /> : <SquareMousePointer size={14} />}
              {bulkMode ? "退出选择" : "批量选择"}
            </button>
            <label className="flex items-center gap-1.5 text-[12px] text-muted">
              <ArrowDownWideNarrow size={15} className="shrink-0" />
              <span className="sr-only">排序</span>
              <select
                className="field !min-h-8 !w-[120px] !border-transparent !bg-transparent !py-1 !text-[12px] hover:!bg-sunken"
                value={sortKey}
                disabled={bulkPending || navigating}
                onChange={(event) => { const value = event.target.value as SortKey; const q = new URLSearchParams(searchParams.toString()); q.set("sort",value); q.delete("cursor"); startNavigation(() => router.push(`${pathname}?${q}`)); }}
              >
                <option value="due">
                  {view === "completed" ? "完成时间" : "截止时间"}
                </option>
                {view !== "completed" ? <><option value="priority">优先级</option><option value="created">创建时间</option></> : null}
              </select>
            </label>
          </div>
          <div className="scroll-y min-h-0 flex-1">
            <div className="workspace-inner task-list">
              <AnimatePresence initial={false} mode="wait">
                {sorted.length === 0 ? (
                  <motion.div
                    key="empty"
                    className="empty-state"
                    initial={reduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={transition}
                  >
                    <div className="empty-state-icon">
                      <EmptyIcon size={27} strokeWidth={1.5} />
                    </div>
                    <h2 className="text-[17px] font-semibold">{emptyTitle}</h2>
                    <p className="mt-2 max-w-[350px] text-[13px] leading-6 text-muted">
                      {emptyDescription}
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                      {filtered ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={clearFilters}
                          disabled={navigating}
                        >
                          <X size={15} />
                          清除筛选
                        </button>
                      ) : view === "completed" ? (
                        <Link href="/tasks" className="btn btn-secondary">
                          <ListTodo size={15} />
                          查看全部任务
                        </Link>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={actions.newTask}
                          >
                            <Plus size={16} />
                            新建任务
                          </button>
                          {view === "today" ? (
                            <Link href="/tasks" className="btn btn-secondary">
                              查看全部任务
                            </Link>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={actions.importText}
                            >
                              <ClipboardList size={15} />
                              粘贴内容
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {!filtered && view !== "completed" ? (
                      <p className="mt-5 inline-flex items-center gap-1.5 text-[11px] text-muted">
                        也可以按 <kbd className="shortcut">N</kbd> 快速新建
                      </p>
                    ) : null}
                  </motion.div>
                ) : (
                  <motion.div
                    key="rows"
                    initial={false}
                    exit={reduced ? {} : { opacity: 0 }}
                    transition={transition}
                  >
                    {bulkMode ? (
                      <div className="task-list-heading">
                        <label className="inline-flex items-center gap-2">
                          <Checkbox label="选择已加载的任务" disabled={bulkPending} checked={sorted.slice(0, 200).every(task => bulkIds.has(task.id)) ? true : bulkIds.size ? "indeterminate" : false} onCheckedChange={v => setBulkIds(v ? new Set(sorted.slice(0, 200).map(t => t.id)) : new Set())}/>
                          {sorted.length > 200 ? "选择前 200 条" : nextCursor ? "选择已加载任务" : "选择全部"}
                        </label>
                        <span>已选 {bulkIds.size} 条</span>
                      </div>
                    ) : null}
                    {overdue.length > 0 ? (
                      <>
                        <h2 className="task-list-heading !text-danger">
                          <span className="inline-flex items-center gap-2">
                            <CalendarDays size={13} />
                            逾期
                          </span>
                          <span>{overdue.length} 条</span>
                        </h2>
                        <AnimatePresence initial={false}>
                          {overdue.map(renderRow)}
                        </AnimatePresence>
                      </>
                    ) : null}
                    {groupOverdue && rest.length > 0 ? (
                      <h2 className="task-list-heading">
                        <span>今天到期</span>
                        <span>{rest.length} 条</span>
                      </h2>
                    ) : null}
                    {!groupOverdue && !bulkMode ? (
                      <div className="task-list-heading">
                        <span>任务 / 项目</span>
                        <span className="hidden pr-9 md:block">截止时间</span>
                      </div>
                    ) : null}
                    <AnimatePresence initial={false}>
                      {rest.map(renderRow)}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
              {nextCursor && <div className="flex justify-center py-5"><button className="btn btn-secondary" disabled={loadingMore || navigating || bulkPending} onClick={() => void loadMore()}>{loadingMore ? "加载中…" : "加载更多任务"}</button></div>}
            </div>
          </div>
          <AnimatePresence initial={false}>
            {bulkMode ? (
              <motion.div
                key="bulk-actions"
                initial={
                  reduced ? false : { opacity: 0, height: 0, marginTop: 0 }
                }
                animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={transition}
                className="workspace-inner overflow-hidden shrink-0"
              >
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas p-3">
                  <span className="mr-auto text-[12px] text-muted">
                    {bulkPending ? "正在处理所选任务…" : `已选择 ${bulkIds.size} 条`}
                  </span>
                  <label className="text-[12px] text-muted" htmlFor="bulk-project">移动到</label>
                  <select id="bulk-project" className="field !min-h-8 !w-auto min-w-0 max-w-full !py-1 !text-[12px]" value={moveProjectId} onChange={event => setMoveProjectId(event.target.value)} disabled={bulkPending}>
                    <option value="">收件箱</option>
                    {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={bulkPending || bulkIds.size === 0} onClick={() => void runBulk("move", moveProjectId)}>移动</button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={bulkPending || bulkIds.size === 0}
                    onClick={() =>
                      void runBulk(view === "completed" ? "reopen" : "complete")
                    }
                  >
                    <CheckCheck size={14} />
                    {view === "completed" ? "恢复任务" : "标记完成"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={bulkPending || bulkIds.size === 0}
                    onClick={() => setConfirmBulkDelete(true)}
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {selected ? (
          <motion.div
            key="task-detail"
            className="shrink-0 overflow-hidden"
            initial={{ width: 0 }}
            animate={{ width: docked ? 420 : 0 }}
            exit={{ width: 0 }}
            transition={transition}
          >
            <TaskDetail
              key={selected.id}
              task={selected}
              onRegisterLeave={handler => { leaveDetailRef.current = handler; }}
              projects={projects}
              timeZone={timeZone}
              notify={notify}
              docked={docked}
              onClose={() => setSelectedId(null)}
              onUpdated={replaceTask}
              onDeleted={removeTask}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
    <ConfirmDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete} title="删除所选任务" description={`将删除 ${bulkIds.size} 条任务，无法恢复。未发送的提醒也将取消。`} confirmLabel="删除任务" destructive onConfirm={() => runBulk("delete")}/>
    </>
  );
}

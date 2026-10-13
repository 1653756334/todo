"use client";

import {
  CalendarDays,
  Check,
  Circle,
  CircleDot,
  Flag,
  Folder,
  ChevronRight,
} from "lucide-react";
import { motion, useIsPresent } from "motion/react";
import { useUiMotion } from "@/components/Motion";
import { formatFullDateTime, formatTaskTime } from "@/lib/time";
import { LINK_KIND_LABELS, taskIsActive, type TaskDTO } from "@/lib/types";

/** 链接胶囊里展示的文字：优先用 AI/手动给的标签，否则用去掉 www 的主机名 + 路径 */
function linkText(url: string, label: string | null): string {
  if (label) return label;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

type Props = {
  task: TaskDTO;
  timeZone: string;
  now: Date;
  focused: boolean;
  active: boolean;
  bulkMode: boolean;
  selected: boolean;
  busy?: boolean;
  onOpen: () => void;
  onToggleStatus: () => void;
  onToggleSelect: () => void;
};

export function TaskRow({
  task,
  timeZone,
  now,
  focused,
  active,
  bulkMode,
  selected,
  busy = false,
  onOpen,
  onToggleStatus,
  onToggleSelect,
}: Props) {
  const present = useIsPresent();
  const { reduced, transition } = useUiMotion(0.16);
  const time = formatTaskTime(
    task.startAt ? new Date(task.startAt) : null,
    task.dueAt ? new Date(task.dueAt) : null,
    timeZone,
    now,
  );
  const isDone = task.status === "done";
  const isActive = taskIsActive(task, now);
  const timeTone =
    time?.overdue && !isDone
      ? "text-danger"
      : time?.today && !isDone
        ? "text-accent"
        : "text-muted";
  const timeTitle = time?.hasRange
    ? `${formatFullDateTime(new Date(task.startAt!), timeZone)} → ${formatFullDateTime(new Date(task.dueAt!), timeZone)} · ${timeZone}`
    : task.dueAt
      ? `${formatFullDateTime(new Date(task.dueAt), timeZone)} · ${timeZone}`
      : "";

  return (
    <motion.div
      layout="position"
      initial={reduced ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        height: 0,
        paddingTop: 0,
        paddingBottom: 0,
        borderBottomWidth: 0,
      }}
      transition={transition}
      inert={!present}
      data-task-row={task.id}
      className={`task-row group ${active || selected ? "is-active" : ""} ${focused ? "is-focused" : ""}`}
    >
      {bulkMode ? (
        <label className="task-status">
          <input
            type="checkbox"
            checked={selected}
            disabled={busy}
            onChange={onToggleSelect}
            aria-label={`选择「${task.title}」`}
          />
        </label>
      ) : (
        <button
          type="button"
          className={`task-status ${isDone ? "!text-ok" : task.status === "doing" ? "!text-accent" : ""}`}
          onClick={onToggleStatus}
          disabled={busy}
          aria-busy={busy}
          aria-label={
            isDone ? `恢复「${task.title}」` : `把「${task.title}」标记为完成`
          }
          title={isDone ? "恢复任务" : "标记完成"}
        >
          {isDone ? (
            <motion.span
              initial={reduced ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={transition}
              className="flex h-[19px] w-[19px] items-center justify-center rounded-full bg-ok text-surface"
            >
              <Check size={13} strokeWidth={2.5} />
            </motion.span>
          ) : task.status === "doing" ? (
            <CircleDot size={20} strokeWidth={1.6} />
          ) : (
            <Circle size={20} strokeWidth={1.5} />
          )}
        </button>
      )}
      <div
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 md:flex-row md:items-center md:gap-5"
        onClick={() => { if (!busy) onOpen(); }}
      >
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="block w-full text-left"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            aria-label={bulkMode ? `${selected ? "取消选择" : "选择"}「${task.title}」` : `打开「${task.title}」`}
            aria-pressed={bulkMode ? selected : undefined}
          >
            <span
              className={`block text-[14px] font-medium leading-[23px] [overflow-wrap:anywhere] ${isDone ? "text-muted line-through" : "text-ink"}`}
            >
              {task.title}
            </span>
          </button>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            {task.projectName ? (
              <span className="inline-flex max-w-[200px] items-center gap-1.5">
                <Folder
                  size={12}
                  className="shrink-0"
                  style={{ color: task.projectColor ?? "var(--muted)" }}
                />
                <span className="truncate">{task.projectName}</span>
              </span>
            ) : (
              <span>收件箱</span>
            )}
            {task.status === "doing" || isActive ? (
              <span className="text-accent">进行中</span>
            ) : null}
            {task.priority === "high" ? (
              <span className="inline-flex items-center gap-1 text-danger">
                <Flag size={11} />
                高优先级
              </span>
            ) : null}
            {task.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="task-tag max-w-[140px] truncate">
                {tag}
              </span>
            ))}
          </span>
          {task.links.length ? (
            <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
              {task.links.slice(0, 2).map((link, index) => {
                const kind = LINK_KIND_LABELS[link.kind] ?? "链接";
                const text = linkText(link.url, link.label);
                return /^https?:\/\//i.test(link.url) ? (
                  <a
                    key={`${link.url}-${index}`}
                    className="task-link-chip !max-w-full"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={link.url}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className="task-link-kind shrink-0">{kind}</span>
                    <span className="truncate">{text}</span>
                    <span className="sr-only">（在新标签页打开）</span>
                  </a>
                ) : (
                  <span
                    key={`${link.url}-${index}`}
                    className="task-link-chip !max-w-full"
                    title={link.url}
                  >
                    <span className="task-link-kind shrink-0">{kind}</span>
                    <span className="truncate font-mono">{link.url}</span>
                  </span>
                );
              })}
              {task.links.length > 2 ? (
                <button
                  type="button"
                  className="task-link-more"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen();
                  }}
                  aria-label={`还有 ${task.links.length - 2} 个链接，打开详情查看`}
                >
                  +{task.links.length - 2}
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        {time ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 text-[12px] md:justify-end ${timeTone}`}
            title={timeTitle}
          >
            <CalendarDays size={13} />
            {time.text}
            {time.overdue && !isDone ? (
              <span className="ml-1 rounded bg-danger/8 px-1.5 py-0.5 text-[10px]">
                逾期
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className="hidden h-9 w-9 shrink-0 items-center justify-center rounded text-muted opacity-0 hover:bg-sunken group-hover:opacity-100 group-focus-within:opacity-100 sm:flex"
        disabled={busy || bulkMode}
        onClick={onOpen}
        aria-label={`编辑「${task.title}」`}
      >
        <ChevronRight size={16} />
      </button>
    </motion.div>
  );
}

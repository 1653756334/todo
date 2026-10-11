"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { DateTimeField } from "@/components/DateTimeField";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import {
  AnimatedCollapse,
  useUiMotion,
} from "@/components/Motion";
import { useModalInteraction } from "@/components/Dialog";
import { patchTask } from "@/components/tasks/mutations";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, apiFetch } from "@/lib/client";
import { renderMarkdown } from "@/lib/markdown";
import {
  channelPlan,
  channelSummary,
  suppressionReason,
} from "@/shared/notification-policy.mjs";
import {
  formatDateTimeShort,
  formatFullDateTime,
  leadMinutesLabel,
  relativeFromNow,
} from "@/lib/time";
import {
  LINK_KIND_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type NotifyPolicy,
  type ProjectOption,
  type TaskDTO,
} from "@/lib/types";
import { useToast } from "@/components/Toast";

type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";
type TextField = "title" | "notes" | "tagsText";
type Props = {
  task: TaskDTO;
  projects: ProjectOption[];
  timeZone: string;
  notify: NotifyPolicy;
  docked: boolean;
  onClose: () => void;
  onUpdated: (task: TaskDTO) => void;
  onDeleted: (taskId: string) => void;
  onRegisterLeave?: (handler: ((next: () => void) => void) | null) => void;
};

export function TaskDetail({
  task,
  projects,
  timeZone,
  notify,
  docked,
  onClose,
  onUpdated,
  onDeleted,
  onRegisterLeave,
}: Props) {
  const present = useIsPresent();
  const { reduced, transition } = useUiMotion();
  const toast = useToast();
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [tagsText, setTagsText] = useState(task.tags.join(", "));
  const [linkText, setLinkText] = useState("");
  const [linkKind, setLinkKind] = useState("issue");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notesMode, setNotesMode] = useState<"edit" | "preview">("edit");
  const [confirmClose, setConfirmClose] = useState(false);
  const [sourceTask, setSourceTask] = useState<TaskDTO | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [retryingReminder, setRetryingReminder] = useState(false);
  const requestsRef = useRef(new Set<Promise<TaskDTO>>());
  const textSaveRef = useRef<Promise<boolean> | null>(null);
  const failedPatchRef = useRef<Record<string, unknown> | null>(null);
  const conflictRef = useRef(false);
  const leavingRef = useRef(false);
  const pendingDestinationRef = useRef<(() => void) | null>(null);
  const dirtyFields = useRef(new Set<TextField>());
  const draftRef = useRef({
    title: task.title,
    notes: task.notes ?? "",
    tagsText: task.tags.join(", "),
  });
  const taskRef = useRef(task);
  const timerRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  taskRef.current = task;

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    dirtyFields.current.clear();
    draftRef.current = {
      title: task.title,
      notes: task.notes ?? "",
      tagsText: task.tags.join(", "),
    };
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setTagsText(task.tags.join(", "));
    setLinkText("");
    setError(null);
    setSaveState("idle");
    setNotesMode("edit");
    setShowSource(false);
    setSourceTask(null);
    setConfirmClose(false);
    setConfirmDelete(false);
    setDeleting(false);
    setAddingLink(false);
    // Reset drafts when switching tasks; server updates are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  useEffect(() => {
    if (!dirtyFields.current.has("title")) {
      draftRef.current.title = task.title;
      setTitle(task.title);
    }
    if (!dirtyFields.current.has("notes")) {
      draftRef.current.notes = task.notes ?? "";
      setNotes(task.notes ?? "");
    }
    if (!dirtyFields.current.has("tagsText")) {
      draftRef.current.tagsText = task.tags.join(", ");
      setTagsText(task.tags.join(", "));
    }
  }, [task.title, task.notes, task.tags]);

  useEffect(() => {
    if (!docked) return;
    const panel = panelRef.current;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    panel?.focus({ preventScroll: true });
    return () => {
      if (
        previous?.isConnected &&
        !previous.closest("[inert]") &&
        (panel?.contains(document.activeElement) ||
          document.activeElement === document.body)
      ) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [docked, task.id]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      const taskId = task.id;
      setSaveState("saving");
      const request = patchTask(taskRef.current, body);
      requestsRef.current.add(request);
      try {
        const updated = await request;
        if (taskRef.current.id !== taskId) return false;
        taskRef.current = updated;
        onUpdated(updated);
        if (failedPatchRef.current) {
          const remaining = { ...failedPatchRef.current };
          for (const key of Object.keys(body)) delete remaining[key];
          failedPatchRef.current = Object.keys(remaining).length ? remaining : null;
        }
        if (!failedPatchRef.current) setError(null);
        if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
        savedTimerRef.current = window.setTimeout(
          () => setSaveState(state => state === "saved" ? "idle" : state),
          3000,
        );
        return true;
      } catch (err) {
        if (taskRef.current.id === taskId) {
          if (err instanceof ApiError && err.status === 409) conflictRef.current = true;
          failedPatchRef.current = { ...failedPatchRef.current, ...body };
          setError((err as Error).message);
        }
        return false;
      } finally {
        requestsRef.current.delete(request);
        if (taskRef.current.id === taskId) {
          setSaveState(requestsRef.current.size ? "saving" : failedPatchRef.current ? "error" : dirtyFields.current.size ? "unsaved" : "saved");
        }
      }
    },
    [task.id, onUpdated],
  );

  function saveText(): Promise<boolean> {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (textSaveRef.current) return textSaveRef.current.then(okay => okay ? saveText() : false);
    const snapshot = { ...draftRef.current };
    const currentTask = taskRef.current;
    if (dirtyFields.current.has("title") && !snapshot.title.trim()) {
      setSaveState("error");
      setError("标题不能为空，请填写标题后再保存。");
      return Promise.resolve(false);
    }
    const tags = [...new Set(snapshot.tagsText.split(/[,，\s]+/).map(tag => tag.trim()).filter(Boolean))];
    if (tags.length > 12 || tags.some(tag => tag.length > 40)) {
      setSaveState("error");
      setError("最多添加 12 个标签，每个标签不超过 40 个字。");
      return Promise.resolve(false);
    }
    const body: Record<string, unknown> = {};
    if (dirtyFields.current.has("title") && snapshot.title.trim() !== currentTask.title) body.title = snapshot.title.trim();
    if (dirtyFields.current.has("notes") && snapshot.notes !== (currentTask.notes ?? "")) body.notes = snapshot.notes;
    if (dirtyFields.current.has("tagsText") && tags.join("\u0000") !== currentTask.tags.join("\u0000")) body.tags = tags;
    const fields = Array.from(dirtyFields.current);
    if (!Object.keys(body).length) {
      fields.forEach(field => {
        dirtyFields.current.delete(field);
        if (failedPatchRef.current) delete failedPatchRef.current[field === "tagsText" ? "tags" : field];
      });
      if (failedPatchRef.current && !Object.keys(failedPatchRef.current).length) failedPatchRef.current = null;
      if (!failedPatchRef.current && !requestsRef.current.size) { setSaveState("idle"); setError(null); }
      return Promise.resolve(true);
    }
    const saving = patch(body).then(okay => {
      if (okay && taskRef.current.id === currentTask.id) {
        for (const field of fields) {
          if (draftRef.current[field] === snapshot[field]) dirtyFields.current.delete(field);
        }
        setSaveState(requestsRef.current.size ? "saving" : failedPatchRef.current ? "error" : dirtyFields.current.size ? "unsaved" : "saved");
      }
      return okay;
    }).finally(() => { textSaveRef.current = null; });
    textSaveRef.current = saving;
    return saving;
  }

  async function retrySave() {
    if (conflictRef.current) {
      setSaveState("saving");
      try {
        const result = await apiFetch<{ task: TaskDTO }>(`/api/tasks/${task.id}`);
        taskRef.current = result.task;
        onUpdated(result.task);
        conflictRef.current = false;
      } catch (err) { setError((err as Error).message); setSaveState("error"); return; }
    }
    const body = failedPatchRef.current;
    if (body) {
      const properties = Object.fromEntries(Object.entries(body).filter(([key]) => !["title", "notes", "tags"].includes(key)));
      if (Object.keys(properties).length && !await patch(properties)) return;
    }
    await saveText();
  }

  function changeText(field: TextField, value: string) {
    draftRef.current[field] = value;
    dirtyFields.current.add(field);
    if (!requestsRef.current.size) setSaveState("unsaved");
    if (field === "title") setTitle(value);
    if (field === "notes") setNotes(value);
    if (field === "tagsText") setTagsText(value);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void saveText(), 800);
  }

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    },
    [],
  );

  async function requestLeave(next: () => void) {
    if (deleting || leavingRef.current) return;
    leavingRef.current = true;
    pendingDestinationRef.current = next;
    try {
      await Promise.allSettled([...requestsRef.current]);
      const okay = await saveText();
      if (!okay || dirtyFields.current.size || failedPatchRef.current) { setConfirmClose(true); return; }
      pendingDestinationRef.current = null;
      next();
    } finally { leavingRef.current = false; }
  }
  useEffect(() => {
    onRegisterLeave?.(next => { void requestLeave(next); });
    return () => onRegisterLeave?.(null);
  });
  function requestClose() { void requestLeave(onClose); }
  function requestEscape() { requestClose(); }
  useModalInteraction(panelRef, !docked, requestEscape);

  const escapeRef = useRef(requestEscape);
  useEffect(() => {
    escapeRef.current = requestEscape;
  });
  // 桌面常驻详情：焦点可能在列表上，Escape 也要能关闭（捕获阶段，不受面板内 stopPropagation 影响）
  useEffect(() => {
    if (!docked) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]')) return;
      event.preventDefault();
      escapeRef.current();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [docked]);

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    await Promise.allSettled([...requestsRef.current]);
    try {
      await apiFetch(`/api/tasks/${task.id}`, { method: "DELETE", body: { expectedRevision: taskRef.current.revision } });
      toast.show({ message: "任务已删除" });
      onDeleted(task.id);
    } catch (err) {
      toast.show({ message: (err as Error).message, tone: "error" });
      setError((err as Error).message);
      setConfirmDelete(false);
      setDeleting(false);
      deleteButtonRef.current?.focus();
    }
  }

  async function addLink() {
    if (!linkText.trim() || addingLink || requestsRef.current.size) return;
    if (task.links.length >= 20) { setError("最多添加 20 个链接，请先移除不需要的链接。"); return; }
    if (task.links.some(link => link.url === linkText.trim())) { setError("此链接已添加。"); return; }
    const submitted = linkText;
    const taskId = task.id;
    const next = [
      ...task.links.map(({ kind, url, label }) => ({ kind, url, label })),
      { kind: linkKind, url: submitted.trim(), label: null },
    ];
    setAddingLink(true);
    const okay = await patch({ links: next });
    if (taskRef.current.id !== taskId) return;
    if (okay) setLinkText((current) => (current === submitted ? "" : current));
    setAddingLink(false);
  }

  useEffect(() => {
    if (!showSource || !task.sourceId) return;
    const controller = new AbortController();
    setSourceLoading(true);
    void apiFetch<{ task: TaskDTO }>(`/api/tasks/${task.id}`, { signal: controller.signal })
      .then(r => setSourceTask(r.task))
      .catch(e => { if (e.name !== "AbortError") setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setSourceLoading(false); });
    return () => controller.abort();
  }, [showSource, task.id, task.sourceId]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirtyFields.current.size || failedPatchRef.current || saveState === "saving") { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);
  const reminder = reminderStatus(task, timeZone, notify);
  return (
    <>
    <ConfirmDialog open={confirmClose} onOpenChange={value => { setConfirmClose(value); if (!value) pendingDestinationRef.current = null; }} title="离开前有修改未保存" description="修改未能保存。取消可继续编辑或重试保存；放弃后将丢失这些修改。" confirmLabel="放弃修改并离开" onConfirm={() => { if (timerRef.current) window.clearTimeout(timerRef.current); const next = pendingDestinationRef.current ?? onClose; pendingDestinationRef.current = null; next(); }} />
    <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="删除任务" description={`删除「${task.title}」后无法恢复，未发送的提醒也将取消。`} confirmLabel="删除任务" destructive onConfirm={remove} />
    <motion.aside
      initial={
        reduced ? false : { opacity: 0, x: docked ? 14 : 0, y: docked ? 0 : 12 }
      }
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{
        opacity: 0,
        x: reduced || !docked ? 0 : 14,
        y: reduced || docked ? 0 : 8,
      }}
      transition={transition}
      inert={!present}
      data-presence={present ? "open" : "closing"}
      ref={panelRef}
      tabIndex={-1}
      role={docked ? "complementary" : "dialog"}
      aria-modal={docked ? undefined : true}
      aria-labelledby="detail-heading"
      data-modal={docked ? undefined : "true"}
      className={`flex min-h-0 flex-col bg-surface ${docked ? "h-full w-[420px] max-w-full border-l border-line" : "fixed inset-0 z-40 h-dvh w-full"}`}
      onKeyDown={(event) => {
        // 面板内的按键不再冒泡给全局快捷键（如 N 新建任务）
        event.stopPropagation();
      }}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-4">
        <ClipboardList
          size={20}
          strokeWidth={1.75}
          className="shrink-0 text-accent"
          aria-hidden="true"
        />
        <h2 id="detail-heading" className="section-title">
          任务详情
        </h2>
        <span
          className={`ml-auto flex items-center gap-1.5 text-[12px] ${saveState === "error" ? "text-danger" : "text-muted"}`}
          role="status"
          aria-live="polite"
        >
          {saveState === "saving" ? (
            <LoaderCircle
              size={14}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : saveState === "saved" ? (
            <Check size={14} aria-hidden="true" />
          ) : null}
          {saveState === "saving"
            ? "保存中…"
            : saveState === "unsaved"
              ? "等待保存"
              : saveState === "saved"
              ? "已保存"
              : saveState === "error"
                ? "未保存"
                : "已同步"}
        </span>
        <button
          type="button"
          className="icon-button shrink-0"
          onClick={requestClose}
          aria-label="关闭任务详情"
          title="关闭详情"
        >
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>

      <div className="scroll-y min-h-0 flex-1 overscroll-contain px-5 py-5" inert={deleting}>
        {error ? (
          <div className="mb-5 rounded-lg border border-danger/20 bg-surface p-3">
            <p className="error-text break-words" role="alert">{error}</p>
            {saveState === "error" ? <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => void retrySave()}>重试保存</button> : null}
          </div>
        ) : null}
        <section className="space-y-3" aria-labelledby="detail-title-label">
          <label
            id="detail-title-label"
            className="label"
            htmlFor="detail-title"
          >
            任务标题
          </label>
          <textarea
            id="detail-title"
            className="field min-h-[84px] resize-none text-[18px] leading-relaxed font-semibold"
            rows={2}
            value={title}
            data-autofocus
            onChange={(event) =>
              changeText("title", event.target.value.replace(/\n/g, " "))
            }
            onBlur={() => void saveText()}
            aria-invalid={!title.trim()}
            aria-describedby="detail-title-hint"
            disabled={deleting}
            maxLength={300}
          />
          <p id="detail-title-hint" className="hint">停止输入或离开输入框后自动保存，保存结果显示在上方。</p>
        </section>

        <section
          className="mt-6 space-y-4 border-t border-line pt-5"
          aria-labelledby="detail-properties"
        >
          <h3
            id="detail-properties"
            className="section-title flex items-center gap-2"
          >
            <SlidersHorizontal
              size={18}
              strokeWidth={1.75}
              className="text-muted"
              aria-hidden="true"
            />
            任务属性
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="detail-status">
                状态
              </label>
              <select
                id="detail-status"
                className="field min-h-10"
                value={task.status}
                disabled={saveState === "saving"}
                onChange={(event) => void patch({ status: event.target.value })}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="detail-priority">
                优先级
              </label>
              <select
                id="detail-priority"
                className="field min-h-10"
                value={task.priority}
                disabled={saveState === "saving"}
                onChange={(event) =>
                  void patch({ priority: event.target.value })
                }
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor="detail-project">
                项目
              </label>
              <select
                id="detail-project"
                className="field min-h-10"
                value={task.projectId ?? ""}
                disabled={saveState === "saving"}
                onChange={(event) =>
                  void patch({ projectId: event.target.value || null })
                }
              >
                <option value="">收件箱</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor="detail-tags">
                标签
              </label>
              <input
                id="detail-tags"
                className="field min-h-10"
                value={tagsText}
                placeholder="用逗号或空格分隔，例如：工作, 跟进"
                onChange={(event) => changeText("tagsText", event.target.value)}
                onBlur={() => void saveText()}
              />
              <p className="hint">最多 12 个标签，每个不超过 40 个字。</p>
            </div>
          </div>
        </section>

        <section
          className="mt-6 space-y-3 border-t border-line pt-5"
          aria-labelledby="detail-schedule"
        >
          <h3
            id="detail-schedule"
            className="section-title flex items-center gap-2"
          >
            <CalendarDays
              size={18}
              strokeWidth={1.75}
              className="text-muted"
              aria-hidden="true"
            />
            <label htmlFor="detail-due">截止时间</label>
          </h3>
          <DateTimeField
            key={task.id}
            id="detail-due"
            value={task.dueAt}
            onChange={(iso) => void patch({ dueAt: iso })}
            timeZone={timeZone}
            disabled={saveState === "saving"}
          />
        </section>

        <section
          className="mt-6 space-y-3 border-t border-line pt-5"
          aria-labelledby="detail-description"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              id="detail-description"
              className="section-title flex items-center gap-2"
            >
              <FileText
                size={18}
                strokeWidth={1.75}
                className="text-muted"
                aria-hidden="true"
              />
              <label htmlFor="detail-notes">描述</label>
            </h3>
            <div
              className="flex gap-1 rounded-lg bg-sunken p-1"
              role="group"
              aria-label="描述显示方式"
            >
              <button
                type="button"
                className={`btn min-h-[38px] px-3 ${notesMode === "edit" ? "btn-secondary" : "btn-ghost"}`}
                aria-pressed={notesMode === "edit"}
                onClick={() => setNotesMode("edit")}
              >
                编辑
              </button>
              <button
                type="button"
                className={`btn min-h-[38px] px-3 ${notesMode === "preview" ? "btn-secondary" : "btn-ghost"}`}
                aria-pressed={notesMode === "preview"}
                onClick={() => setNotesMode("preview")}
              >
                预览
              </button>
            </div>
          </div>
          {notesMode === "edit" ? (
            <>
              <textarea
                id="detail-notes"
                className="field"
                maxLength={20000}
                rows={6}
                value={notes}
                placeholder="补充任务背景、步骤和注意事项"
                onChange={(event) => changeText("notes", event.target.value)}
                onBlur={saveText}
                aria-describedby="detail-notes-hint"
              />
              <p id="detail-notes-hint" className="hint">
                支持 Markdown 格式。
              </p>
            </>
          ) : notes.trim() ? (
            <div
              className="min-h-[100px] rounded-xl border border-line bg-surface p-4 text-[14px] leading-relaxed break-words [&_a]:text-accent [&_a]:underline [&_h1]:font-semibold [&_h2]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-2 [&_pre]:overflow-x-auto [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(notes) }}
            />
          ) : (
            <p className="hint rounded-xl border border-dashed border-line p-4">
              还没有描述，可切换到编辑添加。
            </p>
          )}
        </section>

        <section
          className="mt-6 space-y-3 border-t border-line pt-5"
          aria-labelledby="detail-reminder"
        >
          <h3
            id="detail-reminder"
            className="section-title flex items-center gap-2"
          >
            <Bell
              size={18}
              strokeWidth={1.75}
              className="text-muted"
              aria-hidden="true"
            />
            提醒
          </h3>
          <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <label className="flex min-h-10 cursor-pointer items-center gap-3 text-[14px]">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-accent"
                checked={task.remindEnabled}
                disabled={saveState === "saving"}
                onChange={(event) =>
                  void patch({ remindEnabled: event.target.checked })
                }
              />
              启用截止前提醒
            </label>
            {task.dueAt ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[13px]">
                  <label htmlFor="detail-lead">提前</label>
                  <input
                    key={`${task.id}-${task.remindLeadMin}`}
                    id="detail-lead"
                    type="number"
                    min={1}
                    max={20160}
                    className="field min-h-10 max-w-[100px]"
                    defaultValue={task.remindLeadMin}
                    disabled={!task.remindEnabled || saveState === "saving"}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (
                        Number.isInteger(value) &&
                        value > 0 &&
                        value <= 20160 &&
                        value !== task.remindLeadMin
                      )
                        void patch({ remindLeadMin: value });
                      else {
                        event.target.value = String(task.remindLeadMin);
                        if (!Number.isInteger(value) || value < 1 || value > 20160) toast.show({ message: "提前时间需为 1 至 20160 的整数分钟", tone: "error" });
                      }
                    }}
                  />
                  <span className="text-muted">分钟</span>
                </div>
                <p className="hint">
                  当前提前 {leadMinutesLabel(task.remindLeadMin)}
                </p>
              </div>
            ) : null}
            <p
              className={`text-[13px] leading-relaxed break-words ${reminder.tone === "error" ? "text-danger" : reminder.tone === "warn" ? "text-warn" : "text-muted"}`}
            >
              {reminder.text}
            </p>
            {reminder.channels ? (
              <p className="text-[13px] leading-relaxed break-words text-muted">
                {reminder.channels}
              </p>
            ) : null}
            {reminder.action === "settings" ? (
              <button
                type="button"
                className="btn btn-secondary min-h-10"
                onClick={() => router.push("/settings/email")}
              >
                <Settings2 size={16} aria-hidden="true" />
                设置通知渠道
              </button>
            ) : null}
            {reminder.action === "retry" ? (
              <button
                type="button"
                className="btn btn-secondary min-h-10"
                disabled={retryingReminder}
                onClick={async () => {
                  if (!task.reminder || retryingReminder) return;
                  setRetryingReminder(true);
                  try {
                    await apiFetch(`/api/reminders/${task.reminder.id}/retry`, { method: "POST" });
                    toast.show({ message: "已安排重新发送" });
                    router.refresh();
                  } catch (err) { toast.show({ message: (err as Error).message, tone: "error" }); }
                  finally { setRetryingReminder(false); }
                }}
              >
                <RotateCcw size={16} aria-hidden="true" />
                {retryingReminder ? "正在安排…" : "重试发送"}
              </button>
            ) : null}
          </div>
        </section>

        <section
          className="mt-6 space-y-3 border-t border-line pt-5"
          aria-labelledby="detail-links"
        >
          <h3
            id="detail-links"
            className="section-title flex items-center gap-2"
          >
            <Link2
              size={18}
              strokeWidth={1.75}
              className="text-muted"
              aria-hidden="true"
            />
            链接与路径
          </h3>
          {task.links.length ? (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {task.links.map((link, index) => (
                  <motion.li
                    key={`${link.kind}-${link.url}-${index}`}
                    layout="position"
                    initial={reduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={transition}
                    className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface p-3 text-[13px]"
                  >
                    <span className="status-pill shrink-0">
                      {LINK_KIND_LABELS[link.kind] ?? "链接"}
                    </span>
                    {/^https?:\/\//i.test(link.url) ? (
                      <a
                        className="flex min-w-0 flex-1 items-center gap-2 text-accent hover:underline"
                        href={link.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={link.url}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {link.label || link.url}
                        </span>
                        <ExternalLink
                          size={14}
                          className="shrink-0"
                          aria-hidden="true"
                        />
                        <span className="sr-only">（在新标签页打开）</span>
                      </a>
                    ) : (
                      <span
                        className="min-w-0 truncate font-mono"
                        title={link.url}
                      >
                        {link.label || link.url}
                      </span>
                    )}
                    <button type="button" className="icon-button shrink-0" disabled={saveState === "saving"} aria-label={`移除链接 ${link.label || link.url}`} onClick={() => void patch({ links: task.links.filter((_link, linkIndex) => linkIndex !== index) })}><X size={14} aria-hidden="true" /></button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <p className="hint">添加相关文档、问题链接或文件路径。</p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="col-span-2">
              <label className="label" htmlFor="detail-link-url">
                链接或文件路径
              </label>
              <input
                id="detail-link-url"
                className="field min-h-10"
                maxLength={1000}
                placeholder="https://… 或 src/foo.ts:42"
                value={linkText}
                onChange={(event) => setLinkText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void addLink();
                  }
                }}
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="detail-link-kind">
                链接类型
              </label>
              <select
                id="detail-link-kind"
                className="field min-h-10"
                value={linkKind}
                onChange={(event) => setLinkKind(event.target.value)}
              >
                {Object.entries(LINK_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-secondary min-h-10"
              disabled={!linkText.trim() || addingLink || saveState === "saving"}
              onClick={() => void addLink()}
            >
              <Plus size={16} aria-hidden="true" />
              {addingLink ? "添加中…" : "添加"}
            </button>
          </div>
        </section>

        {task.sourceId ? (
          <section className="mt-6 border-t border-line pt-4">
            <button
              type="button"
              className="btn btn-ghost min-h-10 w-full justify-between"
              onClick={() => setShowSource((value) => !value)}
              aria-expanded={showSource}
              aria-controls="detail-source"
            >
              <span className="flex items-center gap-2">
                <FileText size={16} aria-hidden="true" />
                查看任务来源
              </span>
              {showSource ? (
                <ChevronUp size={16} aria-hidden="true" />
              ) : (
                <ChevronDown size={16} aria-hidden="true" />
              )}
            </button>
            <AnimatedCollapse open={showSource}>
              <div id="detail-source" className="mt-3 space-y-3">
                {sourceLoading ? <p className="hint" role="status">正在加载来源…</p> : !sourceTask?.sourceText && !sourceTask?.sourceImages?.length ? <p className="hint">暂无可显示的来源内容。</p> : null}
                {sourceTask?.sourceText ? (
                  <pre className="max-h-[240px] overflow-auto rounded-xl border border-line bg-sunken p-4 font-sans text-[13px] break-words whitespace-pre-wrap">
                    {sourceTask.sourceText}
                  </pre>
                ) : null}
                {sourceTask?.sourceImages?.map((image, index) => (
                  <a
                    key={image.id}
                    href={image.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-xl border border-line bg-sunken"
                    aria-label={`查看来源图片 ${index + 1}：${image.name}`}
                  >
                    <img
                      src={image.url}
                      alt={`来源图片 ${index + 1}：${image.name}`}
                      loading="lazy"
                      className="max-h-[240px] w-full object-contain"
                    />
                    <span className="flex items-center justify-between gap-2 border-t border-line bg-surface px-3 py-2 text-xs">
                      <span className="truncate">{image.name}</span>
                      <span className="shrink-0 text-accent">查看大图</span>
                    </span>
                  </a>
                ))}
              </div>
            </AnimatedCollapse>
          </section>
        ) : null}
        <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-t border-line pt-4 text-[12px] text-muted">
          <dt>创建时间</dt>
          <dd>{formatDateTimeShort(new Date(task.createdAt), timeZone)}</dd>
          {task.completedAt ? (
            <>
              <dt>完成时间</dt>
              <dd>
                {formatDateTimeShort(new Date(task.completedAt), timeZone)}
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      <footer className="shrink-0 border-t border-line bg-surface px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            ref={deleteButtonRef}
            type="button"
            className="btn btn-danger min-h-10"
            disabled={deleting || saveState === "saving"}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
            {deleting ? "删除中…" : "删除任务"}
          </button>
          <button type="button" className="btn btn-secondary min-h-10" disabled={deleting} onClick={requestClose}>关闭详情</button>
        </div>
      </footer>
    </motion.aside>
    </>
  );
}

type ReminderView = {
  text: string;
  tone: "muted" | "warn" | "error";
  action?: "settings" | "retry";
  /** 本次提醒会走哪些渠道（受优先级门槛影响） */
  channels?: string;
};

export function reminderStatus(
  task: TaskDTO,
  timeZone: string,
  notify: NotifyPolicy,
): ReminderView {
  if (task.status === "done")
    return { text: "任务已完成，提醒已取消。", tone: "muted" };
  if (!task.dueAt) return { text: "先设置截止时间以启用提醒。", tone: "muted" };
  if (!task.remindEnabled) return { text: "提醒已关闭。", tone: "muted" };

  const plan = channelPlan({
    priority: task.priority,
    email: notify.email,
    bot: notify.bot,
  });
  if (!plan.configured)
    return {
      text: "邮件与推送渠道都未配置。",
      tone: "warn",
      action: "settings",
    };
  // 渠道都配好了，但当前优先级达不到任何一个门槛：本来就不该发送
  if (!plan.email && !plan.bot)
    return {
      text: `${suppressionReason({ priority: task.priority, plan })}。`,
      tone: "muted",
      channels: "可在「设置 → 邮件通知 / 群机器人」里调整触发优先级。",
    };
  const channels = channelSummary({ priority: task.priority, plan });

  const reminder = task.reminder;
  if (!reminder)
    return {
      text: "提醒计划尚未生成，保存后会自动安排。",
      tone: "warn",
      channels,
    };
  switch (reminder.status) {
    case "pending": {
      const trigger = new Date(reminder.triggerAt);
      if (trigger.getTime() <= Date.now())
        return {
          text: "距截止不足提前量，将尽快发送提醒。",
          tone: "warn",
          channels,
        };
      return {
        text: `将于 ${formatFullDateTime(trigger, timeZone)} 发送提醒（${relativeFromNow(trigger)}）。`,
        tone: "muted",
        channels,
      };
    }
    case "claimed":
      return { text: "提醒发送中。", tone: "warn", channels };
    case "sent":
      return {
        text: `提醒已提交发送${reminder.sentAt ? ` · ${formatDateTimeShort(new Date(reminder.sentAt), timeZone)}` : ""}。`,
        tone: "muted",
        channels,
      };
    case "partial":
      return { text: "部分渠道已提交成功，请在提醒记录查看失败渠道。", tone: "muted", action: "retry", channels };
    case "failed":
      return {
        text: `提醒发送失败（已重试 ${reminder.attempt} 次）：${reminder.lastError ?? "原因未知"}`,
        tone: "error",
        action: "retry",
        channels,
      };
    case "canceled":
      // 因为优先级不够而跳过时，Worker 会把原因写进 lastError；
      // 门槛调低后同一个任务仍显示这条记录，可以直接手动发一次。
      return {
        text: reminder.lastError
          ? `提醒已取消：${reminder.lastError}`
          : "提醒已取消。",
        tone: "muted",
        action: reminder.lastError ? "retry" : undefined,
        channels,
      };
    default:
      return { text: `提醒状态：${reminder.status}`, tone: "muted", channels };
  }
}

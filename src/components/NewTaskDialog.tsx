"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  FileText,
  Folder,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { DateTimeField } from "@/components/DateTimeField";
import { AnimatedCollapse } from "@/components/Motion";
import { Field, Modal } from "@/components/Dialog";
import { apiFetch } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { channelPlan, channelSummary, suppressionReason } from "@/shared/notification-policy.mjs";
import { leadMinutesLabel } from "@/lib/time";
import { PRIORITY_LABELS, type NotifyPolicy, type ProjectOption, type TaskDTO } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
  defaultProjectId: string | null;
  timeZone: string;
  onSaved?: (taskId: string) => void;
};

const EMPTY = {
  title: "",
  notes: "",
  projectId: "",
  priority: "normal",
  startAt: null as string | null,
  dueAt: null as string | null,
  remindEnabled: true,
  remindLeadMin: 60,
};

export function NewTaskDialog({
  open,
  onClose,
  projects,
  defaultProjectId,
  timeZone,
  onSaved,
}: Props) {
  const toast = useToast();
  const mutationId = useRef("");
  const submitPendingRef = useRef(false);
  const reminderEdited = useRef(false);
  const [notify, setNotify] = useState<NotifyPolicy | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [form, setForm] = useState({
    ...EMPTY,
    projectId: defaultProjectId ?? "",
  });
  const [pending, setPending] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [defaultsUnavailable, setDefaultsUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    mutationId.current = crypto.randomUUID();
    submitPendingRef.current = false;
    reminderEdited.current = false;
    setForm({ ...EMPTY, projectId: projects.some(project => project.id === defaultProjectId) ? defaultProjectId! : "" });
    setNotify(null);
    setError(null);
    setPending(false);
    setLoadingDefaults(true);
    setDefaultsUnavailable(false);
    setShowMore(false);
    setConfirmClose(false);
    const controller = new AbortController();
    void apiFetch<{ preference: { remindEnabled: boolean; remindLeadMin: number }; capabilities: { notify: NotifyPolicy } }>("/api/settings", { signal: controller.signal })
      .then(result => {
        setNotify(result.capabilities.notify);
        if (!reminderEdited.current) setForm(current => ({ ...current, remindEnabled: result.preference.remindEnabled, remindLeadMin: result.preference.remindLeadMin }));
      })
      .catch(() => { if (!controller.signal.aborted) setDefaultsUnavailable(true); })
      .finally(() => { if (!controller.signal.aborted) setLoadingDefaults(false); });
    return () => controller.abort();
    // Defaults are captured when the dialog opens, so refreshing projects cannot erase a draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function requestClose() {
    if (pending) return;
    if (form.title.trim() || form.notes.trim() || form.dueAt || form.startAt) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || loadingDefaults || submitPendingRef.current) return;
    if (!form.title.trim()) {
      setError("标题不能为空");
      document.getElementById("task-title")?.focus();
      return;
    }
    if (form.startAt && !form.dueAt) {
      setError("设置开始时间时也要有截止时间");
      return;
    }
    if (!Number.isInteger(form.remindLeadMin) || form.remindLeadMin < 1 || form.remindLeadMin > 20160) {
      setShowMore(true);
      setError("提醒提前时间需为 1 至 20160 的整数分钟");
      return;
    }
    submitPendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await apiFetch<{ task: TaskDTO }>("/api/tasks", {
        method: "POST",
        body: {
          clientMutationId: mutationId.current,
          title: form.title.trim(),
          notes: form.notes.trim() || null,
          projectId: form.projectId || null,
          priority: form.priority,
          startAt: form.startAt,
          dueAt: form.dueAt,
          remindEnabled: form.remindEnabled,
          remindLeadMin: form.remindLeadMin,
        },
      });
      toast.show({ message: `已创建任务，保存到${result.task.projectName ? `「${result.task.projectName}」` : "收件箱"}` });
      onSaved?.(result.task.id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    } finally { submitPendingRef.current = false; }
  }

  const plan = notify ? channelPlan({ priority: form.priority, ...notify }) : null;
  const reminderText = !form.remindEnabled
    ? "此任务不发送提醒。"
    : !form.dueAt
      ? "添加截止时间后，按提醒设置安排通知。"
      : !plan
        ? "已启用提醒，创建后可在任务详情查看发送安排。"
        : !plan.configured
          ? "尚未启用通知渠道，暂时无法发送提醒。可在设置中添加邮件或推送。"
          : !plan.email && !plan.bot
            ? `${suppressionReason({ priority: form.priority, plan })}。`
            : `提前 ${leadMinutesLabel(form.remindLeadMin)} 提醒。${channelSummary({ priority: form.priority, plan })}`;

  return (
    <>
    <ConfirmDialog open={confirmClose} onOpenChange={setConfirmClose} title="放弃新建任务" description="已填写的任务内容尚未保存。" confirmLabel="放弃并关闭" onConfirm={() => { setConfirmClose(false); onClose(); }} />
    <Modal
      open={open}
      onClose={requestClose}
      title="新建任务"
      maxWidth={600}
      closeDisabled={pending}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={requestClose}
            disabled={pending}
          >
            取消
          </button>
          <button
            type="submit"
            form="new-task-form"
            className="btn btn-primary"
            disabled={pending || loadingDefaults || (!!form.startAt && !form.dueAt)}
          >
            <Plus size={17} strokeWidth={1.75} aria-hidden="true" />
            {pending ? "正在创建…" : loadingDefaults ? "加载提醒设置…" : "创建任务"}
          </button>
        </div>
      }
    >
      <form
        id="new-task-form"
        onSubmit={submit}
        className="space-y-5"
        aria-busy={pending}
      >
        <section className="space-y-4">
          <p className="section-description">
            写下要做的事，再安排项目和截止时间。
          </p>
          {defaultsUnavailable ? <p className="hint" role="status">暂时无法读取提醒偏好，当前使用提前 60 分钟提醒；可在「描述与提醒」中调整。</p> : null}
          {error ? <p className="error-text rounded-lg border border-danger/20 p-3" role="alert">{error}</p> : null}
          <Field label="任务标题" htmlFor="task-title">
            <input
              id="task-title"
              className="field min-h-10"
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
              placeholder="例如：整理本周会议记录"
              maxLength={300}
              autoComplete="off"
              data-autofocus
              aria-required="true"
              aria-invalid={!!error && !form.title.trim()}
              disabled={pending}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2 [&>div]:mt-0">
            <Field label="项目" htmlFor="task-project">
              <div className="relative">
                <Folder
                  size={17}
                  strokeWidth={1.75}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <select
                  id="task-project"
                  className="field min-h-10 pl-9"
                  value={form.projectId}
                  disabled={pending}
                  onChange={(event) =>
                    setForm({ ...form, projectId: event.target.value })
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
            </Field>
            <Field label="优先级" htmlFor="task-priority">
              <select
                id="task-priority"
                className="field min-h-10"
                value={form.priority}
                disabled={pending}
                onChange={(event) =>
                  setForm({ ...form, priority: event.target.value })
                }
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section
          className="space-y-3 border-t border-line pt-5"
          aria-labelledby="new-task-schedule"
        >
          <h3
            id="new-task-schedule"
            className="section-title flex items-center gap-2"
          >
            <CalendarDays
              size={18}
              strokeWidth={1.75}
              className="text-muted"
              aria-hidden="true"
            />
            <label htmlFor="task-due">截止时间</label>
          </h3>
          <DateTimeField
            id="task-due"
            value={form.dueAt}
            startValue={form.startAt}
            onChange={(iso) => setForm({ ...form, dueAt: iso, ...(iso === null ? { startAt: null } : {}) })}
            onStartChange={(iso) => setForm({ ...form, startAt: iso })}
            timeZone={timeZone}
            disabled={pending}
          />
          {form.startAt && !form.dueAt ? (
            <p className="hint text-warn" role="status">设置开始时间时也要有截止时间，请填写结束时间。</p>
          ) : null}
          <p className="hint flex items-start gap-2" role="status"><Bell size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{reminderText}</p>
        </section>

        <div className="border-t border-line pt-4">
          <button
            type="button"
            className="btn btn-ghost min-h-10 w-full justify-between"
            onClick={() => setShowMore((value) => !value)}
            aria-expanded={showMore}
            aria-controls="new-task-more"
            disabled={pending}
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              描述与提醒
            </span>
            {showMore ? (
              <ChevronUp size={18} aria-hidden="true" />
            ) : (
              <ChevronDown size={18} aria-hidden="true" />
            )}
          </button>
          <AnimatedCollapse open={showMore}>
            <div id="new-task-more" className="mt-4 space-y-5">
              <section className="space-y-3">
                <h3 className="section-title flex items-center gap-2">
                  <FileText
                    size={18}
                    strokeWidth={1.75}
                    className="text-muted"
                    aria-hidden="true"
                  />
                  <label htmlFor="task-notes">描述</label>
                </h3>
                <textarea
                  id="task-notes"
                  className="field"
                  rows={4}
                  maxLength={20000}
                  value={form.notes}
                  disabled={pending}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  placeholder="补充步骤、背景或注意事项"
                  aria-describedby="task-notes-hint"
                />
                <p id="task-notes-hint" className="hint">
                  支持 Markdown，可稍后补充。
                </p>
              </section>
              <section
                className="space-y-3 rounded-xl border border-line bg-surface p-4"
                aria-labelledby="new-task-reminder"
              >
                <h3
                  id="new-task-reminder"
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
                <label className="flex min-h-10 cursor-pointer items-center gap-3 text-[14px]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-accent"
                    checked={form.remindEnabled}
                    disabled={pending}
                    onChange={(event) => {
                      reminderEdited.current = true;
                      setForm({ ...form, remindEnabled: event.target.checked });
                    }}
                  />
                  截止前发送提醒
                </label>
                {form.remindEnabled ? (
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <label htmlFor="task-lead">提前</label>
                    <input
                      id="task-lead"
                      type="number"
                      min={1}
                      max={20160}
                      className="field min-h-10 max-w-[100px]"
                      value={form.remindLeadMin}
                      disabled={pending}
                      onChange={(event) => {
                        reminderEdited.current = true;
                        setForm({ ...form, remindLeadMin: Number(event.target.value) });
                      }}
                    />
                    <span className="text-muted">分钟</span>
                  </div>
                ) : null}
                {!form.dueAt ? (
                  <p className="hint">设置截止时间后，系统会安排提醒。</p>
                ) : null}
              </section>
            </div>
          </AnimatedCollapse>
        </div>
      </form>
    </Modal>
    </>
  );
}

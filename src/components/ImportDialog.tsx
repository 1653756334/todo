"use client";

import { useTaskActions } from "@/components/AppShell";
import { AnimatedCollapse, ContentTransition } from "@/components/Motion";
import { ImportPreviewSkeleton } from "@/components/LoadingSkeleton";
import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import {
  ImportImages,
  readImageFile,
  type ImportImageDraft,
} from "@/components/ImportImages";
import {
  IMPORT_IMAGE_ACCEPT,
  MAX_IMPORT_TEXT,
  MAX_IMPORT_IMAGES,
  MAX_IMPORT_IMAGE_BYTES,
  MAX_IMPORT_TOTAL_BYTES,
} from "@/shared/import-media";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  ListChecks,
  LoaderCircle,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import { DateTimeField } from "@/components/DateTimeField";
import { Modal } from "@/components/Dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/client";
import { formatFullDateTime } from "@/lib/time";
import {
  PRIORITY_LABELS,
  LINK_KIND_LABELS,
  type ProjectOption,
} from "@/lib/types";
import { useToast } from "@/components/Toast";

const MAX_TEXT = MAX_IMPORT_TEXT;

type RowLink = { kind: string; url: string; label: string | null };

type Candidate = {
  key: string;
  selected: boolean;
  title: string;
  notes: string;
  priority: string;
  projectId: string;
  dueAt: string | null;
  dueHint: string | null;
  duePrecision: "datetime" | "date" | "ambiguous" | "none";
  dueDate: string | null;
  tags: string[];
  links: RowLink[];
  expanded: boolean;
};
type RawCandidate = {
  title: string;
  notes: string | null;
  priority: string;
  dueAt: string | null;
  dueDate: string | null;
  dueHint: string | null;
  duePrecision: Candidate["duePrecision"];
  projectId: string | null;
  tags: string[];
  links?: RowLink[] | null;
};
type Props = {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
  defaultProjectId: string | null;
  timeZone: string;
  onCommitted?: () => void;
  onConfigureAi?: () => void;
  aiConfigured: boolean;
};

function dueStatusText(
  row: Candidate,
  timeZone: string,
): { tone: "ok" | "warn" | "muted"; text: string } {
  if (row.dueAt) {
    const past = new Date(row.dueAt).getTime() < Date.now();
    const full = formatFullDateTime(new Date(row.dueAt), timeZone);
    const hint = row.dueHint ? `（原文：${row.dueHint}）` : "";
    return past
      ? { tone: "warn", text: `该时间已过：${full}${hint}` }
      : { tone: "ok", text: `已解析：${full}${hint}` };
  }
  if (row.duePrecision === "date") {
    const dateText = row.dueDate ? `${row.dueDate} ` : "";
    return {
      tone: "warn",
      text: `原文只给出日期：${dateText}${row.dueHint ? `（${row.dueHint}）` : ""}，请选择具体时间，否则不设截止时间`,
    };
  }
  if (row.duePrecision === "ambiguous")
    return {
      tone: "warn",
      text: `时间表达无法确定${row.dueHint ? `（${row.dueHint}）` : ""}，请选择具体时间或保持不设`,
    };
  return { tone: "muted", text: "未设置截止时间" };
}

export function ImportDialog({
  open,
  onClose,
  projects,
  defaultProjectId,
  timeZone,
  onCommitted,
  onConfigureAi,
  aiConfigured,
}: Props) {
  const toast = useToast();
  const actions = useTaskActions();
  const commitPendingRef = useRef(false);
  const [text, setText] = useState("");
  const draftRef = useRef<string | null>(null);
  const uploadSignatureRef = useRef<string>("");
  const commitIdRef = useRef<string>("");
  const [images, setImages] = useState<ImportImageDraft[]>([]);
  const [readingImages, setReadingImages] = useState(false);
  const imagesRef = useRef<ImportImageDraft[]>([]);
  const imageRevisionRef = useRef(0);
  const readingCountRef = useRef(0);
  const imageQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [phase, setPhase] = useState<
    "input" | "parsing" | "preview" | "committing"
  >("input");
  const [rows, setRows] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const keyRef = useRef(0);

  useEffect(() => {
    if (open) {
      setPhase("input");
      setRows([]);
      setError(null);
      setConfirmClose(false);
    } else {
      imageRevisionRef.current += 1;
      readingCountRef.current = 0;
      setReadingImages(false);
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    if (phase === "preview")
      document
        .getElementById("import-preview-summary")
        ?.focus({ preventScroll: true });
    if (phase === "input")
      document.getElementById("import-text")?.focus({ preventScroll: true });
    if (phase === "parsing")
      document
        .getElementById("import-cancel-parse")
        ?.focus({ preventScroll: true });
  }, [phase, open]);

  function addImages(files: File[]) {
    const revision = imageRevisionRef.current;
    readingCountRef.current += 1;
    setReadingImages(true);
    imageQueueRef.current = imageQueueRef.current
      .then(async () => {
        if (revision !== imageRevisionRef.current) return;
        try {
          if (imagesRef.current.length + files.length > MAX_IMPORT_IMAGES)
            throw new Error("一次最多添加 5 张图片，请先移除不需要的图片");
          let total = imagesRef.current.reduce(
            (sum, image) => sum + image.size,
            0,
          );
          for (const file of files) {
            if (!IMPORT_IMAGE_ACCEPT.split(",").includes(file.type))
              throw new Error("仅支持 PNG、JPG 和 WebP 图片");
            if (!file.size) throw new Error("图片为空，请重新选择");
            if (file.size > MAX_IMPORT_IMAGE_BYTES)
              throw new Error(`「${file.name}」超过 5 MB，请缩小后再添加`);
            total += file.size;
            if (total > MAX_IMPORT_TOTAL_BYTES)
              throw new Error("图片总大小不能超过 10 MB");
          }
          const added: ImportImageDraft[] = [];
          for (const file of files) {
            const dataUrl = await readImageFile(file);
            await new Promise<void>((resolve, reject) => {
              const preview = new Image();
              preview.onload = () => {
                preview.src = "";
                resolve();
              };
              preview.onerror = () =>
                reject(new Error(`无法读取「${file.name}」，请重新选择`));
              preview.src = dataUrl;
            });
            added.push({
              key: `image-${++keyRef.current}`,
              name:
                file.name ||
                `粘贴图片 ${imagesRef.current.length + added.length + 1}.png`,
              dataUrl,
              size: file.size,
            });
          }
          if (revision !== imageRevisionRef.current) return;
          imagesRef.current = [...imagesRef.current, ...added];
          setImages(imagesRef.current);
          setError(null);
        } catch (err) {
          if (revision === imageRevisionRef.current)
            setError((err as Error).message);
        }
      })
      .finally(() => {
        if (revision === imageRevisionRef.current) {
          readingCountRef.current -= 1;
          setReadingImages(readingCountRef.current > 0);
        }
      });
  }

  function pasteImages(event: ClipboardEvent<HTMLDivElement>) {
    if (phase !== "input") return;
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    event.preventDefault();
    const plainText = event.clipboardData.getData("text/plain");
    if (plainText) {
      const target = event.target;
      if (
        target instanceof HTMLTextAreaElement &&
        target.id === "import-text"
      ) {
        const start = target.selectionStart,
          end = target.selectionEnd;
        setText(
          (current) => current.slice(0, start) + plainText + current.slice(end),
        );
        requestAnimationFrame(() =>
          target.setSelectionRange(
            start + plainText.length,
            start + plainText.length,
          ),
        );
      } else
        setText((current) =>
          current ? `${current}\n${plainText}` : plainText,
        );
    }
    addImages(files);
  }

  function removeImage(key: string) {
    imagesRef.current = imagesRef.current.filter((image) => image.key !== key);
    setImages(imagesRef.current);
    setError(null);
  }

  function cancelParsing() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("input");
  }
  function reset() {
    abortRef.current?.abort();
    abortRef.current = null;
    const abandoned = draftRef.current;
    draftRef.current = null;
    uploadSignatureRef.current = "";
    if (abandoned) void apiFetch(`/api/imports/drafts?id=${encodeURIComponent(abandoned)}`, { method: "DELETE" }).catch(() => {});
    setText("");
    imageRevisionRef.current += 1;
    imagesRef.current = [];
    readingCountRef.current = 0;
    setImages([]);
    setReadingImages(false);
    setRows([]);
    setError(null);
    setPhase("input");
  }
  function requestClose() {
    if (phase === "committing") return;
    const hasContent = text.trim() || images.length || readingImages;
    const hasPreview = phase === "preview" && rows.length > 0;
    if (hasContent || hasPreview) { setConfirmClose(true); return; }
    if (phase === "parsing") cancelParsing();
    reset();
    onClose();
  }
  function discardImport() {
    setConfirmClose(false);
    if (phase === "parsing") cancelParsing();
    reset();
    onClose();
  }

  async function parse() {
    if (
      abortRef.current ||
      phase === "parsing" ||
      phase === "committing" ||
      readingCountRef.current > 0
    )
      return;
    if (!aiConfigured) { setError("任务自动识别暂不可用，可查看 AI 使用情况或手动新建任务。"); return; }
    const content = text.trim();
    if (!content && !images.length) {
      setError("请输入文字或添加图片");
      return;
    }
    if (content.length > MAX_TEXT) {
      setError(`内容超出 ${MAX_TEXT} 字上限`);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("parsing");
    setError(null);
    try {
      const signature = JSON.stringify([content, images.map(i => i.key)]);
      if (!draftRef.current || signature !== uploadSignatureRef.current) {
        const form = new FormData();
        form.set("text", content);
        for (const image of images) {
          const [prefix, encoded] = image.dataUrl.split(",");
          const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
          form.append("images", new Blob([bytes], { type: /^data:([^;]+)/.exec(prefix)?.[1] ?? "image/png" }), image.name);
        }
        const d = await apiFetch<{ draftId: string }>("/api/imports/drafts", { method: "POST", body: form, signal: controller.signal });
        if (controller.signal.aborted || abortRef.current !== controller) return;
        const previous = draftRef.current;
        draftRef.current = d.draftId;
        uploadSignatureRef.current = signature;
        commitIdRef.current = crypto.randomUUID();
        if (previous) void apiFetch(`/api/imports/drafts?id=${encodeURIComponent(previous)}`, { method: "DELETE" }).catch(() => {});
      }
      const result = await apiFetch<{ candidates: RawCandidate[]; provider: string | null; model: string | null }>("/api/ai/extract", { method: "POST", body: { draftId: draftRef.current }, signal: controller.signal });
      if (!result || !Array.isArray(result.candidates))
        throw new Error("解析结果无效，请重试");
      if (controller.signal.aborted || abortRef.current !== controller) return;
      keyRef.current += 1;
      setRows(
        result.candidates.map((candidate, index) => ({
          key: `c${keyRef.current}-${index}`,
          selected: true,
          title: candidate.title,
          notes: candidate.notes ?? "",
          priority: candidate.priority,
          projectId: projects.some(project => project.id === (candidate.projectId ?? defaultProjectId)) ? (candidate.projectId ?? defaultProjectId)! : "",
          dueAt: candidate.duePrecision === "datetime" ? candidate.dueAt : null,
          dueDate: candidate.dueDate,
          dueHint: candidate.dueHint,
          duePrecision: candidate.duePrecision,
          tags: candidate.tags,
          links: Array.isArray(candidate.links) ? candidate.links : [],
          expanded: false,
        })),
      );
      setPhase("preview");
    } catch (err) {
      if (controller.signal.aborted || abortRef.current !== controller) return;
      setError(
        err instanceof TypeError
          ? "网络连接中断，请检查后重试"
          : (err as Error).message,
      );
      setPhase("input");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function commit() {
    if (phase === "committing" || commitPendingRef.current) return;
    const selected = rows.filter(row => row.selected);
    const invalid = selected.find(row => !row.title.trim());
    if (invalid) { setError("请为已选择的任务填写标题，或取消选择该任务。"); document.getElementById(`${invalid.key}-title`)?.focus(); return; }
    if (!selected.length) {
      setError("请至少选择一条待办");
      return;
    }
    commitPendingRef.current = true;
    setPhase("committing");
    setError(null);
    try {
      const result = await apiFetch<{ created: number }>(
        "/api/ai/extract/commit",
        {
          method: "POST",
          body: {
            draftId: draftRef.current,
            clientMutationId: commitIdRef.current,
            items: selected.map((row) => ({
              title: row.title.trim(),
              notes: row.notes.trim() || null,
              priority: row.priority,
              dueAt: row.dueAt,
              projectId: row.projectId || null,
              tags: row.tags,
              links: row.links.map((link) => ({
                kind: link.kind,
                url: link.url,
                label: link.label,
              })),
            })),
          },
        },
      );
      toast.show({ message: `已加入 ${result.created} 条任务` });
      onCommitted?.();
      draftRef.current = null;
      reset();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setPhase("preview");
    } finally { commitPendingRef.current = false; }
  }
  function updateRow(key: string, patch: Partial<Candidate>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  const selectedRows = rows.filter(row => row.selected);
  const selectedCount = selectedRows.length;
  const invalidSelection = selectedRows.some(row => !row.title.trim());
  const withDue = selectedRows.filter(row => row.dueAt).length;
  const withLinks = selectedRows.filter(row => row.links.length).length;
  const preview = phase === "preview" || phase === "committing";
  const busy = phase === "parsing" || phase === "committing";
  const allSelected = rows.length > 0 && rows.every((row) => row.selected);

  return (
    <>
    <ConfirmDialog
      open={confirmClose}
      onOpenChange={setConfirmClose}
      title="放弃当前导入"
      description="已填写的内容、图片和未确认的任务将丢弃。任务列表不会发生变化。"
      confirmLabel="放弃并关闭"
      onConfirm={discardImport}
    />
    <Modal
      open={open}
      onClose={requestClose}
      maxWidth={800}
      closeDisabled={phase === "committing"}
      title={preview ? "确认待办" : "从内容创建任务"}
      footer={
        preview ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost mr-auto"
              onClick={() => {
                setError(null);
                setPhase("input");
              }}
              disabled={busy}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              修改内容
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={requestClose}
              disabled={busy}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={commit}
              disabled={busy || selectedCount === 0 || invalidSelection}
            >
              {busy ? (
                <LoaderCircle
                  size={17}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Plus size={17} aria-hidden="true" />
              )}
              {busy ? "正在加入…" : `加入 ${selectedCount} 条任务`}
            </button>
          </div>
        ) : (
          <div className="flex w-full flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={phase === "parsing" ? cancelParsing : requestClose}
            >
              {phase === "parsing" ? "取消解析" : "取消"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={parse}
              disabled={
                !aiConfigured ||
                busy ||
                readingImages ||
                (!text.trim() && !images.length) ||
                text.length > MAX_TEXT
              }
            >
              {busy ? (
                <LoaderCircle
                  size={17}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <ListChecks size={17} aria-hidden="true" />
              )}
              {busy ? "正在解析…" : "生成待办"}
            </button>
          </div>
        )
      }
    >
      <div
        className="space-y-5"
        aria-busy={busy || readingImages}
        onPaste={pasteImages}
      >
        <ol
          className="flex flex-wrap items-center gap-3 text-[13px]"
          aria-label="导入步骤"
        >
          <li
            className={`flex items-center gap-2 ${preview ? "text-muted" : "font-medium text-accent"}`}
            aria-current={preview ? undefined : "step"}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${preview ? "bg-sunken" : "bg-accent-soft"}`}
            >
              {preview ? <Check size={14} aria-hidden="true" /> : "1"}
            </span>
            添加文字或图片
          </li>
          <li aria-hidden="true" className="h-px w-8 bg-line" />
          <li
            className={`flex items-center gap-2 ${preview ? "font-medium text-accent" : "text-muted"}`}
            aria-current={preview ? "step" : undefined}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${preview ? "bg-accent-soft" : "bg-sunken"}`}
            >
              2
            </span>
            确认并加入
          </li>
        </ol>

        <ContentTransition stateKey={preview ? "preview" : "input"}>
          {!preview ? (
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="import-text">
                  邮件正文、需求或笔记（可选）
                </label>
                <p id="import-text-hint" className="section-description mb-3">
                  粘贴文字或截图，生成后可逐条修改标题、项目和时间。
                </p>
                <textarea
                  id="import-text"
                  className="field min-h-[220px] font-sans"
                  rows={9}
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setError(null);
                  }}
                  placeholder={
                    "例如：\n登录页面需要增加验证码，周五 18:00 前完成。\n查一下导出 CSV 中文乱码的问题，优先处理。"
                  }
                  disabled={busy}
                  data-autofocus
                  aria-describedby="import-text-hint import-text-count"
                  aria-invalid={text.length > MAX_TEXT}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span
                    id="import-text-count"
                    className={`text-[13px] ${text.length > MAX_TEXT ? "text-danger" : "text-muted"}`}
                  >
                    {text.length.toLocaleString()} / {MAX_TEXT.toLocaleString()}{" "}
                    字
                  </span>
                  {phase === "parsing" ? (
                    <button
                      id="import-cancel-parse"
                      type="button"
                      className="btn btn-ghost min-h-10"
                      onClick={cancelParsing}
                    >
                      取消解析
                    </button>
                  ) : null}
                </div>
              </div>
              <ImportImages
                images={images}
                busy={busy}
                reading={readingImages}
                onAdd={addImages}
                onRemove={removeImage}
              />
              <AnimatedCollapse open={phase === "parsing"} className="pt-4">
                <ImportPreviewSkeleton />
              </AnimatedCollapse>
              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-[13px]">
                {aiConfigured ? (
                  <FileText
                    size={18}
                    strokeWidth={1.75}
                    className="mt-0.5 shrink-0 text-muted"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertCircle
                    size={18}
                    strokeWidth={1.75}
                    className="mt-0.5 shrink-0 text-warn"
                    aria-hidden="true"
                  />
                )}
                {aiConfigured ? (
                  <div className="min-w-0 space-y-1 text-muted">
                    <p>内容将交给站点提供的 AI 服务识别。请确认可以分享这些内容。</p>
                    <p>生成结果需要你检查，点击「加入任务」后才会保存。</p>
                    {images.length ? <p>如图片无法识别，可改为粘贴文字。</p> : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-warn">
                      任务自动识别暂不可用。AI 服务由站点管理员管理，你可以查看使用情况，或先手动记录任务。
                    </p>
                    <div className="flex flex-wrap gap-2">
                    {onConfigureAi ? <button
                      type="button"
                      className="btn btn-secondary min-h-10"
                      disabled={busy}
                      onClick={onConfigureAi}
                    >
                      <Settings2 size={16} aria-hidden="true" />
                      查看 AI 使用情况
                    </button> : null}
                    <button type="button" className="btn btn-secondary min-h-10" onClick={() => { reset(); onClose(); actions.newTask(); }}>手动新建任务</button>
                    </div>
                  </div>
                )}
              </div>
              {error ? (
                <div className="rounded-xl border border-danger/20 p-4">
                  <p className="error-text" role="alert">
                    {error}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary mt-3 min-h-10"
                    onClick={parse}
                    disabled={
                      !aiConfigured ||
                      busy ||
                      readingImages ||
                      (!text.trim() && !images.length) ||
                      text.length > MAX_TEXT
                    }
                  >
                    重试解析
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div
                id="import-preview-summary"
                tabIndex={-1}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"
              >
                <div className="space-y-1">
                  <h3 className="section-title flex items-center gap-2">
                    <CheckSquare
                      size={18}
                      className="text-accent"
                      aria-hidden="true"
                    />
                    已选择 {selectedCount} / {rows.length} 条
                  </h3>
                  <p className="section-description">
                    {withDue ? `${withDue} 条包含截止时间。` : ""}
                    {withLinks ? `${withLinks} 条包含链接。` : ""}
                    检查内容后再加入任务列表。
                  </p>
                </div>
                {rows.length ? (
                  <button
                    type="button"
                    className="btn btn-secondary min-h-10"
                    disabled={busy}
                    onClick={() =>
                      setRows((current) =>
                        current.map((row) => ({
                          ...row,
                          selected: !allSelected,
                        })),
                      )
                    }
                  >
                    {allSelected ? "取消全选" : "全选"}
                  </button>
                ) : null}
              </div>
              <div className="space-y-4">
                {rows.map((row, index) => {
                  const status = dueStatusText(row, timeZone);
                  const warnDate =
                    row.duePrecision !== "none" && status.tone === "warn";
                  return (
                    <article
                      key={row.key}
                      className={`space-y-4 rounded-xl border bg-surface p-4 ${row.selected ? "border-line" : "border-dashed border-line"}`}
                      aria-label={`待办 ${index + 1}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex min-h-10 cursor-pointer items-center gap-3 text-[13px] font-medium">
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 accent-accent"
                            checked={row.selected}
                            disabled={busy}
                            onChange={(event) =>
                              updateRow(row.key, {
                                selected: event.target.checked,
                              })
                            }
                          />
                          <span>任务 {index + 1}</span>
                          <span
                            className={`status-pill ${row.selected ? "text-accent" : "text-muted"}`}
                          >
                            {row.selected ? "将加入" : "已排除"}
                          </span>
                        </label>
                        <button
                          type="button"
                          className="btn btn-ghost min-h-10"
                          disabled={busy}
                          onClick={() =>
                            updateRow(row.key, { expanded: !row.expanded })
                          }
                          aria-expanded={row.expanded}
                          aria-controls={`${row.key}-more`}
                        >
                          {row.expanded ? "收起" : "详情"}
                          {row.expanded ? (
                            <ChevronUp size={16} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={16} aria-hidden="true" />
                          )}
                        </button>
                      </div>
                      <div>
                        <label className="label" htmlFor={`${row.key}-title`}>
                          任务标题
                        </label>
                        <input
                          id={`${row.key}-title`}
                          className="field min-h-10 font-medium"
                          value={row.title}
                          disabled={busy}
                          onChange={(event) =>
                            updateRow(row.key, { title: event.target.value })
                          }
                          maxLength={300}
                          aria-invalid={row.selected && !row.title.trim()}
                        />
                        {row.selected && !row.title.trim() ? (
                          <p className="error-text mt-2">
                            请填写标题，或取消选择此任务。
                          </p>
                        ) : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            className="label"
                            htmlFor={`${row.key}-project`}
                          >
                            项目
                          </label>
                          <select
                            id={`${row.key}-project`}
                            className="field min-h-10"
                            value={row.projectId}
                            disabled={busy}
                            onChange={(event) =>
                              updateRow(row.key, {
                                projectId: event.target.value,
                              })
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
                        <div>
                          <label
                            className="label"
                            htmlFor={`${row.key}-priority`}
                          >
                            优先级
                          </label>
                          <select
                            id={`${row.key}-priority`}
                            className="field min-h-10"
                            value={row.priority}
                            disabled={busy}
                            onChange={(event) =>
                              updateRow(row.key, {
                                priority: event.target.value,
                              })
                            }
                          >
                            {Object.entries(PRIORITY_LABELS).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                      </div>
                      {row.links.length ? (
                        <div className="space-y-2 border-t border-line pt-3">
                          <p className="label mb-0">识别到的链接</p>
                          <ul className="space-y-2">
                            {row.links.map((link, linkIndex) => (
                              <li
                                key={`${link.url}-${linkIndex}`}
                                className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-sunken p-2 text-[13px]"
                              >
                                <span className="status-pill shrink-0">
                                  {LINK_KIND_LABELS[link.kind] ?? "链接"}
                                </span>
                                {/^(https?:\/\/)/i.test(link.url) ? <a
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
                                    size={13}
                                    className="shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span className="sr-only">
                                    （在新标签页打开）
                                  </span>
                                </a> : <span className="min-w-0 flex-1 truncate font-mono" title={link.url}>{link.label || link.url}</span>}
                                <button
                                  type="button"
                                  className="icon-button h-8 w-8 shrink-0"
                                  disabled={busy}
                                  aria-label={`移除链接 ${link.url}`}
                                  onClick={() =>
                                    updateRow(row.key, {
                                      links: row.links.filter(
                                        (_item, index) => index !== linkIndex,
                                      ),
                                    })
                                  }
                                >
                                  <X size={14} aria-hidden="true" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className="space-y-3 border-t border-line pt-3">
                        <p
                          className={`flex items-start gap-2 text-[13px] leading-relaxed ${status.tone === "warn" ? "text-warn" : "text-muted"}`}
                        >
                          {status.tone === "warn" ? (
                            <AlertCircle
                              size={16}
                              className="mt-0.5 shrink-0"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span>{status.text}</span>
                        </p>
                        {warnDate ? (
                          <div>
                            <label className="label" htmlFor={`${row.key}-due`}>
                              确认截止时间
                            </label>
                            <DateTimeField
                              id={`${row.key}-due`}
                              value={row.dueAt}
                              onChange={(iso) =>
                                updateRow(row.key, { dueAt: iso })
                              }
                              timeZone={timeZone}
                              disabled={busy}
                              allowRange={false}
                            />
                          </div>
                        ) : null}
                      </div>
                      <AnimatedCollapse open={row.expanded}>
                        <div
                          id={`${row.key}-more`}
                          className="space-y-4 border-t border-line pt-4"
                        >
                          <div>
                            <label
                              className="label"
                              htmlFor={`${row.key}-notes`}
                            >
                              描述
                            </label>
                            <textarea
                              id={`${row.key}-notes`}
                              className="field"
                              rows={3}
                              maxLength={20000}
                              value={row.notes}
                              disabled={busy}
                              onChange={(event) =>
                                updateRow(row.key, {
                                  notes: event.target.value,
                                })
                              }
                              placeholder="补充任务背景或步骤"
                            />
                          </div>
                          {!warnDate ? (
                            <div>
                              <label
                                className="label"
                                htmlFor={`${row.key}-due-edit`}
                              >
                                截止时间
                              </label>
                              <DateTimeField
                                id={`${row.key}-due-edit`}
                                value={row.dueAt}
                                onChange={(iso) =>
                                  updateRow(row.key, { dueAt: iso })
                                }
                                timeZone={timeZone}
                                disabled={busy}
                                allowRange={false}
                              />
                            </div>
                          ) : null}
                          {row.tags.length ? (
                            <div className="flex flex-wrap items-center gap-2 text-[13px]">
                              <span className="text-muted">标签</span>
                              {row.tags.map((tag, tagIndex) => (
                                <span
                                  key={`${tag}-${tagIndex}`}
                                  className="status-pill max-w-full break-all"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </AnimatedCollapse>
                    </article>
                  );
                })}
              </div>
              {!rows.length ? (
                <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center">
                  <ListChecks
                    size={28}
                    strokeWidth={1.5}
                    className="mx-auto mb-3 text-muted"
                    aria-hidden="true"
                  />
                  <p className="text-[14px] font-medium">没有找到明确的待办</p>
                  <p className="section-description mt-2">
                    返回原文补充具体事项，或手动创建任务。
                  </p>
                  <button type="button" className="btn btn-secondary mt-4" onClick={() => { reset(); onClose(); actions.newTask(); }}>手动新建任务</button>
                </div>
              ) : null}
              {error ? (
                <p
                  className="error-text rounded-xl border border-danger/20 p-4"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </ContentTransition>
      </div>
    </Modal>
    </>
  );
}

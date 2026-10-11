"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Check, Folder, Pencil, Plus } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Modal } from "@/components/Dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/Toast";

export type ProjectRow = {
  id: string;
  name: string;
  repoUrl: string | null;
  color: string | null;
  archived: boolean;
  openCount: number;
  revision?: number;
};
type ProjectResponse = { id: string; name: string; repoUrl: string | null; color: string | null; archivedAt: string | null; revision: number };
type Draft = { id?: string; name: string; repoUrl: string; color: string | null; revision?: number };
const COLORS = [
  { value: "#1D4ED8", label: "蓝色" },
  { value: "#0F766E", label: "绿色" },
  { value: "#B45309", label: "橙色" },
  { value: "#B42318", label: "红色" },
  { value: "#6D28D9", label: "紫色" },
  { value: "#4B5563", label: "灰色" },
];

export function ProjectsManager({ initial, loadError }: { initial: ProjectRow[]; loadError?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [original, setOriginal] = useState<Draft | null>(null);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<ProjectRow | null>(null);
  const [discard, setDiscard] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => { setRows(initial); }, [initial]);
  const dirty = !!draft && !!original && (draft.name !== original.name || draft.repoUrl !== original.repoUrl || draft.color !== original.color);

  function openEditor(row?: ProjectRow) {
    const next = row ? { id: row.id, name: row.name, repoUrl: row.repoUrl ?? "", color: row.color, revision: row.revision } : { name: "", repoUrl: "", color: COLORS[0].value };
    setDraft(next); setOriginal(next); setFormError(null);
  }
  function closeEditor() {
    if (pending) return;
    if (dirty) { setDiscard(true); return; }
    setDraft(null); setFormError(null);
  }

  function mergeProject(project: ProjectResponse) {
    setRows(current => {
      const existing = current.find(row => row.id === project.id);
      const row: ProjectRow = { id: project.id, name: project.name, repoUrl: project.repoUrl, color: project.color, revision: project.revision, archived: !!project.archivedAt, openCount: existing?.openCount ?? 0 };
      return existing ? current.map(item => item.id === row.id ? row : item) : [...current, row];
    });
    router.refresh();
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || pending) return;
    setFormError(null);
    if (!draft.name.trim()) { setFormError("请输入项目名称。"); event.currentTarget.querySelector<HTMLInputElement>('[name="name"]')?.focus(); return; }
    if (!event.currentTarget.reportValidity()) return;
    if (draft.repoUrl.trim()) {
      try { new URL(draft.repoUrl.trim()); }
      catch { setFormError("请输入完整仓库 URL，例如 https://github.com/user/repo。"); return; }
    }
    setPending(true);
    try {
      const result = await apiFetch<{ project: ProjectResponse }>(draft.id ? `/api/projects/${draft.id}` : "/api/projects", {
        method: draft.id ? "PATCH" : "POST",
        body: { name: draft.name.trim(), repoUrl: draft.repoUrl.trim() || null, color: draft.color, ...(draft.id && draft.revision !== undefined ? { expectedRevision: draft.revision } : {}) },
      });
      mergeProject(result.project);
      const text = draft.id ? "项目修改已保存。" : "项目已创建。";
      setDraft(null); setOriginal(null); setMessage(text); setListError(null);
      toast.show({ message: text });
    } catch (err) { setFormError((err as Error).message); }
    finally { setPending(false); }
  }

  async function toggleArchive(row: ProjectRow) {
    if (busyId || pending) return;
    setArchiving(null);
    setBusyId(row.id); setListError(null); setMessage(null);
    try {
      const result = await apiFetch<{ project: ProjectResponse }>(`/api/projects/${row.id}`, { method: "PATCH", body: { archived: !row.archived, ...(row.revision !== undefined ? { expectedRevision: row.revision } : {}) } });
      mergeProject(result.project);
      const text = row.archived ? `“${row.name}”已恢复，任务可以继续编辑和接收提醒。` : `“${row.name}”已归档，可随时恢复。`;
      setMessage(text);
      toast.show({ message: text });
    } catch (err) {
      const text = (err as Error).message;
      setListError(text); toast.show({ message: text, tone: "error" });
    } finally { setBusyId(null); }
  }

  const active = rows.filter(row => !row.archived);
  const archived = rows.filter(row => row.archived);
  function renderRows(items: ProjectRow[]) {
    return <ul className="mt-4 divide-y divide-line border-t border-line">{items.map(row => <li key={row.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center" aria-busy={busyId === row.id}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-sunken" style={{ color: row.color ?? "var(--muted)" }}><Folder size={18} aria-hidden="true" /></span>
        <div className="min-w-0"><p className="break-words text-sm font-medium">{row.name}</p><div className="mt-1 flex flex-wrap items-center gap-2"><span className="hint">{row.openCount} 条未完成任务</span>{row.archived && <span className="status-pill">已归档 · 任务只读</span>}</div>{row.repoUrl && <p className="hint mt-1 break-all">{row.repoUrl}</p>}</div>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        <button type="button" className="btn btn-secondary flex-1 sm:flex-none" onClick={() => openEditor(row)} disabled={busyId !== null || pending} aria-label={`编辑项目：${row.name}`}><Pencil size={15} aria-hidden="true" />编辑</button>
        <button type="button" className="btn btn-secondary flex-1 sm:flex-none" disabled={busyId !== null || pending} onClick={() => row.archived ? void toggleArchive(row) : setArchiving(row)} aria-label={`${row.archived ? "恢复" : "归档"}项目：${row.name}`}>{row.archived ? <ArchiveRestore size={15} aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}{busyId === row.id ? row.archived ? "恢复中…" : "归档中…" : row.archived ? "恢复" : "归档"}</button>
      </div>
    </li>)}</ul>;
  }

  return (
    <>
      <section className="settings-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="section-title">项目管理</h2><p className="hint mt-1">按项目组织任务。通过编辑保存名称、仓库地址和颜色。</p></div><button type="button" className="btn btn-primary w-full sm:w-auto" onClick={() => openEditor()} disabled={!!loadError || busyId !== null || pending}><Plus size={16} aria-hidden="true" />添加项目</button></div>
        {listError && <div className="mt-4"><p className="error-text" role="alert">{listError}</p><button type="button" className="btn btn-secondary mt-2" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}>{refreshing ? "刷新中…" : "刷新项目列表"}</button></div>}
        {message && <p className="mt-4 text-sm text-accent" role="status">{message}</p>}
        {loadError ? <div className="mt-5 rounded-lg border border-line p-4"><p className="error-text" role="alert">{loadError}</p><button type="button" className="btn btn-secondary mt-3" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}>{refreshing ? "加载中…" : "重新加载"}</button></div> : rows.length === 0 ? (
          <div className="mt-5 flex flex-col items-center rounded-lg border border-dashed border-line px-4 py-9 text-center"><Folder size={28} strokeWidth={1.5} className="text-muted" aria-hidden="true" /><p className="mt-3 text-sm font-medium">还没有项目</p><p className="hint mt-1">为一组相关任务创建项目；暂时不分类的任务可放在收件箱。</p><button type="button" className="btn btn-secondary mt-4" onClick={() => openEditor()}><Plus size={16} aria-hidden="true" />创建第一个项目</button></div>
        ) : <>
          <h3 className="mt-6 text-sm font-medium">使用中 <span className="text-muted">({active.length})</span></h3>
          {active.length ? renderRows(active) : <p className="hint mt-3 rounded-lg border border-dashed border-line p-4">暂无使用中的项目。可以添加项目，或恢复下方已归档的项目。</p>}
          {archived.length > 0 && <div className="mt-6"><h3 className="text-sm font-medium">已归档 <span className="text-muted">({archived.length})</span></h3><p className="hint mt-1">任务保留为只读，暂停提醒。恢复后可继续编辑和接收提醒。</p>{renderRows(archived)}</div>}
        </>}
      </section>
      <Modal open={draft !== null} onClose={closeEditor} title={draft?.id ? "编辑项目" : "添加项目"} closeDisabled={pending} footer={<div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn btn-secondary flex-1 sm:flex-none" disabled={pending} onClick={closeEditor}>取消</button><button type="submit" form="project-editor" className="btn btn-primary flex-1 sm:flex-none" disabled={pending || (!!draft?.id && !dirty)}>{pending ? "保存中…" : draft?.id ? "保存修改" : "创建项目"}</button></div>}>
        {draft && <form id="project-editor" onSubmit={save} noValidate aria-busy={pending}>
          <fieldset disabled={pending} className="min-w-0 space-y-5">
            <div><label className="label" htmlFor="project-name">项目名称</label><input autoFocus id="project-name" name="name" className="field" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="例如：网站改版" maxLength={100} required /></div>
            <div><label className="label" htmlFor="project-repo">仓库地址（选填）</label><input id="project-repo" name="repoUrl" type="url" className="field" value={draft.repoUrl} onChange={e => setDraft({ ...draft, repoUrl: e.target.value })} placeholder="https://github.com/user/repo" autoCapitalize="none" spellCheck={false} aria-describedby="project-repo-hint" /><p id="project-repo-hint" className="hint mt-1">使用完整 URL；留空可移除仓库地址。</p></div>
            <div><span className="label">项目颜色</span><div className="flex flex-wrap gap-2" role="group" aria-label="项目颜色">
              <button type="button" onClick={() => setDraft({ ...draft, color: null })} aria-pressed={draft.color === null} className="choice-chip h-10">无颜色</button>
              {COLORS.map(({ value, label }) => <button key={value} type="button" onClick={() => setDraft({ ...draft, color: value })} aria-label={label} title={label} aria-pressed={draft.color?.toLowerCase() === value.toLowerCase()} className={`flex h-10 w-10 items-center justify-center rounded-lg border ${draft.color?.toLowerCase() === value.toLowerCase() ? "border-accent bg-accent-soft" : "border-line hover:bg-sunken"}`}><span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: value }}>{draft.color?.toLowerCase() === value.toLowerCase() && <Check size={14} className="text-white" strokeWidth={2.5} aria-hidden="true" />}</span></button>)}
            </div><div className="mt-3 flex flex-wrap items-center gap-3"><label className="hint" htmlFor="project-custom-color">自选颜色</label><input id="project-custom-color" type="color" className="h-10 w-12 cursor-pointer rounded border border-line bg-surface p-1" value={draft.color ?? COLORS[0].value} onChange={e => setDraft({ ...draft, color: e.target.value })} /><span className="hint">{draft.color ?? "未设置"}</span></div></div>
          </fieldset>
          {formError && <p className="error-text mt-4" role="alert">{formError}</p>}
        </form>}
      </Modal>
      <ConfirmDialog open={discard} onOpenChange={setDiscard} title="放弃项目修改？" description="当前填写的修改尚未保存，关闭后会丢失。" confirmLabel="放弃修改" onConfirm={() => { setDiscard(false); setDraft(null); setOriginal(null); setFormError(null); }} />
      <ConfirmDialog open={archiving !== null} onOpenChange={open => { if (!open) setArchiving(null); }} title="归档项目？" description={`“${archiving?.name ?? ""}”及其任务会从日常任务列表隐藏，任务将变为只读并暂停提醒。${archiving?.openCount ? `项目还有 ${archiving.openCount} 条未完成任务。` : ""}数据会保留，可随时恢复。`} confirmLabel="归档项目" onConfirm={() => archiving ? toggleArchive(archiving) : undefined} />
    </>
  );
}

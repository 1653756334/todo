"use client";

import { useMemo, useState } from "react";
import { Copy, Plus, Search, UsersRound } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Modal } from "@/components/Dialog";
import { Select } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/Toast";

type UserRow = {
  id: string; username: string; displayName: string; role: string; status: string;
  accountEmail?: string | null; aiDailyQuotaOverride: number | null;
};
const STATUS: Record<string, string> = { ACTIVE: "正常", PENDING: "待验证", DISABLED: "已停用" };

export function UsersPanel({ initial, currentUserId, verificationRequired = false, smtpReady = false, defaultQuota = 50 }: {
  initial: UserRow[]; currentUserId: string; verificationRequired?: boolean; smtpReady?: boolean; defaultQuota?: number;
}) {
  const toast = useToast();
  const [users, setUsers] = useState(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [role, setRole] = useState("USER");
  const [quotaMode, setQuotaMode] = useState("default");
  const [quota, setQuota] = useState("");
  const [editError, setEditError] = useState("");
  const [statusTarget, setStatusTarget] = useState<UserRow | null>(null);
  const [tokenForm, setTokenForm] = useState<{ action: "invite" | "reset"; user?: UserRow } | null>(null);
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState("link");
  const [tokenResult, setTokenResult] = useState<{ url?: string; sent?: boolean } | null>(null);
  const [tokenError, setTokenError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<"edit" | "token" | "status" | null>(null);
  const activeAdmins = users.filter(user => user.role === "ADMIN" && user.status === "ACTIVE").length;
  const lastAdmin = !!editing && editing.role === "ADMIN" && editing.status === "ACTIVE" && activeAdmins === 1 && role !== "ADMIN";
  const quotaValue = quotaMode === "default" ? null : Number(quota);
  const editDirty = !!editing && (role !== editing.role || quotaValue !== editing.aiDailyQuotaOverride);
  const filtered = useMemo(() => users.filter(user => {
    const term = query.trim().toLowerCase();
    return (!term || `${user.displayName} ${user.username} ${user.accountEmail ?? ""}`.toLowerCase().includes(term)) && (filter === "all" || user.status === filter);
  }), [users, query, filter]);

  function edit(user: UserRow) {
    setEditing(user); setRole(user.role); setQuotaMode(user.aiDailyQuotaOverride === null ? "default" : "custom");
    setQuota(String(user.aiDailyQuotaOverride ?? defaultQuota)); setEditError("");
  }
  function openToken(action: "invite" | "reset", user?: UserRow) {
    setTokenForm({ action, user }); setEmail(user?.accountEmail ?? ""); setDelivery("link");
    setTokenResult(null); setTokenError(""); setCopied(false);
  }
  async function update(user: UserRow, values: Record<string, unknown>) {
    await apiFetch("/api/admin/users", { method: "PATCH", body: { id: user.id, ...values } });
    setUsers(current => current.map(item => item.id === user.id ? { ...item, ...values } as UserRow : item));
    if (user.id === currentUserId) window.location.href = "/login?next=%2Fadmin";
  }
  async function saveUser(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || pending || !editDirty || lastAdmin) return;
    setPending("edit"); setEditError("");
    try {
      const values: Record<string, unknown> = {};
      if (role !== editing.role) values.role = role;
      if (quotaValue !== editing.aiDailyQuotaOverride) values.aiDailyQuotaOverride = quotaValue;
      await update(editing, values);
      setEditing(null); toast.show({ message: "用户设置已保存。" });
    } catch (err) { setEditError((err as Error).message); }
    finally { setPending(null); }
  }
  async function changeStatus() {
    if (!statusTarget || pending) return;
    setPending("status");
    try {
      const restoring = statusTarget.status === "DISABLED";
      await update(statusTarget, { status: restoring ? "ACTIVE" : "DISABLED" });
      toast.show({ message: restoring ? "账号已恢复。" : "账号已停用。" });
    } finally { setPending(null); }
  }
  async function createLink(event: React.FormEvent) {
    event.preventDefault();
    if (!tokenForm || pending) return;
    setPending("token"); setTokenError("");
    try {
      const result = await apiFetch<{ url?: string; sent?: boolean }>("/api/admin/users", {
        method: "POST", body: { action: tokenForm.action, ...(tokenForm.user ? { userId: tokenForm.user.id } : {}), email: email.trim() || null, sendEmail: delivery === "email" },
      });
      setTokenResult(result);
    } catch (err) { setTokenError((err as Error).message); }
    finally { setPending(null); }
  }
  async function copyLink() {
    if (!tokenResult?.url) return;
    try { await navigator.clipboard.writeText(tokenResult.url); setCopied(true); }
    catch { setTokenError("无法自动复制，请选中下方链接手动复制。"); }
  }

  return (
    <section className="settings-card">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="section-title">用户管理 <span className="ml-1 text-sm font-normal text-muted">{users.length} 人</span></h2>
          <p className="section-description mt-1">管理账号权限与 AI 额度。用户的私人任务和来源内容仅本人可见。</p>
        </div>
        <button type="button" className="btn btn-primary" disabled={!!pending} onClick={() => openToken("invite")}><Plus size={16} aria-hidden="true" />邀请用户</button>
      </header>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <label className="sr-only" htmlFor="admin-user-search">搜索用户</label>
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-muted" aria-hidden="true" />
          <input id="admin-user-search" type="search" className="field !pl-9" placeholder="搜索姓名、用户名或邮箱" value={query} onChange={event => setQuery(event.target.value)} />
        </div>
        <div className="sm:w-36"><Select label="筛选账号状态" value={filter} onValueChange={setFilter} options={[{ value: "all", label: "全部状态" }, { value: "ACTIVE", label: "正常" }, { value: "PENDING", label: "待验证" }, { value: "DISABLED", label: "已停用" }]} /></div>
      </div>
      <div className="mt-5 divide-y divide-line">
        {filtered.map(user => {
          const self = user.id === currentUserId;
          const protectedAdmin = user.role === "ADMIN" && user.status === "ACTIVE" && activeAdmins === 1;
          return (
            <article key={user.id} className="flex flex-col gap-4 py-5 first:pt-0 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><UsersRound size={18} aria-hidden="true" /></span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-all font-medium">{user.displayName}</p>
                    {self && <span className="status-pill">你</span>}
                    <span className={`status-pill ${user.status === "ACTIVE" ? "is-ok" : user.status === "PENDING" ? "is-warn" : "is-danger"}`}>{STATUS[user.status] ?? user.status}</span>
                  </div>
                  <p className="mt-1 break-all text-sm text-muted">@{user.username}{user.accountEmail ? ` · ${user.accountEmail}` : ""}</p>
                  <p className="mt-1 text-xs text-muted">{user.role === "ADMIN" ? "管理员" : "普通用户"} · AI 每日 {user.aiDailyQuotaOverride === null ? `${defaultQuota} 次（站点默认）` : `${user.aiDailyQuotaOverride} 次`}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <button type="button" className="btn btn-secondary btn-sm" disabled={!!pending} onClick={() => edit(user)}>编辑权限与额度</button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={!!pending || user.status !== "ACTIVE"} onClick={() => openToken("reset", user)}>重置密码</button>
                <button type="button" className={`btn btn-sm ${user.status === "DISABLED" ? "btn-secondary" : "btn-danger"}`} disabled={!!pending || self || protectedAdmin} title={self ? "不能停用当前登录账号" : protectedAdmin ? "需要保留至少一名可用管理员" : undefined} onClick={() => setStatusTarget(user)}>{user.status === "DISABLED" ? "恢复账号" : "停用账号"}</button>
              </div>
            </article>
          );
        })}
        {filtered.length === 0 && <div className="py-12 text-center"><UsersRound size={28} className="mx-auto text-muted" aria-hidden="true" /><p className="mt-3 font-medium">没有符合条件的用户</p><p className="hint mt-1">换一个关键词或清除筛选后再试。</p><button type="button" className="btn btn-secondary mt-4" onClick={() => { setQuery(""); setFilter("all"); }}>清除筛选</button></div>}
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`编辑用户 · ${editing?.displayName ?? ""}`} closeDisabled={pending === "edit"}>
        <form onSubmit={saveUser}>
          <p className="hint mb-5">@{editing?.username} · {STATUS[editing?.status ?? ""]}</p>
          <fieldset disabled={pending === "edit"} className="min-w-0 space-y-5">
            <div><span className="label">账号角色</span><Select label="账号角色" value={role} onValueChange={setRole} options={[{ value: "USER", label: "普通用户" }, { value: "ADMIN", label: "管理员" }]} /><p className="hint mt-2">管理员可管理全站配置与账号，请只授予需要此权限的人。</p></div>
            <div>
              <span className="label">每日 AI 额度</span>
              <Select label="AI 额度设置方式" value={quotaMode} onValueChange={setQuotaMode} options={[{ value: "default", label: `跟随站点默认（${defaultQuota} 次 / 天）` }, { value: "custom", label: "单独设置" }]} />
              {quotaMode === "custom" && <div className="mt-3"><label className="label" htmlFor="admin-user-quota">每日可使用次数</label><input id="admin-user-quota" type="number" className="field" min={0} max={100000} step={1} required value={quota} onChange={event => setQuota(event.target.value)} /><p className="hint mt-2">设为 0 会暂停该用户的 AI 提取。</p></div>}
            </div>
          </fieldset>
          <p className="hint mt-5">保存修改后，该用户的已有登录会话会失效，需要重新登录。</p>
          {editing?.id === currentUserId && role === "USER" && !lastAdmin && <p className="error-text mt-3">你将失去管理员权限，保存后会退出后台。</p>}
          {lastAdmin && <p className="error-text mt-3" role="alert">需要保留至少一名可用管理员，请先将另一位正常用户设为管理员。</p>}
          {editError && <p className="error-text mt-3" role="alert">{editError}</p>}
          <div className="form-actions justify-end"><button type="button" className="btn btn-secondary" disabled={pending === "edit"} onClick={() => setEditing(null)}>取消</button><button className="btn btn-primary" disabled={!!pending || !editDirty || lastAdmin}>{pending === "edit" ? "保存中…" : editing?.id === currentUserId ? "保存并重新登录" : "保存修改"}</button></div>
        </form>
      </Modal>
      <Modal open={!!tokenForm} onClose={() => setTokenForm(null)} title={tokenForm?.action === "reset" ? `重置密码 · ${tokenForm.user?.displayName}` : "邀请新用户"} closeDisabled={pending === "token"}>
        {tokenResult ? <div>
          <p className="text-sm font-medium text-ok" role="status">{tokenResult.sent ? `邮件已发送至 ${email}` : tokenForm?.action === "reset" ? "重置链接已生成" : "邀请链接已生成"}</p>
          <p className="hint mt-2">{tokenForm?.action === "reset" ? "链接 1 小时内有效，用户设置新密码后需要重新登录。" : "链接 7 天内有效，只能使用一次，请交给受邀用户。"}</p>
          {tokenResult.url && <div className="mt-5"><label className="label" htmlFor="admin-onetime-link">{tokenForm?.action === "reset" ? "密码重置链接" : "邀请链接"}</label><textarea id="admin-onetime-link" className="field break-all" rows={3} readOnly value={tokenResult.url} onFocus={event => event.target.select()} /><button type="button" className="btn btn-secondary mt-3" onClick={() => void copyLink()}><Copy size={15} aria-hidden="true" />{copied ? "已复制" : "复制链接"}</button></div>}
          {tokenError && <p className="error-text mt-3" role="alert">{tokenError}</p>}
          <div className="form-actions justify-end"><button type="button" className="btn btn-primary" onClick={() => setTokenForm(null)}>完成</button></div>
        </div> : <form onSubmit={createLink}>
          <p className="hint">{tokenForm?.action === "reset" ? "生成一次性链接，由用户自行设置新密码。生成链接不会立即改变当前密码。" : "用户通过邀请链接创建自己的账号，无需你替他们设置密码。"}</p>
          <fieldset disabled={pending === "token"} className="mt-5 min-w-0 space-y-5">
            <div><span className="label">发送方式</span><Select label="邀请或重置链接发送方式" value={delivery} onValueChange={setDelivery} options={[{ value: "link", label: "生成链接，手动分享" }, ...(smtpReady ? [{ value: "email", label: "直接发送邮件" }] : [])]} />{!smtpReady && <p className="hint mt-2">配置邮件服务后，也可以直接发送邮件。</p>}</div>
            <div><label className="label" htmlFor="admin-invite-email">{tokenForm?.action === "reset" ? "收件邮箱" : "受邀人邮箱"}{delivery === "email" || verificationRequired && tokenForm?.action === "invite" ? "（必填）" : "（选填）"}</label><input id="admin-invite-email" className="field" type="email" autoComplete="email" placeholder="name@example.com" required={delivery === "email" || verificationRequired && tokenForm?.action === "invite"} value={email} onChange={event => setEmail(event.target.value)} /><p className="hint mt-2">{tokenForm?.action === "invite" ? verificationRequired ? "本站要求新账号验证邮箱，请填写受邀用户的真实邮箱。" : "填写后，新账号会绑定此邮箱并完成邮箱验证。留空可直接创建账号。" : "选择手动分享时可留空。"}</p></div>
          </fieldset>
          {tokenError && <p className="error-text mt-4" role="alert">{tokenError}</p>}
          <div className="form-actions justify-end"><button type="button" className="btn btn-secondary" disabled={!!pending} onClick={() => setTokenForm(null)}>取消</button><button className="btn btn-primary" disabled={!!pending}>{pending === "token" ? "处理中…" : delivery === "email" ? "发送邮件" : tokenForm?.action === "reset" ? "生成重置链接" : "生成邀请链接"}</button></div>
        </form>}
      </Modal>
      <ConfirmDialog open={!!statusTarget} onOpenChange={value => { if (!value) setStatusTarget(null); }} title={statusTarget?.status === "DISABLED" ? "恢复账号" : "停用账号"} description={statusTarget?.status === "DISABLED" ? `恢复「${statusTarget.displayName}」后，该用户可以重新登录。原有任务和设置会保留。` : `停用「${statusTarget?.displayName}」后，该用户将立即退出且无法登录。原有任务和设置会保留，之后可恢复。`} confirmLabel={statusTarget?.status === "DISABLED" ? "恢复账号" : "停用账号"} destructive={statusTarget?.status !== "DISABLED"} onConfirm={changeStatus} />
    </section>
  );
}

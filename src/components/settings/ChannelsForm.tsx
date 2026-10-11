"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, Plus, Webhook } from "lucide-react";
import { Field, Modal } from "@/components/Dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { useToast } from "@/components/Toast";
import { Switch, Select } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SecretField, type SecretPatch } from "@/components/settings/SecretField";
import { apiFetch } from "@/lib/client";
import { channelSchema } from "@/shared/settings";

type Channel = {
  id: string;
  type: string;
  label: string;
  enabled: boolean;
  minPriority: string;
  brief: boolean;
  email: string | null;
  verifiedAt: string | null;
  revision: number;
  webhookConfigured: boolean;
  signSecretConfigured: boolean;
  lastErrorCode: string | null;
};
type Feedback = { error: boolean; text: string };
type Busy = { kind: "save" | "delete" | "verify" | "test" | "refresh"; id?: string };
const PRIORITIES = [
  { value: "low", label: "全部优先级" },
  { value: "normal", label: "普通及高优先级" },
  { value: "high", label: "仅高优先级" },
];
const secretValue = (patch: SecretPatch) =>
  patch.action === "clear" ? null : patch.action === "set" ? patch.value : undefined;

export function ChannelsForm({ initial, type, allowed, smtpReady }: {
  initial: Channel[];
  type: "EMAIL" | "WEBHOOK";
  allowed: boolean;
  smtpReady: boolean;
}) {
  const { show } = useToast();
  const isEmail = type === "EMAIL";
  const [channels, setChannels] = useState(initial);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [visible, setVisible] = useState(false);
  const [deleting, setDeleting] = useState<Channel | null>(null);
  const [label, setLabel] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [webhook, setWebhook] = useState<SecretPatch>({ action: "keep" });
  const [secret, setSecret] = useState<SecretPatch>({ action: "keep" });
  const [signOpen, setSignOpen] = useState(false);
  const [min, setMin] = useState("low");
  const [brief, setBrief] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [busy, setBusy] = useState<Busy | null>(null);
  const locked = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const formId = `channel-${type.toLowerCase()}`;

  useEffect(() => {
    if (visible || busy || !opener.current) return;
    const trigger = opener.current;
    const frame = requestAnimationFrame(() => {
      if (trigger.isConnected && !trigger.matches(":disabled")) trigger.focus();
      opener.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, busy]);

  function begin(operation: Busy) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(operation);
    return true;
  }
  function finish() {
    locked.current = false;
    setBusy(null);
  }
  function clearError(field: string) {
    setErrors(current => ({ ...current, [field]: "" }));
    setSaveError("");
  }
  function edit(channel: Channel | null) {
    if (locked.current) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(channel);
    setLabel(channel?.label ?? (isEmail ? "我的邮箱" : "团队机器人"));
    setEnabled(channel?.enabled ?? (allowed && (!isEmail || smtpReady)));
    setEmail(channel?.email ?? "");
    setWebhook({ action: "keep" });
    setSecret({ action: "keep" });
    setSignOpen(!!channel?.signSecretConfigured);
    setMin(channel?.minPriority ?? "low");
    setBrief(channel?.brief ?? !isEmail);
    setErrors({});
    setSaveError("");
    setVisible(true);
  }
  function close() {
    if (locked.current) return;
    setVisible(false);
    setWebhook({ action: "keep" });
    setSecret({ action: "keep" });
    setSignOpen(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    const nextErrors: Record<string, string> = {};
    const address = webhook.action === "set" ? (webhook.value ?? "").trim() : "";
    const hasSavedAddress = !!editing?.webhookConfigured && webhook.action === "keep";
    const clearingAddress = !!editing && webhook.action === "clear";
    if (!label.trim()) nextErrors.label = "请填写渠道名称，方便识别通知去向。";
    if (isEmail) {
      if (!email.trim()) nextErrors.email = "请填写接收通知的邮箱。";
      else if (!channelSchema.shape.email.safeParse(email.trim()).success)
        nextErrors.email = "请输入有效的邮箱地址，例如 name@example.com。";
    } else if (!hasSavedAddress && !clearingAddress) {
      if (!address) nextErrors.webhook = "请填写机器人的完整 Webhook 地址。";
      else {
        try {
          const url = new URL(address);
          if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
            throw new Error("invalid");
        } catch {
          nextErrors.webhook = "请填写完整的 HTTP 或 HTTPS 地址，且不要包含用户名或密码。";
        }
      }
    }
    if (address.length > 1000) nextErrors.webhook = "Webhook 地址不能超过 1000 个字符，请确认复制的是完整地址。";
    if (secret.action === "set" && !secret.value)
      nextErrors.signSecret = "请输入加签密钥，或取消替换以保持原配置。";
    setErrors(nextErrors);
    setSaveError("");
    if (Object.keys(nextErrors).length) {
      const field = Object.keys(nextErrors)[0];
      document.getElementById(`${formId}-${field}`)?.focus();
      return;
    }
    if (!begin({ kind: "save" })) return;
    try {
      const result = await apiFetch<{ channel: Channel }>("/api/settings/channels", {
        method: "PUT",
        body: {
          ...(editing ? { id: editing.id, expectedRevision: editing.revision } : {}),
          type, label: label.trim(), enabled: clearingAddress ? false : enabled,
          minPriority: min, brief,
          ...(isEmail ? { email: email.trim() } : {
            ...(webhook.action !== "keep" ? { webhook: webhook.action === "set" ? address : null } : {}),
            ...(secret.action !== "keep" ? { signSecret: secretValue(secret) } : {}),
          }),
        },
      });
      setChannels(current => editing
        ? current.map(channel => channel.id === editing.id ? result.channel : channel)
        : [...current, result.channel]);
      setFeedback(current => ({ ...current, [result.channel.id]: {
        error: false,
        text: isEmail && !result.channel.verifiedAt
          ? "已保存。请验证收件邮箱，验证完成后才能接收自动提醒。"
          : "已保存，可发送测试消息检查是否能收到通知。",
      } }));
      setVisible(false);
      setWebhook({ action: "keep" });
      setSecret({ action: "keep" });
      show({ message: editing ? "通知渠道已更新" : "通知渠道已添加" });
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      finish();
    }
  }

  async function action(channel: Channel, kind: "verify" | "test" | "refresh") {
    if (!begin({ kind, id: channel.id })) return;
    setFeedback(current => ({ ...current, [channel.id]: { error: false, text: "" } }));
    try {
      let text: string;
      if (kind === "refresh") {
        const result = await apiFetch<{ channels: Channel[] }>("/api/settings/channels");
        setChannels(result.channels.filter(item => item.type === type));
        text = result.channels.find(item => item.id === channel.id)?.verifiedAt
          ? "邮箱已验证，可以接收自动提醒。"
          : "尚未完成验证，请打开验证邮件中的链接后再刷新。";
      } else {
        await apiFetch("/api/settings/channels/test", {
          method: "POST", body: { id: channel.id, action: kind },
        });
        text = kind === "verify"
          ? "验证邮件已发送，请检查收件箱和垃圾邮件，打开邮件中的链接后刷新验证状态。"
          : isEmail ? "测试邮件已发送，请检查收件箱和垃圾邮件。" : "测试消息已发送，请到机器人所在的会话查看。";
        if (kind === "test") setChannels(current => current.map(item =>
          item.id === channel.id ? { ...item, lastErrorCode: null } : item));
      }
      setFeedback(current => ({ ...current, [channel.id]: { error: false, text } }));
      show({ message: kind === "verify" ? "验证邮件已发送" : kind === "test" ? "测试消息已发送" : "验证状态已刷新" });
    } catch (error) {
      setFeedback(current => ({ ...current, [channel.id]: { error: true, text: (error as Error).message } }));
    } finally {
      finish();
    }
  }

  async function remove(channel: Channel) {
    if (!begin({ kind: "delete", id: channel.id })) return;
    try {
      await apiFetch("/api/settings/channels", { method: "DELETE", body: { id: channel.id } });
      setChannels(current => current.filter(item => item.id !== channel.id));
      show({ message: "通知渠道已删除" });
    } catch (error) {
      setFeedback(current => ({ ...current, [channel.id]: { error: true, text: (error as Error).message } }));
      throw error;
    } finally {
      finish();
    }
  }

  return (
    <section className="settings-card">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="section-title">{isEmail ? "个人邮件通知" : "群机器人与 Webhook 通知"}</h2>
          <p className="hint mt-1">{isEmail
            ? "添加收件邮箱并完成验证，即可接收任务提醒。发件服务由站点管理员提供。"
            : "支持企业微信、钉钉、飞书机器人和兼容的 Webhook 服务。每个渠道可以独立设置通知范围。"}</p>
        </div>
        {(type === "WEBHOOK" || channels.length === 0) && <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => edit(null)}>
          <Plus size={16} aria-hidden="true" />{isEmail ? "添加邮箱" : "添加 Webhook"}
        </button>}
      </header>
      {(!allowed || (isEmail && !smtpReady)) && (
        <div className="mt-4 rounded-lg border border-line bg-sunken p-3 text-sm" role="status">
          {!allowed && <p>管理员已暂停{isEmail ? "邮件" : "Webhook"}通知。你仍可管理配置，恢复开放后再启用。</p>}
          {isEmail && !smtpReady && <p className={!allowed ? "mt-2" : ""}>站点邮件服务尚未就绪，暂时无法验证邮箱或发送测试邮件。可先保存邮箱，联系管理员配置邮件服务。</p>}
        </div>
      )}
      {!channels.length ? (
        <div className="mt-5 rounded-lg border border-dashed border-line px-4 py-8 text-center">
          {isEmail ? <Mail className="mx-auto text-muted" size={24} aria-hidden="true" /> : <Webhook className="mx-auto text-muted" size={24} aria-hidden="true" />}
          <p className="mt-3 text-sm font-medium">{isEmail ? "还没有收件邮箱" : "还没有 Webhook 渠道"}</p>
          <p className="hint mx-auto mt-2 max-w-md">{isEmail
            ? "点击「添加邮箱」填写通知去向。验证邮箱后，可以先发送一封测试邮件。"
            : "先在机器人或通知服务中复制 Webhook 地址，再点击「添加 Webhook」。如机器人启用了加签，也请准备好密钥。"}</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {channels.map(channel => {
            const testBlocked = !allowed ? "站点已暂停此类通知，暂时无法测试。"
              : isEmail && !smtpReady ? "邮件服务就绪后才能发送测试邮件。"
              : isEmail && !channel.email ? "请先编辑并填写收件邮箱。"
              : !isEmail && !channel.webhookConfigured ? "请先编辑并填写 Webhook 地址。" : "";
            const active = channel.enabled && allowed && (!isEmail || (smtpReady && !!channel.verifiedAt)) && (isEmail ? !!channel.email : channel.webhookConfigured);
            const stateLabel = !channel.enabled ? "已关闭" : !allowed ? "站点已暂停"
              : isEmail && !smtpReady ? "等待邮件服务" : isEmail && !channel.verifiedAt ? "待验证邮箱"
              : !isEmail && !channel.webhookConfigured ? "待填写地址" : "已启用";
            const notice = feedback[channel.id];
            return (
              <article key={channel.id} className="min-w-0 rounded-lg border border-line p-4" aria-label={channel.label} aria-busy={busy?.id === channel.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words font-medium">{channel.label}</h3>
                      <span className={`status-pill ${active ? "is-ok" : ""}`}>{stateLabel}</span>
                    </div>
                    <p className="mt-2 break-all text-sm text-muted">{isEmail ? channel.email ?? "未填写邮箱" : channel.webhookConfigured ? "Webhook 地址已保存，内容不回显" : "尚未配置 Webhook 地址"}</p>
                    <p className="hint mt-1">{PRIORITIES.find(item => item.value === channel.minPriority)?.label ?? "全部优先级"} · {channel.brief ? "简略通知" : "包含任务正文"}{!isEmail && channel.signSecretConfigured ? " · 已配置加签" : ""}{isEmail && channel.verifiedAt ? " · 邮箱已验证" : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => edit(channel)}>编辑</button>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy || !!testBlocked} title={testBlocked || undefined} onClick={() => void action(channel, "test")}>
                      {busy?.kind === "test" && busy.id === channel.id ? "发送中…" : isEmail ? "发送测试邮件" : "发送测试消息"}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm text-danger" disabled={!!busy} onClick={() => setDeleting(channel)}>{busy?.kind === "delete" && busy.id === channel.id ? "删除中…" : "删除"}</button>
                  </div>
                </div>
                {isEmail && channel.email && !channel.verifiedAt && (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="hint">自动提醒需要先验证邮箱。测试邮件只检查投递，不会完成邮箱验证。</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy || !smtpReady} onClick={() => void action(channel, "verify")}>{busy?.kind === "verify" && busy.id === channel.id ? "发送中…" : "发送验证邮件"}</button>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void action(channel, "refresh")}>{busy?.kind === "refresh" && busy.id === channel.id ? "刷新中…" : "刷新验证状态"}</button>
                    </div>
                  </div>
                )}
                {testBlocked ? <p className="hint mt-3">{testBlocked}</p> : !channel.enabled ? <p className="hint mt-3">渠道已关闭，仍可发送测试消息；开启后才会接收自动提醒。</p> : null}
                {channel.lastErrorCode && !notice?.text && <p className="error-text mt-3">最近一次投递未成功。请检查地址和凭据，再发送测试消息。</p>}
                {notice?.text && <p className={`${notice.error ? "error-text" : "hint"} mt-3 break-words`} role={notice.error ? "alert" : "status"}>{notice.text}</p>}
              </article>
            );
          })}
        </div>
      )}
      <p className="hint mt-4">保存配置不会发送消息。测试与邮箱验证需手动操作；任务提醒还需在任务中开启，并设置截止时间。</p>
      <Modal open={visible} onClose={close} closeDisabled={!!busy} title={`${editing ? "编辑" : "添加"}${isEmail ? "邮件通知" : " Webhook 渠道"}`} footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={close}>取消</button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={!!busy}>{busy?.kind === "save" ? "保存中…" : "保存渠道"}</button>
        </div>
      }>
        <form id={formId} onSubmit={save} noValidate aria-busy={busy?.kind === "save"}>
          <fieldset disabled={!!busy} className="min-w-0 space-y-5">
            <div>
              <h3 className="text-sm font-semibold">连接信息</h3>
              <p className="hint mt-1">{isEmail ? "填写你希望接收任务提醒的邮箱。更换地址后需重新验证。" : "地址和密钥会加密保存，已保存的内容不会显示。仅使用你信任的通知服务。"}</p>
              <div className="mt-4">
                <Field label="渠道名称（必填）" htmlFor={`${formId}-label`} error={errors.label}>
                  <input id={`${formId}-label`} className="field" value={label} maxLength={80} required placeholder={isEmail ? "例如：工作邮箱" : "例如：项目提醒机器人"} aria-invalid={!!errors.label} aria-describedby={errors.label ? `${formId}-label-error` : undefined} onChange={event => { setLabel(event.target.value); clearError("label"); }} />
                </Field>
                {isEmail ? (
                  <Field label="收件邮箱（必填）" htmlFor={`${formId}-email`} error={errors.email}>
                    <input id={`${formId}-email`} className="field" type="email" autoComplete="email" inputMode="email" required value={email} placeholder="name@example.com" aria-invalid={!!errors.email} aria-describedby={errors.email ? `${formId}-email-error` : undefined} onChange={event => { setEmail(event.target.value); clearError("email"); }} />
                  </Field>
                ) : <>
                  <SecretField id={`${formId}-webhook`} label="Webhook 地址（必填）" configured={!!editing?.webhookConfigured} patch={webhook} onChange={patch => { setWebhook(patch); clearError("webhook"); }} placeholder="https://…/webhook/…" error={errors.webhook} hint={webhook.action === "clear" ? "保存后将清除地址并关闭此渠道。重新填写地址后可再次启用。" : "粘贴机器人提供的完整 HTTP(S) 地址。留在「已保存」状态会保留原地址。"} />
                  <Disclosure className="mt-4 rounded-lg border border-line p-3" title={<>加签设置（选填）{editing?.signSecretConfigured ? " · 已配置" : ""}</>} open={signOpen} onOpenChange={setSignOpen}>
                    <SecretField id={`${formId}-signSecret`} label="加签密钥" configured={!!editing?.signSecretConfigured} patch={secret} onChange={patch => { setSecret(patch); clearError("signSecret"); }} placeholder="粘贴机器人提供的加签密钥" error={errors.signSecret} hint="机器人启用了加签时再填写；关闭加签后请清除原密钥。" />
                  </Disclosure>
                </>}
              </div>
            </div>
            <div className="space-y-4 border-t border-line pt-5">
              <h3 className="text-sm font-semibold">通知选项</h3>
              <div>
                <Switch label="启用自动任务提醒" checked={enabled && webhook.action !== "clear"} onCheckedChange={setEnabled} disabled={webhook.action === "clear" || (!enabled && (!allowed || (isEmail && !smtpReady)))} />
                <p className="hint mt-2">{!allowed ? "站点已暂停此类通知，配置仍可保存。" : isEmail && !smtpReady ? "邮件服务就绪后可启用。" : isEmail ? "保存并验证邮箱后生效，也可以先关闭并测试配置。" : "启用后，符合下方优先级条件的任务会向此渠道发送提醒。"}</p>
              </div>
              <div>
                <span className="label">最低任务优先级</span>
                <Select label="最低任务优先级" value={min} onValueChange={setMin} options={PRIORITIES} disabled={!!busy} />
              </div>
              <div>
                <Switch label="使用简略通知" checked={brief} onCheckedChange={setBrief} disabled={!!busy} />
                <p className="hint mt-2">开启后只提示有任务待处理，不附任务正文，适合群聊等多人可见的渠道。</p>
              </div>
            </div>
          </fieldset>
          {saveError && <p className="error-text mt-4 break-words" role="alert">{saveError}</p>}
        </form>
      </Modal>
      <ConfirmDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }} title="删除通知渠道" description={`确定删除「${deleting?.label ?? ""}」？未发送的通知将取消，已保存的地址和密钥将被删除。此操作无法撤销。`} confirmLabel="删除渠道" destructive onConfirm={() => deleting ? remove(deleting) : undefined} />
    </section>
  );
}

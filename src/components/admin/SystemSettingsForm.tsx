"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle, Save } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client";
import { Switch, Select } from "@/components/ui/controls";
import { SecretField, type SecretPatch } from "@/components/settings/SecretField";
import { Disclosure } from "@/components/ui/disclosure";

export type SettingsValue = Record<string, string | number | boolean | null>;
type Group = "smtp" | "ai" | "policy";
type FieldSpec = { key: string; label: string; hint?: string; placeholder?: string; type?: string; min?: number; max?: number };
const FIELDS: Record<Group, FieldSpec[]> = {
  smtp: [
    { key: "host", label: "SMTP 服务器", placeholder: "例如 smtp.example.com" },
    { key: "port", label: "端口", type: "number", min: 1, max: 65535, hint: "STARTTLS 通常用 587，TLS 通常用 465。" },
    { key: "user", label: "登录用户名", placeholder: "通常为完整邮箱地址" },
    { key: "fromName", label: "发件人名称", placeholder: "例如 Todo 提醒" },
    { key: "fromAddress", label: "发件邮箱", type: "email", placeholder: "todo@example.com", hint: "需要是邮件服务允许发送的邮箱。" },
  ],
  ai: [
    { key: "baseUrl", label: "API 服务地址", type: "url", placeholder: "https://api.example.com/v1", hint: "填写兼容 OpenAI API 的服务地址。" },
    { key: "model", label: "模型名称", placeholder: "填写服务提供商给出的模型 ID" },
    { key: "dailyQuota", label: "每人每日默认额度", type: "number", min: 0, max: 100000, hint: "按 UTC 每日重置；0 表示不允许调用。可在用户管理中单独调整。" },
    { key: "concurrency", label: "同时处理的请求数", type: "number", min: 1, max: 20, hint: "整个站点共享，范围为 1–20。" },
  ],
  policy: [
    { key: "reminderGraceHours", label: "恢复服务后的补发范围", type: "number", min: 0, max: 168, hint: "补发多少小时内错过的提醒，0 表示不补发，最多 7 天。" },
  ],
};
const DESCRIPTIONS: Record<Group, string> = {
  smtp: "配置全站邮件发送，用于任务提醒、邮箱验证和找回密码。用户在个人设置中选择自己的收件邮箱。",
  ai: "配置从文字和图片提取任务的 AI 服务，再决定开放范围和使用额度。",
  policy: "设置账号注册方式，以及全站可使用的任务通知类型。",
};

export function SystemSettingsForm({ group, title, initial, initialRevision }: {
  group: Group; title: string; initial: SettingsValue; initialRevision: number;
}) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [revision, setRevision] = useState(initialRevision);
  const [secret, setSecret] = useState<SecretPatch>({ action: "keep" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [conflict, setConflict] = useState(false);
  const secretKey = group === "smtp" ? "pass" : group === "ai" ? "apiKey" : null;
  const dirty = JSON.stringify(values) !== JSON.stringify(saved) || secret.action !== "keep";
  const busy = pending || testing;
  const set = (key: string, value: string | number | boolean | null) => {
    setValues(old => ({ ...old, [key]: value }));
    setMessage("");
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function reload() {
    setPending(true);
    setError("");
    try {
      const result = await apiFetch<{ value: SettingsValue; revision: number }>(`/api/settings?group=${group}`);
      setValues(result.value); setSaved(result.value); setRevision(result.revision);
      setSecret({ action: "keep" }); setConflict(false); setMessage("已加载最新配置。");
    } catch (err) { setError((err as Error).message); }
    finally { setPending(false); }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !dirty) return;
    setPending(true); setError(""); setMessage(""); setConflict(false);
    try {
      const value = { ...values };
      delete value.passConfigured; delete value.apiKeyConfigured;
      for (const field of FIELDS[group]) if (field.type === "number") value[field.key] = Number(value[field.key]);
      for (const key of ["host", "user", "fromName", "fromAddress", "baseUrl", "model"]) if (typeof value[key] === "string") value[key] = value[key].trim();
      if (secretKey) {
        delete value[secretKey];
        if (secret.action === "set") value[secretKey] = secret.value ?? "";
        if (secret.action === "clear") value[secretKey] = null;
      }
      await apiFetch("/api/settings", { method: "PUT", body: { group, value, expectedRevision: revision } });
      const next = { ...value };
      if (secretKey) {
        next[`${secretKey}Configured`] = secret.action === "keep" ? !!saved[`${secretKey}Configured`] : secret.action === "set" && !!secret.value;
        delete next[secretKey];
      }
      setValues(next); setSaved(next); setRevision(revision === 0 ? 1 : revision + 1);
      setSecret({ action: "keep" }); setMessage("配置已保存。");
    } catch (err) {
      setError((err as Error).message);
      setConflict(err instanceof ApiError && err.status === 409);
    } finally { setPending(false); }
  }

  async function test() {
    if (busy || dirty) return;
    setTesting(true); setError(""); setMessage("");
    try {
      const result = await apiFetch<{ model: string; elapsedMs: number }>("/api/settings/ai/test", { method: "POST" });
      setMessage(`连接成功：${result.model}，耗时 ${(result.elapsedMs / 1000).toFixed(1)} 秒。`);
    } catch (err) { setError((err as Error).message); }
    finally { setTesting(false); }
  }

  function field(spec: FieldSpec) {
    const required = spec.type === "number" || group === "ai" && !!values.enabled && ["baseUrl", "model"].includes(spec.key) || group === "smtp" && !!(values.host || values.fromAddress) && ["host", "fromAddress"].includes(spec.key);
    const id = `admin-${group}-${spec.key}`;
    return (
      <div key={spec.key}>
        <label className="label" htmlFor={id}>{spec.label}{required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}</label>
        <input id={id} className="field" value={String(values[spec.key] ?? "")} type={spec.type ?? "text"} min={spec.min} max={spec.max} step={spec.type === "number" ? 1 : undefined} required={required} maxLength={spec.type === "number" ? undefined : spec.key === "model" ? 150 : spec.key === "fromName" ? 80 : 2000} placeholder={spec.placeholder} autoComplete="off" aria-describedby={spec.hint ? `${id}-hint` : undefined} onChange={event => set(spec.key, event.target.value)} />
        {spec.hint && <p id={`${id}-hint`} className="hint mt-2">{spec.hint}</p>}
      </div>
    );
  }

  return (
    <form className="settings-card" onSubmit={save} aria-busy={busy}>
      <h2 className="section-title">{title}</h2>
      <p className="section-description mt-1">{DESCRIPTIONS[group]}</p>
      <fieldset disabled={busy} className="mt-5 min-w-0 space-y-5">
        {group === "ai" && <div className="space-y-5 border-b border-line pb-5">
          <Switch label="启用 AI 提取" description="开启后，管理员可以从粘贴内容和截图生成任务草稿。" checked={!!values.enabled} onCheckedChange={value => set("enabled", value)} />
          <Switch label="向普通用户开放" description={values.enabled ? "普通用户在自己的额度内使用同一项服务。" : "先启用 AI 服务，再设置是否向普通用户开放。"} checked={!!values.publicEnabled} disabled={!values.enabled} onCheckedChange={value => set("publicEnabled", value)} />
        </div>}
        {group === "policy" && <>
          <div className="space-y-5">
            <h3 className="text-sm font-semibold">账号注册</h3>
            <Switch label="允许自行注册" description="关闭时，新用户需要管理员提供邀请链接。" checked={!!values.registrationEnabled} onCheckedChange={value => set("registrationEnabled", value)} />
            <div className="sm:max-w-md">
              <span className="label">新账号邮箱验证</span>
              <Select label="新账号邮箱验证" value={String(values.verification)} onValueChange={value => set("verification", value)} options={[{ value: "off", label: "无需验证，邮箱可选" }, { value: "on_signup", label: "必须验证邮箱后使用" }]} />
              <p className="hint mt-2">要求验证前，请先配置好邮件服务。邀请账号也遵循此设置。</p>
            </div>
          </div>
          <div className="space-y-5 border-t border-line pt-5">
            <h3 className="text-sm font-semibold">任务通知</h3>
            <Switch label="允许邮件提醒" description="暂停时保留用户的邮箱配置，重新开启后恢复投递。" checked={!!values.emailAllowed} onCheckedChange={value => set("emailAllowed", value)} />
            <Switch label="允许群机器人提醒" description="支持企业微信、钉钉和飞书等 Webhook 渠道。" checked={!!values.webhookAllowed} onCheckedChange={value => set("webhookAllowed", value)} />
          </div>
        </>}
        <div className="grid gap-5 sm:grid-cols-2">{FIELDS[group].map(field)}</div>
        {group === "smtp" && <div className="sm:max-w-md">
          <span className="label">传输加密</span>
          <Select label="SMTP 传输加密" value={String(values.encryption)} onValueChange={value => set("encryption", value)} options={[{ value: "starttls", label: "STARTTLS（通常使用端口 587）" }, { value: "tls", label: "TLS（通常使用端口 465）" }, { value: "none", label: "不加密（仅可信本地服务）" }]} />
        </div>}
        {secretKey && <SecretField key={secretKey} id={`admin-${secretKey}`} label={group === "smtp" ? "SMTP 密码 / 授权码" : "API 密钥"} configured={!!saved[`${secretKey}Configured`]} patch={secret} onChange={setSecret} hint={group === "smtp" ? "部分邮箱需要填写授权码。替换或清除后，点击保存配置才会生效。" : "从服务提供商处获取。已保存的密钥不会显示，替换或清除后需要保存配置。"} />}
        {group === "ai" && <Disclosure className="rounded-lg border border-line p-4" title="高级连接选项">
          <div className="mt-4"><Switch label="允许连接内部网络地址" description="仅在使用自己部署的内网模型服务时开启。" checked={!!values.allowPrivateEndpoint} onCheckedChange={value => set("allowPrivateEndpoint", value)} /></div>
        </Disclosure>}
      </fieldset>
      {error && <div className="mt-5 rounded-lg border border-danger/20 bg-danger/5 p-3" role="alert">
        <p className="error-text">{error}</p>
        {conflict && <button type="button" disabled={busy} className="btn btn-secondary btn-sm mt-3" onClick={() => void reload()}>放弃本次修改并加载最新配置</button>}
      </div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={!dirty || busy}><Save size={15} aria-hidden="true" />{pending ? "保存中…" : "保存配置"}</button>
        {dirty && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setValues(saved); setSecret({ action: "keep" }); setError(""); setMessage(""); }}>撤销修改</button>}
        {group === "ai" && <button type="button" className="btn btn-secondary" disabled={busy || dirty || !saved.enabled} onClick={() => void test()}>{testing && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}{testing ? "测试中…" : "测试连接"}</button>}
        <span className="text-sm text-muted" role="status">{dirty ? "有未保存的修改" : message && <span className="inline-flex items-center gap-1.5 text-ok"><CheckCircle2 size={15} aria-hidden="true" />{message}</span>}</span>
      </div>
      {group === "ai" && dirty && <p className="hint mt-3">请先保存配置，再测试连接。</p>}
      {group === "smtp" && <p className="hint mt-4">保存后，到<Link className="text-accent hover:underline" href="/settings/email">个人邮件通知</Link>配置并验证收件邮箱，即可发送测试邮件。</p>}
    </form>
  );
}

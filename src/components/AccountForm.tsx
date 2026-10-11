"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { passwordSchema, usernameSchema } from "@/shared/accounts";

type Props = {
  token?: string;
  purpose?: string;
  tokenError?: string;
  registrationEnabled: boolean;
  emailRequired?: boolean;
  initialMode?: "forgot" | "register";
};

export function AccountForm({ token, purpose, tokenError, registrationEnabled, emailRequired = false, initialMode = "forgot" }: Props) {
  const [mode, setMode] = useState<"token" | "register" | "forgot">(token ? "token" : initialMode === "register" && registrationEnabled ? "register" : "forgot");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const needIdentity = mode === "register" || (mode === "token" && purpose === "INVITE");
  const needPassword = needIdentity || (mode === "token" && purpose === "RESET");
  const title = mode === "register" ? "创建账号" : mode === "forgot" ? "找回密码" : purpose === "INVITE" ? "接受邀请" : purpose === "RESET" ? "设置新密码" : purpose === "VERIFY_CHANNEL" ? "验证通知邮箱" : "验证账号邮箱";
  const action = mode === "register" ? "创建账号" : mode === "forgot" ? "发送找回邮件" : purpose === "INVITE" ? "创建受邀账号" : purpose === "RESET" ? "保存新密码" : "确认验证";

  function fail(text: string, field: string) {
    setError(text);
    formRef.current?.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || message || tokenError) return;
    setError("");
    let normalizedUsername = username;
    if (needIdentity) {
      const result = usernameSchema.safeParse(username);
      if (!result.success) { fail(result.error.issues[0].message, "username"); return; }
      normalizedUsername = result.data;
    }
    if (mode !== "token" && (email.trim() || mode === "forgot" || emailRequired)) {
      const input = formRef.current?.querySelector<HTMLInputElement>('[name="email"]');
      if (!email.trim() || !input?.validity.valid) { fail("请输入有效的邮箱地址", "email"); return; }
    }
    if (needPassword) {
      const result = passwordSchema.safeParse(password);
      if (!result.success) { fail("密码需为 10–256 个字符", "password"); return; }
      if (password !== confirmation) { fail("两次输入的密码不一致", "confirmation"); return; }
    }
    setPending(true);
    try {
      const endpoint = mode === "token" ? "token" : mode === "register" ? "register" : "forgot";
      const body = mode === "token"
        ? { token, ...(needIdentity ? { username: normalizedUsername, displayName: displayName.trim() || normalizedUsername } : {}), ...(needPassword ? { password } : {}) }
        : mode === "register"
          ? { username: normalizedUsername, displayName: displayName.trim() || normalizedUsername, password, email: email.trim() || null }
          : { email: email.trim() };
      const result = await apiFetch<{ verificationRequired?: boolean; message?: string }>(`/api/auth/${endpoint}`, { method: "POST", body });
      setPassword("");
      setConfirmation("");
      setMessage(result.message ?? (result.verificationRequired ? "账号已创建。请查看邮箱，打开验证链接后再登录。" : mode === "register" || purpose === "INVITE" ? "账号已创建，现在可以登录。" : purpose === "RESET" ? "密码已更新，所有设备需要使用新密码重新登录。" : purpose === "VERIFY_CHANNEL" ? "通知邮箱已验证，可以返回设置继续使用。" : "账号邮箱已验证，请重新登录。"));
    } catch (err) { setError((err as Error).message); }
    finally { setPending(false); }
  }

  function switchMode() {
    setMode(mode === "register" ? "forgot" : "register");
    setError(""); setMessage(""); setPassword(""); setConfirmation(""); setVisible(false);
  }

  return (
    <form method="post" ref={formRef} className="login-card w-full max-w-[440px]" onSubmit={submit} noValidate aria-busy={pending}>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="hint mt-2">{mode === "forgot" ? "填写绑定的账号邮箱。我们会发送验证或重置密码链接。" : mode === "register" ? "创建自己的任务空间，用户名用于登录。" : purpose === "INVITE" ? "设置用户名和密码，完成邀请。" : purpose === "RESET" ? "设置新密码后，所有设备的登录状态都会失效。" : "确认后即可完成邮箱验证。链接只能使用一次。"}</p>
      {tokenError ? <p className="error-text mt-5" role="alert">{tokenError}</p> : message ? (
        <div className="mt-6 rounded-lg border border-line bg-sunken p-4" role="status">
          <CircleCheck size={22} className="mb-3 text-accent" aria-hidden="true" />
          <p className="text-sm leading-relaxed">{message}</p>
          {mode === "forgot" && <p className="hint mt-2">未收到邮件？检查垃圾邮件，或联系管理员确认绑定邮箱。</p>}
        </div>
      ) : (
        <>
          <fieldset disabled={pending} className="mt-5 min-w-0 space-y-4">
            {needIdentity && <>
              <div><label className="label" htmlFor="account-username">用户名</label><input autoFocus id="account-username" name="username" className="field" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={40} value={username} onChange={e => setUsername(e.target.value)} required aria-describedby="username-hint" /><p id="username-hint" className="hint mt-1">3–40 位英文字母、数字、点、横线或下划线，需以字母或数字开头。</p></div>
              <div><label className="label" htmlFor="account-name">显示名称（选填）</label><input id="account-name" name="displayName" className="field" autoComplete="nickname" maxLength={80} placeholder="留空时使用用户名" value={displayName} onChange={e => setDisplayName(e.target.value)} /></div>
            </>}
            {mode !== "token" && <div><label className="label" htmlFor="account-email">账号邮箱{mode === "register" && !emailRequired ? "（选填）" : ""}</label><input autoFocus={mode === "forgot"} id="account-email" name="email" type="email" className="field" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required={mode === "forgot" || emailRequired} /><p className="hint mt-1">{mode === "register" ? emailRequired ? "注册后需要通过邮箱验证才能登录。" : "用于找回密码，之后可在账号设置中验证。" : "未绑定邮箱时，请联系管理员协助恢复账号。"}</p></div>}
            {needPassword && <>
              <div><label className="label" htmlFor="account-password">{mode === "token" && purpose === "RESET" ? "新密码" : "密码"}</label><div className="relative"><input autoFocus={purpose === "RESET"} id="account-password" name="password" type={visible ? "text" : "password"} className="field !pr-12" autoComplete="new-password" minLength={10} maxLength={256} value={password} onChange={e => setPassword(e.target.value)} required aria-describedby="password-hint" /><button type="button" className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded text-muted hover:bg-sunken" aria-label={visible ? "隐藏密码" : "显示密码"} aria-pressed={visible} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><p id="password-hint" className="hint mt-1">至少 10 个字符，最多 256 个字符。</p></div>
              <div><label className="label" htmlFor="account-confirmation">确认密码</label><input id="account-confirmation" name="confirmation" type={visible ? "text" : "password"} className="field" autoComplete="new-password" maxLength={256} value={confirmation} onChange={e => setConfirmation(e.target.value)} required /></div>
            </>}
          </fieldset>
          {error && <p className="error-text mt-4" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary mt-5 w-full" disabled={pending}>{pending ? <><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />正在处理…</> : action}</button>
        </>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href="/login" className={message || tokenError ? "btn btn-primary w-full" : "btn btn-ghost"}>返回登录</Link>
        {!token && !message && registrationEnabled && <button className="btn btn-ghost" type="button" disabled={pending} onClick={switchMode}>{mode === "register" ? "找回密码" : "创建账号"}</button>}
        {tokenError && <Link href="/account?mode=forgot" className="btn btn-ghost w-full">重新申请验证或找回邮件</Link>}
      </div>
    </form>
  );
}

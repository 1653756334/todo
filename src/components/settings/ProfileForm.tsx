"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, KeyRound, Mail, UserRound } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { passwordSchema } from "@/shared/accounts";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/Toast";

type Profile = {
  username: string;
  displayName: string;
  accountEmail: string | null;
  accountEmailVerifiedAt: string | null;
  role: string;
};

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const toast = useToast();
  const [savedName, setSavedName] = useState(profile.displayName);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [email, setEmail] = useState(profile.accountEmail ?? "");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verifyEmail, setVerifyEmail] = useState(false);
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState<"profile" | "password" | null>(null);
  const [confirmPassword, setConfirmPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordForm = useRef<HTMLFormElement>(null);
  const emailPasswordRef = useRef<HTMLInputElement>(null);

  const emailChanged = email.trim() !== (pendingEmail ?? profile.accountEmail ?? "");
  const emailAction = emailChanged || verifyEmail;
  const verified = Boolean(profile.accountEmailVerifiedAt);
  const dirty = displayName.trim() !== savedName || emailAction;

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !dirty) return;
    setMessage(null);
    setError(null);
    if (!event.currentTarget.reportValidity()) return;
    if (!displayName.trim()) { setError("显示名称不能为空。"); return; }
    if (emailAction && !email.trim()) { setError("暂不支持解除已绑定的邮箱。请填写新邮箱或取消修改。"); return; }
    if (emailAction && !emailPassword) {
      setError("修改或验证邮箱前，请输入当前密码。");
      emailPasswordRef.current?.focus();
      return;
    }
    setPending("profile");
    try {
      const body: Record<string, unknown> = {};
      if (displayName.trim() !== savedName) body.displayName = displayName.trim();
      if (emailAction) { body.email = email.trim(); body.currentPassword = emailPassword; }
      const result = await apiFetch<{ verificationRequired?: boolean }>("/api/auth/profile", { method: "PUT", body });
      setSavedName(displayName.trim());
      setDisplayName(displayName.trim());
      setEmail(email.trim());
      setEmailPassword("");
      setVerifyEmail(false);
      if (result.verificationRequired) setPendingEmail(email.trim());
      const text = result.verificationRequired ? "资料已保存，验证邮件已发送。打开新邮箱里的链接后，绑定邮箱才会更新。" : "账号资料已保存。";
      setMessage(text);
      toast.show({ message: text });
      router.refresh();
    } catch (err) { setError((err as Error).message); }
    finally { setPending(null); }
  }

  function requestPasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPasswordError(null);
    if (!event.currentTarget.reportValidity()) return;
    if (!passwordSchema.safeParse(newPassword).success) { setPasswordError("新密码需为 10–256 个字符。"); return; }
    if (newPassword !== confirmation) {
      setPasswordError("两次输入的新密码不一致。");
      passwordForm.current?.querySelector<HTMLInputElement>('[name="confirmation"]')?.focus();
      return;
    }
    if (newPassword === currentPassword) { setPasswordError("新密码不能与当前密码相同。"); return; }
    setConfirmPassword(true);
  }

  async function savePassword() {
    setConfirmPassword(false);
    if (pending) return;
    setPending("password");
    setPasswordError(null);
    try {
      await apiFetch("/api/auth/profile", { method: "PUT", body: { currentPassword, newPassword } });
      setCurrentPassword(""); setNewPassword(""); setConfirmation("");
      window.location.assign("/login?reason=password-changed");
    } catch (err) {
      setPasswordError((err as Error).message);
      setPending(null);
    }
  }

  return (
    <>
      <section className="settings-card">
        <h2 className="section-title">账号资料</h2>
        <p className="hint mt-1 break-words">用户名 <span className="font-medium text-ink">{profile.username}</span> 用于登录；显示名称用于界面展示。</p>
        <form method="post" className="mt-4 space-y-4" onSubmit={saveProfile} noValidate aria-busy={pending === "profile"}>
          <fieldset disabled={pending !== null} className="min-w-0 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="profile-displayName"><UserRound size={14} aria-hidden="true" className="mr-1 inline" />显示名称</label><input id="profile-displayName" name="displayName" className="field" autoComplete="nickname" maxLength={80} value={displayName} onChange={e => { setDisplayName(e.target.value); setMessage(null); }} required /><p className="hint mt-2">显示在导航、任务和导出数据里。</p></div>
              <div>
                <label className="label" htmlFor="profile-email"><Mail size={14} aria-hidden="true" className="mr-1 inline" />账号邮箱（选填）</label>
                <input id="profile-email" name="email" type="email" className="field" autoComplete="email" placeholder="用于找回密码与账号验证" value={email} onChange={e => { setEmail(e.target.value); setMessage(null); }} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`status-pill ${!profile.accountEmail ? "" : verified ? "is-ok" : "is-warn"}`}>{verified && <BadgeCheck size={13} aria-hidden="true" />}{profile.accountEmail ? verified ? "已验证" : "未验证" : "未绑定邮箱"}</span>
                  {profile.accountEmail && !verified && !emailChanged && !pendingEmail && !verifyEmail && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setVerifyEmail(true); setMessage(null); }}>验证此邮箱</button>}
                </div>
                <p className="hint mt-2">修改邮箱需要当前密码。验证链接生效前原邮箱保持有效；暂不支持解除绑定。</p>
                {pendingEmail && <p className="hint mt-2 break-all" role="status">待验证：{pendingEmail}。验证后需要重新登录；未收到邮件可检查垃圾邮件。</p>}
              </div>
            </div>
            {emailAction && <div className="max-w-sm"><label className="label" htmlFor="profile-emailPassword">当前密码</label><input ref={emailPasswordRef} id="profile-emailPassword" name="currentPassword" type="password" className="field" autoComplete="current-password" maxLength={256} placeholder="修改或验证邮箱时必填" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} required /></div>}
          </fieldset>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={pending !== null || !dirty}>{pending === "profile" ? "保存中…" : verifyEmail ? "保存并发送验证邮件" : "保存资料"}</button>
            {dirty && <button type="button" className="btn btn-secondary w-full sm:w-auto" disabled={pending !== null} onClick={() => { setDisplayName(savedName); setEmail(pendingEmail ?? profile.accountEmail ?? ""); setEmailPassword(""); setVerifyEmail(false); setError(null); setMessage(null); }}>取消修改</button>}
          </div>
          {message && <p className="text-sm text-accent" role="status">{message}</p>}
          {error && <p className="error-text" role="alert">{error}</p>}
        </form>
      </section>
      <section className="settings-card">
        <h2 className="section-title"><KeyRound size={16} className="mr-2 inline" aria-hidden="true" />修改密码</h2>
        <p className="hint mt-1">保存新密码后，包括当前设备在内的所有设备都需要重新登录。</p>
        <form method="post" ref={passwordForm} className="mt-4 space-y-4" onSubmit={requestPasswordChange} noValidate aria-busy={pending === "password"}>
          <fieldset disabled={pending !== null} className="min-w-0 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div><label className="label" htmlFor="password-current">当前密码</label><input id="password-current" name="currentPassword" type="password" className="field" autoComplete="current-password" maxLength={256} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required /></div>
              <div><label className="label" htmlFor="password-new">新密码</label><input id="password-new" name="newPassword" type="password" className="field" autoComplete="new-password" minLength={10} maxLength={256} value={newPassword} onChange={e => setNewPassword(e.target.value)} required aria-describedby="new-password-hint" /><p id="new-password-hint" className="hint mt-1">10–256 个字符。</p></div>
              <div><label className="label" htmlFor="password-confirmation">确认新密码</label><input id="password-confirmation" name="confirmation" type="password" className="field" autoComplete="new-password" maxLength={256} value={confirmation} onChange={e => setConfirmation(e.target.value)} required /></div>
            </div>
          </fieldset>
          <div className="form-actions"><button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={pending !== null}>{pending === "password" ? "保存并退出中…" : "保存新密码"}</button></div>
          {passwordError && <p className="error-text" role="alert">{passwordError}</p>}
        </form>
      </section>
      <ConfirmDialog open={confirmPassword} onOpenChange={setConfirmPassword} title="确认修改密码" description="保存后所有设备会退出登录。请确认已记住新密码，并保存其他页面中尚未提交的修改。" confirmLabel="保存并重新登录" onConfirm={savePassword} />
    </>
  );
}

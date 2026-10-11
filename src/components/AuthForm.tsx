"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, ListTodo, LockKeyhole, LoaderCircle } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { usernameSchema } from "@/shared/accounts";
import Link from "next/link";

export function AuthForm({ next, configError, registrationEnabled = false, notice }: {
  next: string;
  configError?: string;
  registrationEnabled?: boolean;
  notice?: string;
}) {
  const router = useRouter();
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<"username" | "password" | null>(null);

  useEffect(() => { setReady(true); usernameRef.current?.focus({ preventScroll: true }); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || configError) return;
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) {
      setError(username.trim() ? parsed.error.issues[0].message : "请输入用户名");
      setInvalid("username");
      usernameRef.current?.focus();
      return;
    }
    if (!password || password.length > 256) {
      setError(password ? "密码不能超过 256 个字符" : "请输入密码");
      setInvalid("password");
      passwordRef.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    setInvalid(null);
    try {
      const result = await apiFetch<{ next: string }>("/api/auth/login", {
        method: "POST", body: { username: parsed.data, password, next },
      });
      router.replace(result.next || "/today");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
      passwordRef.current?.focus();
    }
  }

  return (
    <div className="flex w-full max-w-[400px] flex-col items-center">
      <div className="mb-6 flex items-center gap-3">
        <span className="brand-mark" aria-hidden="true"><ListTodo size={22} /></span>
        <span className="text-[22px] font-semibold tracking-tight">Todo</span>
      </div>
      <form method="post" onSubmit={submit} className="login-card w-full" noValidate aria-busy={pending}>
        <h1 className="text-[22px] font-semibold tracking-tight">登录工作空间</h1>
        <p className="hint mt-2">输入用户名和密码，继续处理你的任务。</p>
        {notice && <p className="mt-4 rounded-lg bg-accent-soft p-3 text-sm text-accent" role="status">{notice}</p>}
        <div className="mt-6">
          <label className="label" htmlFor="username">用户名</label>
          <input ref={usernameRef} id="username" name="username" className="field" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={40} placeholder="请输入用户名" value={username} onChange={e => { setUsername(e.target.value); setInvalid(null); setError(null); }} disabled={pending || !!configError} required aria-invalid={invalid === "username"} aria-describedby={invalid === "username" ? "login-error" : undefined} />
        </div>
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <label className="label" htmlFor="password">密码</label>
            <Link href="/account?mode=forgot" className="text-xs text-accent hover:underline">忘记密码？</Link>
          </div>
          <div className="relative">
            <input ref={passwordRef} id="password" className="field !pr-12" type={visible ? "text" : "password"} name="password" autoComplete="current-password" placeholder="请输入密码" value={password} maxLength={256} onChange={e => { setPassword(e.target.value); setInvalid(null); setError(null); }} aria-invalid={invalid === "password"} aria-describedby={error ? "login-error" : undefined} disabled={pending || !!configError} required />
            <button type="button" className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded text-muted hover:bg-sunken" onClick={() => setVisible(v => !v)} aria-label={visible ? "隐藏密码" : "显示密码"} aria-pressed={visible} disabled={pending}>
              {visible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>
        {(configError || error) && <p id="login-error" className="error-text mt-3 rounded-lg bg-danger/5 px-3 py-2" role="alert">{configError || error}</p>}
        <button type="submit" className="btn btn-primary mt-6 w-full" disabled={!ready || pending || !!configError}>
          {pending ? <><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />正在登录…</> : <>登录<ArrowRight size={16} aria-hidden="true" /></>}
        </button>
        {registrationEnabled && <p className="hint mt-5 text-center">还没有账号？ <Link href="/account?mode=register" className="text-accent hover:underline">创建账号</Link></p>}
      </form>
      <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted"><LockKeyhole size={13} aria-hidden="true" />你的任务与其他账号隔离</p>
    </div>
  );
}

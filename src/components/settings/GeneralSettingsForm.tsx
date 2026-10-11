"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Globe2, Monitor, MonitorSmartphone, Moon, Save, Sun } from "lucide-react";
import { Field } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { Switch, Select } from "@/components/ui/controls";
import { apiFetch } from "@/lib/client";
import { formatFullDateTime } from "@/lib/time";
import { preferenceSchema } from "@/shared/settings";

type Props = {
  initialTimeZone: string;
  initialDefaultEnabled: boolean;
  initialDefaultLeadMin: number;
};
const COMMON_ZONES = [
  { value: "Asia/Shanghai", label: "中国标准时间 · 上海 / 北京" },
  { value: "Asia/Hong_Kong", label: "香港" },
  { value: "Asia/Taipei", label: "台北" },
  { value: "Asia/Singapore", label: "新加坡" },
  { value: "Asia/Tokyo", label: "日本 · 东京" },
  { value: "Asia/Kolkata", label: "印度 · 加尔各答" },
  { value: "Europe/London", label: "英国 · 伦敦" },
  { value: "Europe/Berlin", label: "德国 · 柏林" },
  { value: "America/New_York", label: "美国东部 · 纽约" },
  { value: "America/Los_Angeles", label: "美国西部 · 洛杉矶" },
  { value: "Etc/UTC", label: "协调世界时 · UTC" },
];
const LEAD_OPTIONS = [
  { value: 5, label: "5 分钟" },
  { value: 15, label: "15 分钟" },
  { value: 30, label: "30 分钟" },
  { value: 60, label: "1 小时" },
  { value: 1440, label: "1 天" },
];

export function GeneralSettingsForm({ initialTimeZone, initialDefaultEnabled, initialDefaultLeadMin }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [defaultEnabled, setDefaultEnabled] = useState(initialDefaultEnabled);
  const [defaultLeadMin, setDefaultLeadMin] = useState(String(initialDefaultLeadMin));
  const [saved, setSaved] = useState({
    timeZone: initialTimeZone, defaultEnabled: initialDefaultEnabled,
    defaultLeadMin: String(initialDefaultLeadMin),
  });
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [browserZone, setBrowserZone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const locked = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem("todo-theme");
    if (stored === "system" || stored === "light" || stored === "dark") setTheme(stored);
    setBrowserZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const nowPreview = useMemo(() => {
    try { return formatFullDateTime(new Date(), timeZone); }
    catch { return "无法识别当前时区，请重新选择"; }
  }, [timeZone]);
  const dirty = timeZone !== saved.timeZone || defaultEnabled !== saved.defaultEnabled || defaultLeadMin !== saved.defaultLeadMin;

  /*
   * 时区只列常用值。
   *
   * 以前列了 Intl.supportedValuesOf 的全部时区（几百个），而且用的是原生 select；
   * 现在换成项目自己的下拉框，选项保持短列表；当前值不在列表里时把它放在首位，
   * 避免用户只是打开设置页就被改掉时区。
   */
  const zoneOptions = useMemo(() => {
    const known = COMMON_ZONES.some(zone => zone.value === timeZone);
    if (known) return COMMON_ZONES;
    return [{ value: timeZone, label: `${timeZone.replaceAll("_", " ")}（当前设置）` }, ...COMMON_ZONES];
  }, [timeZone]);

  function applyTheme(next: "system" | "light" | "dark") {
    setTheme(next);
    localStorage.setItem("todo-theme", next);
    const dark = next === "dark" || (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }
  function changeTimeZone(next: string) {
    setTimeZone(next);
    setFieldErrors(current => ({ ...current, timezone: "" }));
    setError("");
  }
  function changeLead(next: string) {
    setDefaultLeadMin(next);
    setFieldErrors(current => ({ ...current, remindLeadMin: "" }));
    setError("");
  }
  function reset() {
    setTimeZone(saved.timeZone);
    setDefaultEnabled(saved.defaultEnabled);
    setDefaultLeadMin(saved.defaultLeadMin);
    setFieldErrors({});
    setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current || !dirty) return;
    const parsed = preferenceSchema.safeParse({
      timezone: timeZone === "UTC" ? "Etc/UTC" : timeZone,
      remindEnabled: defaultEnabled, remindLeadMin: Number(defaultLeadMin),
    });
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        nextErrors[key] = key === "timezone" ? "请选择有效的时区。" : "提前时间须为 1～20160 的整数分钟（最多 14 天）。";
      }
      setFieldErrors(nextErrors);
      document.getElementById(nextErrors.timezone ? "setting-timezone" : "setting-lead")?.focus();
      return;
    }
    locked.current = true;
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      await apiFetch("/api/settings", { method: "PUT", body: { preference: parsed.data } });
      const normalized = String(parsed.data.remindLeadMin);
      setTimeZone(parsed.data.timezone);
      setDefaultLeadMin(normalized);
      setSaved({ timeZone: parsed.data.timezone, defaultEnabled, defaultLeadMin: normalized });
      show({ message: "通用设置已保存" });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="settings-card" noValidate aria-busy={saving}>
      <h2 className="section-title">通用设置</h2>
      <p className="hint mt-1">设置时间显示、界面外观和新任务的默认提醒。</p>
      <fieldset disabled={saving} className="mt-5 min-w-0 space-y-5">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium"><Globe2 size={16} className="text-muted" aria-hidden="true" />时间与地区</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="时区" htmlFor="setting-timezone" hint={`所选时区的当前时间：${nowPreview}`} error={fieldErrors.timezone}>
              <Select
                id="setting-timezone"
                label="时区"
                value={timeZone}
                onValueChange={changeTimeZone}
                options={zoneOptions}
                invalid={!!fieldErrors.timezone}
                describedBy={fieldErrors.timezone ? "setting-timezone-error" : "setting-timezone-hint"}
              />
            </Field>
            <div className="min-w-0">
              <span className="label">设备时区</span>
              <button
                type="button"
                className="btn btn-secondary w-full justify-start"
                disabled={!browserZone || browserZone === timeZone}
                onClick={() => changeTimeZone(browserZone)}
              >
                <MonitorSmartphone size={15} aria-hidden="true" />
                <span className="truncate">{browserZone ? browserZone.replaceAll("_", " ") : "读取中…"}</span>
              </button>
              <p className="hint mt-2">{browserZone && browserZone === timeZone ? "当前已按设备时区显示。" : "点一下即切换到设备所在时区，支持夏令时自动调整。"}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-line pt-5">
          <h3 className="text-sm font-medium">外观</h3>
          <p className="hint mt-1">立即应用，并自动保存在当前浏览器。</p>
          <div className="segmented mt-3 w-full sm:w-auto" role="group" aria-label="界面外观">
            {([
              { value: "system", label: "跟随系统", icon: Monitor },
              { value: "light", label: "浅色", icon: Sun },
              { value: "dark", label: "深色", icon: Moon },
            ] as const).map(({ value, label, icon: Icon }) => (
              <button key={value} type="button" className="segment" onClick={() => applyTheme(value)} aria-pressed={theme === value}>
                <Icon size={15} aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-line pt-5">
          <h3 className="flex items-center gap-2 text-sm font-medium"><Bell size={16} className="text-muted" aria-hidden="true" />默认提醒</h3>
          <div className="mt-3 grid gap-5 sm:grid-cols-2">
            <div className="min-w-0">
              <Switch label="新建任务时默认开启提醒" checked={defaultEnabled} onCheckedChange={setDefaultEnabled} disabled={saving} />
              <p className="hint mt-2">仅影响之后创建的任务，已有任务保留各自的提醒设置。</p>
            </div>
            <div className="min-w-0">
              <span className="label">默认提前时间</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="常用提醒提前时间">
                {LEAD_OPTIONS.map(option => (
                  <button key={option.value} type="button" className="choice-chip" aria-pressed={Number(defaultLeadMin) === option.value} onClick={() => changeLead(String(option.value))}>{option.label}</button>
                ))}
              </div>
              <div className="mt-3">
                <Field label="自定义提前时间（分钟）" htmlFor="setting-lead" error={fieldErrors.remindLeadMin} hint="可设置 1～20160 分钟，最多提前 14 天。">
                  <input id="setting-lead" type="number" inputMode="numeric" required min={1} max={20160} step={1} className="field max-w-32" value={defaultLeadMin} aria-invalid={!!fieldErrors.remindLeadMin} aria-describedby={fieldErrors.remindLeadMin ? "setting-lead-error" : "setting-lead-hint"} onChange={event => changeLead(event.target.value)} />
                </Field>
              </div>
              {!defaultEnabled && <p className="hint mt-2">默认提醒已关闭；提前时间会保留，重新开启后使用。</p>}
            </div>
          </div>
          <p className="hint mt-3">提醒需要任务有截止时间，且至少有一个可用的<Link href="/settings/email" className="text-accent underline underline-offset-2">邮件通知</Link>或<Link href="/settings/push" className="text-accent underline underline-offset-2">Webhook 渠道</Link>。</p>
        </div>
      </fieldset>
      {error && <p className="error-text mt-4" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={!dirty || saving}><Save size={16} aria-hidden="true" />{saving ? "保存中…" : "保存更改"}</button>
        {dirty && <button type="button" className="btn btn-secondary" disabled={saving} onClick={reset}>撤销更改</button>}
        <span className="text-[13px] text-muted" aria-live="polite">{saving ? "正在保存" : dirty ? "有未保存的修改" : "所有偏好已保存"}</span>
      </div>
    </form>
  );
}

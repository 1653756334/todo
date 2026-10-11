"use client";

import { useState } from "react";
import { CalendarDays, Clock3, CornerDownLeft, X } from "lucide-react";
import { parseNaturalDate } from "@/lib/naturalDate";
import {
  formatFullDateTime,
  fromLocalInputValue,
  toLocalInputValue,
} from "@/lib/time";

type Props = {
  id: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  timeZone: string;
  disabled?: boolean;
};

export function DateTimeField({
  id,
  value,
  onChange,
  timeZone,
  disabled,
}: Props) {
  const [natural, setNatural] = useState("");
  const [note, setNote] = useState<{
    tone: "ok" | "warn";
    text: string;
  } | null>(null);
  const localValue = value ? toLocalInputValue(new Date(value), timeZone) : "";

  function applyNatural() {
    const text = natural.trim();
    if (!text || disabled) return;
    const result = parseNaturalDate(text, { now: new Date(), timeZone });
    if (!result.date || !Number.isFinite(result.date.getTime()) || result.precision === "ambiguous") {
      setNote({
        tone: "warn",
        text: `无法确定「${text}」的具体时间，请使用日期时间选择器。`,
      });
      return;
    }
    onChange(result.date.toISOString());
    setNote({
      tone: "ok",
      text: result.precision === "date"
        ? `未填写具体时间，已设为当天 18:00：${formatFullDateTime(result.date, timeZone)}`
        : `已设置：${formatFullDateTime(result.date, timeZone)}`,
    });
    setNatural("");
  }

  function quickSet(dayOffset: number) {
    const today = toLocalInputValue(new Date(), timeZone).slice(0, 10);
    const calendarDay = new Date(`${today}T12:00:00Z`);
    calendarDay.setUTCDate(calendarDay.getUTCDate() + dayOffset);
    const parts = calendarDay.toISOString().slice(0, 10);
    const parsed = fromLocalInputValue(`${parts}T18:00`, timeZone);
    if (parsed) {
      onChange(parsed.toISOString());
      setNatural("");
      setNote({
        tone: "ok",
        text: `已设置：${formatFullDateTime(parsed, timeZone)}`,
      });
    }
  }

  const todayAtSix = fromLocalInputValue(`${toLocalInputValue(new Date(), timeZone).slice(0, 10)}T18:00`, timeZone);
  const todayPassed = !todayAtSix || todayAtSix.getTime() <= Date.now();

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <CalendarDays
            size={17}
            strokeWidth={1.75}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id={id}
            type="datetime-local"
            className="field min-h-10 min-w-0 pr-2 pl-9"
            value={localValue}
            disabled={disabled}
            aria-label="截止日期和时间"
            aria-describedby={`${id}-summary`}
            onChange={(event) => {
              const parsed = fromLocalInputValue(event.target.value, timeZone);
              if (event.target.value && !parsed) {
                setNote({ tone: "warn", text: "该日期或时间不可用，请重新选择。" });
                return;
              }
              onChange(parsed ? parsed.toISOString() : null);
              setNatural("");
              setNote(null);
            }}
          />
        </div>
        {value ? (
          <button
            type="button"
            className="icon-button shrink-0"
            aria-label="清除截止时间"
            title="清除截止时间"
            onClick={() => {
              onChange(null);
              setNatural("");
              setNote(null);
            }}
            disabled={disabled}
          >
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary min-h-10"
          onClick={() => quickSet(0)}
          disabled={disabled || todayPassed}
          title={todayPassed ? "今天 18:00 已过，请选择其他时间" : undefined}
        >
          今天 18:00{todayPassed ? "（已过）" : ""}
        </button>
        <button
          type="button"
          className="btn btn-secondary min-h-10"
          onClick={() => quickSet(1)}
          disabled={disabled}
        >
          明天 18:00
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <label className="sr-only" htmlFor={`${id}-natural`}>
          用文字设置截止时间
        </label>
        <div className="relative min-w-0 flex-1">
          <Clock3
            size={17}
            strokeWidth={1.75}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id={`${id}-natural`}
            className="field min-h-10 pl-9"
            placeholder="输入时间，如明天 18:00"
            value={natural}
            disabled={disabled}
            autoComplete="off"
            aria-describedby={`${id}-summary`}
            onChange={(event) => {
              setNatural(event.target.value);
              setNote(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                applyNatural();
              }
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary min-h-10 shrink-0 max-sm:px-2.5"
          onClick={applyNatural}
          disabled={disabled || !natural.trim()}
        >
          <CornerDownLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          设置
        </button>
      </div>

      <p className="hint">文字输入后点击「设置」。只填写日期时，默认使用当天 18:00。</p>
      <div id={`${id}-summary`} className="space-y-1 text-[13px] break-words text-muted">
        <p>
          {value
            ? formatFullDateTime(new Date(value), timeZone)
            : "未设置截止时间"}
        </p>
        {value && new Date(value).getTime() < Date.now() ? <p className="text-warn">截止时间已过，请确认是否需要调整。</p> : null}
        <p className="flex items-center gap-1.5">
          <Clock3 size={13} aria-hidden="true" />
          时区：{timeZone}
        </p>
      </div>
      {note ? (
        <p
          className={`text-[13px] ${note.tone === "ok" ? "text-muted" : "text-warn"}`}
          role="status"
          aria-live="polite"
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Clock3, X } from "lucide-react";
import {
  formatFullDateTime,
  fromLocalInputValue,
  toLocalInputValue,
} from "@/lib/time";

type Props = {
  id: string;
  /** 结束（截止）时间，ISO 字符串 */
  value: string | null;
  /** 开始时间，ISO 字符串 */
  startValue?: string | null;
  onChange: (iso: string | null) => void;
  onStartChange?: (iso: string | null) => void;
  timeZone: string;
  disabled?: boolean;
  /** 是否显示「开始时间」（结构化导入里只需要一个截止时间，传 false） */
  allowRange?: boolean;
};

/** 把 datetime-local 的本地值转成 ISO；无法解析返回 null */
function isoFromLocal(local: string, timeZone: string): string | null {
  if (!local) return null;
  const date = fromLocalInputValue(local, timeZone);
  return date ? date.toISOString() : null;
}

const RANGE_WARNING = "开始时间要早于截止时间";
const NEED_DUE_WARNING = "设置开始时间时也要有截止时间";
const PARSE_WARNING = "该日期或时间不可用，请重新选择。";

export function DateTimeField({
  id,
  value,
  startValue,
  onChange,
  onStartChange,
  timeZone,
  disabled,
  allowRange = true,
}: Props) {
  // 草稿只在「顺序不合法」时保存用户刚输入的值，避免把无效值回调出去。
  const [startDraft, setStartDraft] = useState<string | undefined>(undefined);
  const [dueDraft, setDueDraft] = useState<string | undefined>(undefined);
  const [quickConflict, setQuickConflict] = useState(false);
  const [parseWarn, setParseWarn] = useState<string | null>(null);

  const prevValue = useRef(value);
  const prevStart = useRef(startValue);
  useEffect(() => {
    if (prevValue.current !== value || prevStart.current !== startValue) {
      prevValue.current = value;
      prevStart.current = startValue;
      setStartDraft(undefined);
      setDueDraft(undefined);
      setQuickConflict(false);
      setParseWarn(null);
    }
  }, [value, startValue]);

  const showStart = allowRange;

  const startLocal =
    startDraft !== undefined
      ? startDraft
      : startValue
        ? toLocalInputValue(new Date(startValue), timeZone)
        : "";
  const dueLocal =
    dueDraft !== undefined
      ? dueDraft
      : value
        ? toLocalInputValue(new Date(value), timeZone)
        : "";
  const startIso =
    startDraft !== undefined ? isoFromLocal(startDraft, timeZone) : startValue;
  const dueIso = dueDraft !== undefined ? isoFromLocal(dueDraft, timeZone) : value;

  const orderWarn =
    startDraft !== undefined || dueDraft !== undefined || quickConflict;
  const warnText =
    startDraft !== undefined && !dueIso ? NEED_DUE_WARNING : RANGE_WARNING;

  function handleDueInput(raw: string) {
    if (disabled) return;
    const draftStart =
      startDraft !== undefined ? isoFromLocal(startDraft, timeZone) : undefined;

    if (!raw) {
      setDueDraft(undefined);
      setQuickConflict(false);
      setParseWarn(null);
      onChange(null);
      // 没有截止时间就谈不上时间段，开始时间一并撤销（父级会合并成一次保存）。
      if (draftStart !== undefined || startValue) {
        setStartDraft(undefined);
        onStartChange?.(null);
      }
      return;
    }

    const nextDue = fromLocalInputValue(raw, timeZone);
    if (!nextDue) {
      setParseWarn(PARSE_WARNING);
      return;
    }

    setParseWarn(null);
    setQuickConflict(false);
    const currentStart = startIso;
    if (currentStart && Date.parse(currentStart) >= nextDue.getTime()) {
      setDueDraft(raw);
      return;
    }

    setDueDraft(undefined);
    onChange(nextDue.toISOString());
    if (startDraft !== undefined) {
      const draftStartIso = isoFromLocal(startDraft, timeZone);
      if (!draftStartIso || Date.parse(draftStartIso) < nextDue.getTime()) {
        setStartDraft(undefined);
        onStartChange?.(draftStartIso);
      }
    }
  }

  function handleStartInput(raw: string) {
    if (disabled) return;
    const draftDue =
      dueDraft !== undefined ? isoFromLocal(dueDraft, timeZone) : undefined;

    if (!raw) {
      setStartDraft(undefined);
      setQuickConflict(false);
      setParseWarn(null);
      onStartChange?.(null);
      if (draftDue !== undefined) {
        setDueDraft(undefined);
        onChange(draftDue);
      }
      return;
    }

    const nextStart = fromLocalInputValue(raw, timeZone);
    if (!nextStart) {
      setParseWarn(PARSE_WARNING);
      return;
    }

    setParseWarn(null);
    setQuickConflict(false);
    const currentDue = dueIso;
    // 还没有截止时间：先留在草稿里并提示，等截止时间填好再一起保存。
    if (!currentDue || nextStart.getTime() >= Date.parse(currentDue)) {
      setStartDraft(raw);
      return;
    }

    setStartDraft(undefined);
    onStartChange?.(nextStart.toISOString());
    if (dueDraft !== undefined) {
      const draftDueIso = isoFromLocal(dueDraft, timeZone);
      if (!draftDueIso || nextStart.getTime() < Date.parse(draftDueIso)) {
        setDueDraft(undefined);
        onChange(draftDueIso);
      }
    }
  }

  function clearStart() {
    if (disabled) return;
    const draftDue =
      dueDraft !== undefined ? isoFromLocal(dueDraft, timeZone) : undefined;
    setStartDraft(undefined);
    setQuickConflict(false);
    setParseWarn(null);
    onStartChange?.(null);
    if (draftDue !== undefined) {
      setDueDraft(undefined);
      onChange(draftDue);
    }
  }

  function clearDue() {
    if (disabled) return;
    setDueDraft(undefined);
    setQuickConflict(false);
    setParseWarn(null);
    onChange(null);
    if (startDraft !== undefined || startValue) {
      setStartDraft(undefined);
      onStartChange?.(null);
    }
  }

  function quickSet(dayOffset: number) {
    if (disabled) return;
    const today = toLocalInputValue(new Date(), timeZone).slice(0, 10);
    const calendarDay = new Date(`${today}T12:00:00Z`);
    calendarDay.setUTCDate(calendarDay.getUTCDate() + dayOffset);
    const parts = calendarDay.toISOString().slice(0, 10);
    const parsed = fromLocalInputValue(`${parts}T18:00`, timeZone);
    if (!parsed) return;

    const currentStart = startIso;
    if (currentStart && Date.parse(currentStart) >= parsed.getTime()) {
      setQuickConflict(true);
      setParseWarn(null);
      return;
    }

    setQuickConflict(false);
    setParseWarn(null);
    setDueDraft(undefined);
    onChange(parsed.toISOString());
    if (startDraft !== undefined) {
      const draftStartIso = isoFromLocal(startDraft, timeZone);
      if (!draftStartIso || Date.parse(draftStartIso) < parsed.getTime()) {
        setStartDraft(undefined);
        onStartChange?.(draftStartIso);
      }
    }
  }

  const todayAtSix = fromLocalInputValue(
    `${toLocalInputValue(new Date(), timeZone).slice(0, 10)}T18:00`,
    timeZone,
  );
  const todayPassed = !todayAtSix || todayAtSix.getTime() <= Date.now();

  const now = Date.now();
  const startDate = startIso ? new Date(startIso) : null;
  const dueDate = dueIso ? new Date(dueIso) : null;

  return (
    <div className="space-y-3">
      {showStart ? (
        <div className="space-y-2">
          <label className="label mb-0" htmlFor={`${id}-start`}>
            开始时间
            <span className="ml-1 font-normal text-muted">（可不填）</span>
          </label>
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Clock3
                size={17}
                strokeWidth={1.75}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                id={`${id}-start`}
                type="datetime-local"
                className="field min-h-10 min-w-0 pr-2 pl-9"
                value={startLocal}
                max={dueLocal || undefined}
                disabled={disabled}
                aria-label="开始日期和时间"
                aria-describedby={`${id}-summary`}
                onChange={(event) => handleStartInput(event.target.value)}
              />
            </div>
            {startLocal ? (
              <button
                type="button"
                className="icon-button shrink-0"
                aria-label="清除开始时间"
                title="清除开始时间"
                onClick={clearStart}
                disabled={disabled}
              >
                <X size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="label mb-0" htmlFor={id}>
          截止时间
        </label>
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
              value={dueLocal}
              min={showStart ? startLocal || undefined : undefined}
              disabled={disabled}
              aria-label="截止日期和时间"
              aria-describedby={`${id}-summary`}
              onChange={(event) => handleDueInput(event.target.value)}
            />
          </div>
          {dueLocal ? (
            <button
              type="button"
              className="icon-button shrink-0"
              aria-label="清除截止时间"
              title="清除截止时间"
              onClick={clearDue}
              disabled={disabled}
            >
              <X size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {parseWarn || orderWarn ? (
        <p className="text-[13px] text-warn" role="status" aria-live="polite">
          {parseWarn ?? warnText}
        </p>
      ) : null}

      {showStart && !startLocal ? (
        <p className="hint">
          只填截止时间就是一个时间点；填上开始时间就变成一段时间。
        </p>
      ) : null}

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

      <div
        id={`${id}-summary`}
        className="space-y-1 text-[13px] break-words text-muted"
      >
        {showStart && startDate ? (
          <p>
            开始：{formatFullDateTime(startDate, timeZone)}
          </p>
        ) : null}
        {showStart && startDate && startDate.getTime() < now ? (
          <p className="text-warn">开始时间已过</p>
        ) : null}
        <p>
          截止：
          {dueDate ? formatFullDateTime(dueDate, timeZone) : "未设置"}
        </p>
        {dueDate && dueDate.getTime() < now ? (
          <p className="text-warn">截止时间已过，请确认是否需要调整。</p>
        ) : null}
        <p className="flex items-center gap-1.5">
          <Clock3 size={13} aria-hidden="true" />
          时区：{timeZone}
        </p>
      </div>
    </div>
  );
}

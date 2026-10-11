/** 明确的自然语言时间解析（客户端可用）。
 *  只处理常见且无歧义的写法，其余一律返回 ambiguous，交给用户确认。 */

import { zonedTimeToUtc } from "./time";

export type NaturalParse = {
  date: Date | null;
  precision: "datetime" | "date" | "ambiguous";
  hint: string;
};

const WEEKDAY_NAMES: Record<string, number> = {
  日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
};

const DEFAULT_HOUR = 18;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; hasTime: boolean };

function wallParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) map[part.type] = part.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
  };
}

function addDays(parts: { year: number; month: number; day: number }, days: number) {
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  base.setUTCDate(base.getUTCDate() + days);
  return { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate() };
}

/** 解析时间片段：返回 24 小时制的时和分 */
function parseTime(token: string | undefined): { hour: number; minute: number } | null {
  if (!token) return null;
  const colon = /^(\d{1,2})[:：](\d{2})$/.exec(token);
  if (colon) {
    const hour = Number(colon[1]);
    const minute = Number(colon[2]);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
  }
  const dot = /^(\d{1,2})\s*[点時时]\s*(半|(\d{1,2})\s*分?)?$/.exec(token);
  if (dot) {
    const hour = Number(dot[1]);
    if (hour > 23) return null;
    if (dot[2] === "半") return { hour, minute: 30 };
    return { hour, minute: dot[3] ? Number(dot[3]) : 0 };
  }
  return null;
}

export function parseNaturalDate(
  input: string,
  options: { now: Date; timeZone: string },
): NaturalParse {
  const text = input.trim();
  const ambiguous: NaturalParse = { date: null, precision: "ambiguous", hint: text };
  if (!text) return { date: null, precision: "ambiguous", hint: "" };

  const { now, timeZone } = options;
  const today = wallParts(now, timeZone);

  const timeMatch = /(?:^|[\s，,])(\d{1,2}(?:[:：]\d{2})|(?:\d{1,2}\s*[点時时](?:半|\d{1,2}\s*分?)?))\s*$/.exec(text);
  const timeToken = timeMatch?.[1];
  const parsedTime = parseTime(timeToken);
  const hasTime = parsedTime !== null;
  const hour = parsedTime?.hour ?? DEFAULT_HOUR;
  const minute = parsedTime?.minute ?? 0;
  const head = timeToken ? text.slice(0, text.length - timeToken.length) : text;

  const build = (p: { year: number; month: number; day: number }, withTime: boolean): Parts => ({
    ...p,
    hour: withTime ? hour : DEFAULT_HOUR,
    minute: withTime ? minute : 0,
    hasTime: withTime,
  });

  const finish = (parts: Parts, precision: NaturalParse["precision"]): NaturalParse => {
    const date = zonedTimeToUtc(
      parts.year,
      parts.month,
      parts.day,
      parts.hour,
      parts.minute,
      timeZone,
    );
    return { date, precision, hint: text };
  };

  // X 天后 / X 小时后 / X 分钟后
  const relative = /(\d+)\s*(天|日|个?小时|分钟)\s*(?:后|之后|以后)?/.exec(text);
  if (relative && /后|之后|以后/.test(text)) {
    const amount = Number(relative[1]);
    if (Number.isFinite(amount)) {
      if (relative[2].includes("分钟")) {
        return {
          date: new Date(now.getTime() + amount * 60000),
          precision: "datetime",
          hint: text,
        };
      }
      if (relative[2].includes("小时")) {
        return { date: new Date(now.getTime() + amount * 3600000), precision: "datetime", hint: text };
      }
      return finish(build(addDays(today, amount), hasTime), hasTime ? "datetime" : "date");
    }
  }

  // 完整日期 2026-06-12 或 2026/06/12
  const full = /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/.exec(head);
  if (full) {
    const parts: Parts = {
      year: Number(full[1]),
      month: Number(full[2]),
      day: Number(full[3]),
      hour,
      minute,
      hasTime,
    };
    if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return ambiguous;
    return finish(parts, hasTime ? "datetime" : "date");
  }

  // 月日 6-12 或 6月12日
  const monthDay = /^(\d{1,2})[-/月](\d{1,2})日?$/.exec(head.trim());
  if (monthDay) {
    const parts: Parts = {
      year: today.year,
      month: Number(monthDay[1]),
      day: Number(monthDay[2]),
      hour,
      minute,
      hasTime,
    };
    if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return ambiguous;
    return finish(parts, hasTime ? "datetime" : "date");
  }

  // 今天 / 明天 / 后天 / 大后天
  const relativeDay = /(今天|今日|明天|明日|后天|大后天)/.exec(head);
  if (relativeDay) {
    const offsetMap: Record<string, number> = {
      今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2, 大后天: 3,
    };
    const offset = offsetMap[relativeDay[1]];
    const rest = head.replace(relativeDay[1], "").trim();
    if (rest && rest !== "下班前" && rest !== "下班") return ambiguous;
    return finish(build(addDays(today, offset), hasTime), hasTime ? "datetime" : "date");
  }

  // 周X / 星期X / 礼拜X
  const weekday = /(?:下周|这周|本周|周|星期|礼拜)\s*([一二三四五六日天])/.exec(head);
  if (weekday) {
    const target = WEEKDAY_NAMES[weekday[1]];
    if (target === undefined) return ambiguous;
    const current = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
    let delta = (target - current + 7) % 7;
    const nextWeek = /下周/.test(head);
    if (nextWeek) delta = delta === 0 ? 7 : delta + 7;
    return finish(build(addDays(today, delta), hasTime), hasTime ? "datetime" : "date");
  }

  // 只有时间：今天 HH:mm
  if (hasTime && head.trim() === "") {
    return finish(build(today, true), "datetime");
  }

  return ambiguous;
}

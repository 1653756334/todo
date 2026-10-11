/** 时区与日期工具：库内一律 UTC，展示按用户时区转换。 */

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function partsOf(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) map[part.type] = part.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const p = partsOf(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** 把某时区的墙上时间转换为 UTC 时刻 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour < 0 || hour > 23 || minute < 0 || minute > 59) return new Date(NaN);
  const base = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = base;
  for (let i = 0; i < 3; i += 1) {
    const offset = offsetMs(new Date(utc), timeZone);
    const next = base - offset;
    if (next === utc) break;
    utc = next;
  }
  const result = new Date(utc);
  const p = partsOf(result, timeZone);
  return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute ? result : new Date(NaN);
}

/** `<input type="datetime-local">` 需要 "YYYY-MM-DDTHH:mm" */
export function toLocalInputValue(date: Date | null, timeZone: string): string {
  if (!date) return "";
  const p = partsOf(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** 解析 "YYYY-MM-DDTHH:mm"，按指定时区解释为 UTC 时刻 */
export function fromLocalInputValue(value: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const date = zonedTimeToUtc(Number(y), Number(mo), Number(d), Number(h), Number(mi), timeZone);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function sameDayInZone(a: Date, b: Date, timeZone: string): boolean {
  const pa = partsOf(a, timeZone);
  const pb = partsOf(b, timeZone);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

export function startOfDayInZone(date: Date, timeZone: string): Date {
  const p = partsOf(date, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, timeZone);
}

export function nextDayStartInZone(date: Date, timeZone: string): Date {
  const p = partsOf(date, timeZone);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return zonedTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, timeZone);
}
export function endOfDayInZone(date: Date, timeZone: string): Date {
  return new Date(nextDayStartInZone(date, timeZone).getTime() - 1);
}

/** 两个时刻在指定时区下相差的整天数（按日历日计算） */
function dayDiffInZone(a: Date, b: Date, timeZone: string): number {
  const pa = partsOf(a, timeZone);
  const pb = partsOf(b, timeZone);
  const da = Date.UTC(pa.year, pa.month - 1, pa.day);
  const db = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((da - db) / 86400000);
}

export function weekdayLabel(date: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dtf.format(date));
  return WEEKDAYS[index >= 0 ? index : 0];
}

export function timeLabel(date: Date, timeZone: string): string {
  const p = partsOf(date, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** 列表中使用的简短截止时间标签 */
export function formatDueLabel(
  due: Date,
  timeZone: string,
  now: Date = new Date(),
): { text: string; overdue: boolean; dueToday: boolean } {
  const overdue = due.getTime() < now.getTime();
  const p = partsOf(due, timeZone);
  const today = partsOf(now, timeZone);
  const time = timeLabel(due, timeZone);
  const dayDiff = dayDiffInZone(due, now, timeZone);

  let text: string;
  if (dayDiff === 0) {
    text = `今天 ${time}`;
  } else if (dayDiff === 1) {
    text = `明天 ${time}`;
  } else if (dayDiff > 1 && dayDiff <= 7) {
    text = `${dayDiff} 天后（${p.day}号） ${time}`;
  } else if (p.year === today.year) {
    text = `${p.month} 月 ${p.day} 日 ${time}`;
  } else {
    text = `${p.year} 年 ${p.month} 月 ${p.day} 日 ${time}`;
  }

  return { text, overdue, dueToday: sameDayInZone(due, now, timeZone) };
}

/** 完整日期时间，用于详情与邮件 */
export function formatFullDateTime(date: Date, timeZone: string): string {
  const p = partsOf(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year} 年 ${p.month} 月 ${p.day} 日（${weekdayLabel(date, timeZone)}）${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatDateLong(date: Date, timeZone: string): string {
  const p = partsOf(date, timeZone);
  return `${p.year} 年 ${p.month} 月 ${p.day} 日（${weekdayLabel(date, timeZone)}）`;
}

export function formatDateTimeShort(date: Date, timeZone: string): string {
  const p = partsOf(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.month} 月 ${p.day} 日 ${pad(p.hour)}:${pad(p.minute)}`;
}

export function relativeFromNow(date: Date, now: Date = new Date()): string {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return diff > 0 ? `${minutes} 分钟后` : `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return diff > 0 ? `${hours} 小时后` : `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return diff > 0 ? `${days} 天后` : `${days} 天前`;
}

/** 提前分钟数的中文表达 */
export function leadMinutesLabel(minutes: number): string {
  if (minutes % 60 === 0 && minutes >= 60) {
    const hours = minutes / 60;
    return `${hours} 小时`;
  }
  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours} 小时 ${rest} 分钟`;
  }
  return `${minutes} 分钟`;
}

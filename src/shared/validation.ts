import { AppError as HttpError } from "./errors";
/* ---------- 轻量字段校验 ---------- */

export function asString(
  value: unknown,
  field: string,
  { required = false, max = 20000, trim = true } = {},
): string | null {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `${field}不能为空`);
    return null;
  }
  if (typeof value !== "string") throw new HttpError(400, `${field}格式不正确`);
  const text = trim ? value.trim() : value;
  if (required && text.length === 0) throw new HttpError(400, `${field}不能为空`);
  if (text.length > max) throw new HttpError(400, `${field}超出长度上限`);
  return text;
}

export function asEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpError(400, `${field}取值不正确`);
  }
  return value as T;
}

export function asBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new HttpError(400, "开关取值不正确");
}

export function asInt(
  value: unknown,
  field: string,
  { min = 0, max = 100000, fallback = null as number | null } = {},
): number | null {
  if (value === undefined || value === null || value === "") return fallback;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) throw new HttpError(400, `${field}必须是数字`);
  if (!Number.isInteger(num)) throw new HttpError(400, `${field}必须是整数`);
  const rounded = num;
  if (rounded < min || rounded > max) {
    throw new HttpError(400, `${field}需要在 ${min} 到 ${max} 之间`);
  }
  return rounded;
}

/** 接受 ISO 字符串或 null；null 表示清空该时间 */
export function asDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, `${field}格式不正确`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `${field}不是有效时间`);
  return date;
}

export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high"] as const;

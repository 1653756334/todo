import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/shared/errors";
import { getSessionUser } from "./next-session";
export { AppError as HttpError };
export async function requireUser() {
  const u = await getSessionUser();
  if (!u) throw new AppError(401, "登录已失效，请重新登录", "UNAUTHENTICATED");
  return u;
}
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "请求内容为空");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.length; if (size > 1024 * 1024) { await reader.cancel(); throw new AppError(413, "请求内容过大"); } chunks.push(r.value); }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid");
    return data as T;
  } catch (e) { if (e instanceof AppError) throw e; throw new AppError(400, "请求内容无法解析"); }
}
export function handler<C = unknown>(fn: (r: Request, context: C) => Promise<unknown>) {
  return async (request: Request, context: C): Promise<Response> => {
    const requestId = randomUUID();
    try {
      if (!["GET", "HEAD"].includes(request.method.toUpperCase())) {
        if (request.headers.get("x-requested-with") !== "todo") throw new AppError(403, "请求来源校验失败");
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(process.env.APP_URL ?? request.url).origin) throw new AppError(403, "请求来源校验失败");
      }
      const result = await fn(request, context);
      const response = result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
      response.headers.set("cache-control", "private, no-store"); response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) {
      const e = error instanceof ZodError ? new AppError(400, error.issues[0]?.message ?? "输入无效", "VALIDATION", error.flatten().fieldErrors as Record<string,string[]>) : error;
      if (e instanceof AppError) return NextResponse.json({ error: e.message, code: e.code, fieldErrors: e.fieldErrors, requestId }, { status: e.status, headers: { "cache-control": "no-store" } });
      console.error(JSON.stringify({ event: "api_error", requestId, name: e instanceof Error ? e.name : "Unknown" }));
      return NextResponse.json({ error: "服务器内部错误", code: "INTERNAL", requestId }, { status: 500 });
    }
  };
}

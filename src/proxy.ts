// 轻量会话校验，只做签名与过期检查，不访问数据库。
// 完整校验（sessionVersion、密码变更）在 Node 运行时由 getSessionUser 完成。
// 使用 Web Crypto，避免依赖 Node 专有 API。

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "todo_session";
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/account",
  "/api/auth/token",
  "/api/auth/register",
  "/api/auth/forgot",
  "/api/health",
  // PWA：离线页与 Service Worker 必须在未登录时也能取到，
  // 否则装到桌面后断网打开会被重定向到登录页。
  "/offline",
  "/sw.js",
  "/manifest.webmanifest",
]);

function base64UrlToString(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sessionLooksValid(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const index = token.lastIndexOf(".");
  if (index <= 0) return false;
  const body = token.slice(0, index);
  const signature = token.slice(index + 1);

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    if (!safeEqual(bytesToBase64Url(new Uint8Array(mac)), signature)) return false;
  } catch {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlToString(body)) as { e?: number };
    return typeof payload.e === "number" && payload.e > Date.now();
  } catch {
    return false;
  }
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.APP_SECRET ?? "";
  const authenticated = await sessionLooksValid(token, secret);

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  if (authenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};

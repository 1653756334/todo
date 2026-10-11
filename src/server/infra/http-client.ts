import { lookup } from "node:dns/promises";
import { Agent, fetch as nodeFetch } from "undici";
import ipaddr from "ipaddr.js";
import { AppError } from "@/shared/errors";
export async function safeFetch(input: string | URL, init: RequestInit = {}, allowPrivate = false): Promise<Response> {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new AppError(400, "外部地址无效", "UNSAFE_URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || !allowPrivate && addresses.some(a => ipaddr.process(a.address).range() !== "unicast")) throw new AppError(400, "外部地址不能指向本地或保留网络", "UNSAFE_URL");
  const selected = addresses[0];
  const agent = new Agent({ connect: { lookup: (_hostname, options, callback) => {
    if (options.all) callback(null, [selected]);
    else callback(null, selected.address, selected.family);
  } } });
  try {
    const response = await nodeFetch(url, { ...init, redirect: "manual", dispatcher: agent } as Parameters<typeof nodeFetch>[1]);
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new AppError(502, "外部接口不允许重定向", "REDIRECT_BLOCKED"); }
    // Caller consumes the response, then the agent closes after idle connections settle.
    void agent.close();
    return response as unknown as Response;
  } catch (e) { agent.destroy(); throw e; }
}
export async function boundedText(response: Response, limit = 2 * 1024 * 1024) {
  const reader = response.body?.getReader(); if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.length; if (size > limit) { await reader.cancel(); throw new AppError(502, "外部响应过大", "UPSTREAM_TOO_LARGE"); } chunks.push(r.value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

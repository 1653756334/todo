// 群机器人推送：Web 进程（测试消息）与 Worker（任务提醒）共用同一份实现，
// 避免请求格式在两处漂移。只用 Node 内置能力，无额外依赖。
//
// 支持的平台（按 webhook 域名自动识别，无需用户选择）：
//   企业微信  qyapi.weixin.qq.com  → msgtype=markdown
//   钉钉      oapi.dingtalk.com    → msgtype=markdown（可加签）
//   飞书      open.feishu.cn       → msg_type=text（可签名）
//   其他      → 通用 webhook：POST { title, text, url }
//
// 选这条路的理由：消息进入的是带系统推送通道的聊天软件，手机端不需要维持
// 长连接，也不受国产 ROM 省电策略影响。

import crypto from "node:crypto";
import { safeFetch, boundedText } from "../../infra/http-client.ts";

/** 各平台文本上限不同，统一按保守值截断（企微 markdown 4096 字节最紧） */
export const BOT_MAX_TEXT_BYTES = 3500;
const WEBHOOK_MAX_LENGTH = 1000;
const PUSH_TIMEOUT_MS = 10000;

export const BOT_PROVIDER_LABELS = {
  wecom: "企业微信",
  dingtalk: "钉钉",
  feishu: "飞书",
  custom: "自定义 webhook",
};

/** 按 UTF-8 字节数截断，避免中文被截成半个字符 */
export function truncateBytes(text, maxBytes) {
  const value = String(text ?? "");
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let result = "";
  let size = 0;
  for (const char of value) {
    const charSize = Buffer.byteLength(char, "utf8");
    if (size + charSize > maxBytes - 1) break;
    result += char;
    size += charSize;
  }
  return `${result}…`;
}

function networkErrorMessage(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return "推送请求超时，请检查 webhook 地址与网络";
  }
  const detail = String(error?.message ?? "").slice(0, 200);
  return detail ? `无法连接推送服务器：${detail}` : "无法连接推送服务器";
}

/** 校验并规范化 webhook 地址：必须是绝对的 http(s) 地址 */
export function normalizeWebhook(input) {
  const raw = String(input ?? "").trim();
  if (!raw) throw new Error("webhook 地址不能为空");
  if (raw.length > WEBHOOK_MAX_LENGTH) throw new Error("webhook 地址过长");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("webhook 地址无法解析，请粘贴完整地址");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("webhook 地址必须以 http:// 或 https:// 开头");
  }
  if (!url.hostname) throw new Error("webhook 地址缺少主机名");
  return url.toString();
}

/**
 * 按地址判断是哪家机器人；认不出来就按自定义 webhook 处理。
 * @param {string | URL} webhook
 * @returns {"wecom" | "dingtalk" | "feishu" | "custom"}
 */
export function detectBotProvider(webhook) {
  let host = "";
  try {
    host = (webhook instanceof URL ? webhook : new URL(String(webhook)))
      .hostname;
  } catch {
    return "custom";
  }
  const lower = host.toLowerCase();
  if (lower === "qyapi.weixin.qq.com" || lower.endsWith(".qyapi.weixin.qq.com"))
    return "wecom";
  if (lower === "oapi.dingtalk.com" || lower.endsWith(".dingtalk.com"))
    return "dingtalk";
  if (
    lower === "open.feishu.cn" ||
    lower.endsWith(".feishu.cn") ||
    lower === "open.larksuite.com" ||
    lower.endsWith(".larksuite.com")
  )
    return "feishu";
  return "custom";
}

/**
 * 钉钉加签：sign = base64(HMAC-SHA256(key=secret, data=`timestamp\nsecret`))
 * @param {string} secret
 * @param {string} timestamp 毫秒字符串
 */
export function dingtalkSign(secret, timestamp) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}\n${secret}`)
    .digest("base64");
}

/**
 * 飞书签名：sign = base64(HMAC-SHA256(key=`timestamp\nsecret`, data=""))
 * timestamp 为秒级字符串。
 * @param {string} secret
 * @param {string} timestamp
 */
export function feishuSign(secret, timestamp) {
  return crypto
    .createHmac("sha256", `${timestamp}\n${secret}`)
    .update("")
    .digest("base64");
}

/**
 * 组装消息文本。brief 为真时只发一句摘要，不带上任务标题。
 * @param {{ provider: string, title?: string, lines?: string[], clickUrl?: string, brief?: boolean }} options
 */
export function buildBotMessage({
  provider,
  title,
  lines = [],
  clickUrl,
  brief = false,
}) {
  const safeTitle = truncateBytes(
    String(title ?? "").trim() || "Todo 提醒",
    200,
  );
  const safeLines = lines
    .filter((line) => typeof line === "string" && line.length > 0)
    .map((line) => truncateBytes(line, 500));

  if (brief) {
    const text = truncateBytes(
      ["Todo 提醒", "有任务即将到期，点开查看详情。", clickUrl ?? ""]
        .filter(Boolean)
        .join("\n"),
      BOT_MAX_TEXT_BYTES,
    );
    return {
      title: "Todo 提醒",
      text,
      markdown: `**Todo 提醒**\n有任务即将到期，点开查看详情。${clickUrl ? `\n[打开任务](${clickUrl})` : ""}`,
    };
  }

  const text = truncateBytes(
    [safeTitle, ...safeLines, ...(clickUrl ? [clickUrl] : [])].join("\n"),
    BOT_MAX_TEXT_BYTES,
  );
  const markdown = truncateBytes(
    [
      `**${safeTitle}**`,
      ...safeLines,
      clickUrl ? `[打开任务](${clickUrl})` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    BOT_MAX_TEXT_BYTES,
  );
  return { title: truncateBytes(safeTitle, 60), text, markdown };
}

/** 把群机器人的业务错误码翻译成人能看懂的话 */
export function botBusinessError(payload) {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload.errcode ?? payload.code ?? payload.StatusCode;
  if (raw === undefined || raw === null || Number(raw) === 0) return null;
  const code = Number(raw);
  const message = String(
    payload.errmsg ?? payload.msg ?? payload.StatusMessage ?? "",
  ).trim();
  const known = {
    93000: "webhook 地址无效，请重新复制（企业微信）",
    45009: "接口调用超过频率上限，请稍后再试",
    310000: "安全设置校验失败：请检查机器人是否用了关键词、加签或 IP 白名单",
    300001: "access_token 无效，请重新复制 webhook 地址（钉钉）",
    9499: "签名校验失败，请检查签名密钥（飞书）",
    19001: "签名校验失败或参数不合法（飞书）",
  };
  const hint = known[code];
  if (hint) return `${hint}${message ? `（${message}）` : ""}`;
  return `群机器人拒绝了这条消息${message ? `：${message}` : ""}（错误码 ${code}）`;
}

/** 网络异常与业务错误码统一成中文提示（仅在 HTTP 失败时调用） */
function botErrorFromResponse(status, text) {
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    /* 非 JSON 响应按状态码处理 */
  }
  const business = botBusinessError(payload);
  if (business) return business;
  if (status === 401 || status === 403)
    return "webhook 鉴权失败，请重新复制地址";
  if (status === 404) return "webhook 地址不存在（HTTP 404）";
  if (status === 429) return "触发频率限制，请稍后再试";
  if (status >= 500) return `群机器人服务暂时不可用（HTTP ${status}）`;
  return `发送失败（HTTP ${status}）${text ? `：${text.slice(0, 200)}` : ""}`;
}

/**
 * 向群机器人发送一条消息。成功返回响应体，失败抛出带中文提示的 Error。
 * @param {{ webhook: string, secret?: string, title?: string, lines?: string[], clickUrl?: string, brief?: boolean, timeoutMs?: number, fetchImpl?: typeof fetch, now?: number }} options
 */
export async function publishBot({
  webhook,
  secret,
  title,
  lines,
  clickUrl,
  brief = false,
  timeoutMs = PUSH_TIMEOUT_MS,
  fetchImpl = safeFetch,
  now = Date.now(),
}) {
  const url = new URL(normalizeWebhook(webhook));
  const provider = detectBotProvider(url);
  const core = buildBotMessage({ provider, title, lines, clickUrl, brief });

  /** @type {Record<string, unknown>} */
  let body;
  if (provider === "wecom") {
    body = { msgtype: "markdown", markdown: { content: core.markdown } };
  } else if (provider === "dingtalk") {
    body = {
      msgtype: "markdown",
      markdown: { title: core.title, text: core.markdown },
    };
    if (secret) {
      const timestamp = String(now);
      url.searchParams.set("timestamp", timestamp);
      url.searchParams.set("sign", dingtalkSign(secret, timestamp));
    }
  } else if (provider === "feishu") {
    body = { msg_type: "text", content: { text: core.text } };
    if (secret) {
      const timestamp = String(Math.floor(now / 1000));
      body.timestamp = timestamp;
      body.sign = feishuSign(secret, timestamp);
    }
  } else {
    body = {
      title: core.title,
      text: core.text,
      ...(clickUrl ? { url: clickUrl } : {}),
    };
  }

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(networkErrorMessage(error));
  }

  const text = await boundedText(response, 65536);
  if (!response.ok)
    throw new Error(botErrorFromResponse(response.status, text));
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    /* 有些自建 webhook 返回空体 */
  }
  const business = botBusinessError(payload);
  if (business) throw new Error(business);
  return { provider, response: payload };
}

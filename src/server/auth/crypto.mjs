// 纯加密工具，Web 进程与 Worker 进程共用同一份实现，避免格式漂移。
// 密码哈希：scrypt（Node 内置，无需原生依赖）
// 密钥加密：AES-256-GCM，主密钥由 ENCRYPTION_KEY 派生
// 会话令牌：HMAC-SHA256 签名

import crypto from "node:crypto";
import { promisify } from "node:util";
const asyncScrypt = promisify(crypto.scrypt);

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const GCM_KEY_BYTES = 32;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const keyCache = new Map();

function normalizeSecret(secret) {
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error("密钥长度不足：请在 .env 中设置至少 16 个字符的随机值");
  }
  return secret;
}

function deriveKey(secret) {
  const normalized = normalizeSecret(secret);
  let key = keyCache.get(normalized);
  if (!key) {
    key = crypto.scryptSync(normalized, "code-todo.settings.v1", GCM_KEY_BYTES, {
      N: SCRYPT.N,
      r: SCRYPT.r,
      p: SCRYPT.p,
    });
    keyCache.set(normalized, key);
  }
  return key;
}

/** 生成 `scrypt:salt:hash` 格式的密码哈希
 *  不用 `$` 作分隔符：.env 解析器会把 `$` 当变量展开，导致哈希被截断。 */
export function hashPassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("密码不能为空");
  }
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

/** 恒定时间校验密码，同时兼容旧的 `$` 分隔格式 */
export function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.includes(":") ? stored.split(":") : stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[1], "hex");
    expected = Buffer.from(parts[2], "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = crypto.scryptSync(password, salt, expected.length, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return crypto.timingSafeEqual(actual, expected);
}

/** 异步密码运算兼容既有 scrypt 格式。 */
export async function hashPasswordAsync(password) {
  if (typeof password !== "string" || password.length < 10 || password.length > 256) throw new Error("密码需要 10–256 个字符");
  const salt = crypto.randomBytes(16);
  const key = await asyncScrypt(password, salt, SCRYPT.keylen);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}
export async function verifyPasswordAsync(password, stored) {
  if (typeof password !== "string" || password.length > 256 || typeof stored !== "string") return false;
  const parts = stored.split(stored.includes(":") ? ":" : "$");
  if (parts.length !== 3 || parts[0] !== "scrypt" || !/^[a-f0-9]{32}$/i.test(parts[1]) || !/^[a-f0-9]{128}$/i.test(parts[2])) return false;
  const actual = await asyncScrypt(password, Buffer.from(parts[1], "hex"), SCRYPT.keylen);
  return crypto.timingSafeEqual(actual, Buffer.from(parts[2], "hex"));
}

/** 加密设置项中的敏感值 */
export function encryptSecret(plain, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join("$");
}

/** 解密设置项中的敏感值 */
export function decryptSecret(payload, secret) {
  const parts = String(payload ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("密文格式无法识别，请重新保存该设置");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const data = Buffer.from(parts[3], "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** 签发会话令牌 */
export function signSession({ userId, version }, secret, ttlMs = SESSION_TTL_MS) {
  const payload = {
    u: userId,
    v: Number(version) || 1,
    e: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", normalizeSecret(secret))
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

/** 校验会话令牌，失败返回 null */
export function verifySession(token, secret) {
  if (typeof token !== "string") return null;
  const index = token.lastIndexOf(".");
  if (index <= 0) return null;
  const body = token.slice(0, index);
  const signature = token.slice(index + 1);
  let expected;
  try {
    expected = crypto
      .createHmac("sha256", normalizeSecret(secret))
      .update(body)
      .digest("base64url");
  } catch {
    return null;
  }
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.u !== "string" || typeof payload.e !== "number") return null;
  if (payload.e <= Date.now()) return null;
  return { userId: payload.u, version: Number(payload.v) || 1, expiresAt: payload.e };
}

/** 用于登录限流的时间窗判断 */
export function sessionMaxAgeSeconds(ttlMs = SESSION_TTL_MS) {
  return Math.floor(ttlMs / 1000);
}

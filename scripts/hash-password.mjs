#!/usr/bin/env node
// 生成登录密码哈希。
//   node scripts/hash-password.mjs '你的密码'          # 打印哈希
//   node scripts/hash-password.mjs '你的密码' --write  # 同时写回 .env
//   node scripts/hash-password.mjs                     # 交互输入（不回显）

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { hashPassword } = require("../src/lib/secret.mjs");

const ENV_PATH = path.resolve(process.cwd(), ".env");

async function promptPassword() {
  process.stdout.write("请输入新密码：");
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    let data = "";
    for await (const chunk of stdin) data += chunk;
    process.stdout.write("\n");
    return data.trim();
  }
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve) => {
    let value = "";
    const onData = (char) => {
      const text = char.toString("utf8");
      if (text === "\r" || text === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value.trim());
        return;
      }
      if (text === "\u0003") {
        process.stdout.write("\n");
        process.exit(1);
      }
      if (text === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      value += text;
    };
    stdin.on("data", onData);
  });
}

function writeEnv(hash) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const line = `APP_PASSWORD_HASH="${hash}"`;
  if (/^APP_PASSWORD_HASH=.*$/m.test(content)) {
    content = content.replace(/^APP_PASSWORD_HASH=.*$/m, line);
  } else {
    content += `${content.endsWith("\n") || content === "" ? "" : "\n"}${line}\n`;
  }
  fs.writeFileSync(ENV_PATH, content);
  console.log(`已写入 ${ENV_PATH}`);
}

const args = process.argv.slice(2);
const write = args.includes("--write");
const password = args.find((arg) => !arg.startsWith("--")) ?? (await promptPassword());

if (!password || password.length < 6) {
  console.error("密码至少需要 6 个字符。");
  process.exit(1);
}

const hash = hashPassword(password);
console.log(hash);
if (write) writeEnv(hash);

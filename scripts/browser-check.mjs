/**
 * 多用户版浏览器验收（需要先启动一个生产构建，并准备好一个管理员与一个普通用户）。
 *
 *   CHECK_BASE=http://localhost:23330 \
 *   CHECK_ADMIN=管理员用户名 CHECK_USER=某个普通用户名 CHECK_PASSWORD='...' \
 *   node scripts/browser-check.mjs
 *
 * 退出码非 0 表示有失败项。仅做只读浏览与少量自建数据，不会删除既有任务。
 */
import { chromium } from "@playwright/test";

const BASE = process.env.CHECK_BASE ?? "http://localhost:23330";
// 管理员用户名由部署者自己定，这里不猜：缺参数就直接说清楚怎么用。
const missing = ["CHECK_ADMIN", "CHECK_USER", "CHECK_PASSWORD"].filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    `缺少环境变量：${missing.join("、")}\n\n` +
      "用法：\n" +
      "  CHECK_BASE=http://localhost:23330 \\\n" +
      "  CHECK_ADMIN=管理员用户名 CHECK_USER=某个普通用户名 CHECK_PASSWORD='...' \\\n" +
      "  node scripts/browser-check.mjs",
  );
  process.exit(1);
}
const PASSWORD = process.env.CHECK_PASSWORD;
const ADMIN_USER = process.env.CHECK_ADMIN;
const PLAIN_USER = process.env.CHECK_USER;
const results = [];
let failures = 0;
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function login(page, username) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  // 客户端表单需要水合完成，否则点击可能被浏览器当作原生提交。
  await page.locator('button[type="submit"]').waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(300);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function open(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1").first().waitFor({ timeout: 20000 });
  return page.locator("body").innerText();
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const badRequests = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("response", (r) => { if (r.status() >= 400) badRequests.push(`${r.status()} ${new URL(r.url()).pathname}`); });

try {
  await page.goto(`${BASE}/today`, { waitUntil: "domcontentloaded" });
  check("未登录访问 /today 跳转登录", page.url().includes("/login"), page.url());

  await login(page, ADMIN_USER);
  check("管理员登录成功", !page.url().includes("/login"), page.url());

  for (const [path, marker] of [
    ["/today", "今天"],
    ["/inbox", "收件箱"],
    ["/tasks", "全部任务"],
    ["/completed", "已完成"],
    ["/settings/general", "通用"],
    ["/settings/email", "邮件"],
    ["/settings/push", "Webhook"],
    ["/settings/ai", "AI"],
    ["/settings/projects", "项目"],
    ["/settings/data", "账号资料"],
    ["/admin", "站点管理"],
  ]) {
    const body = await open(page, path);
    check(`页面 ${path} 正常渲染`, body.includes(marker) && !body.includes("Application error"), marker);
  }

  // 新建任务
  await open(page, "/inbox");
  const newTitle = `浏览器验收任务 ${Date.now()}`;
  await page.getByRole("button", { name: "新建任务" }).first().click();
  await page.locator("#task-title").fill(newTitle);
  await page.getByRole("button", { name: /创建任务/ }).click();
  await page.waitForTimeout(3000);
  await open(page, "/inbox");
  check("新建任务出现在列表", (await page.locator("body").innerText()).includes(newTitle), newTitle);

  // 打开详情并保存标题（验证串行保存与 revision）
  await page.getByText(newTitle, { exact: false }).first().click();
  const titleField = page.locator("#detail-title");
  await titleField.waitFor({ timeout: 10000 });
  const edited = `${newTitle} 已编辑`;
  await titleField.fill(edited);
  await titleField.blur();
  await page.waitForTimeout(2500);
  await open(page, "/inbox");
  check("详情修改标题后保存成功", (await page.locator("body").innerText()).includes(edited));

  // 站点设置在没有修改时禁用保存，验收不改动公共服务配置。
  await open(page, "/admin?tab=policy");
  const saveBtn = page.getByRole("button", { name: "保存配置", exact: true });
  check("站点设置未修改时不会重复保存", await saveBtn.isDisabled());

  // 账号资料保存（显示名称往返）
  await open(page, "/settings/data");
  const nameField = page.locator('input[name="displayName"]').first();
  const before = await nameField.inputValue();
  await nameField.fill(`${before}·`);
  await page.getByRole("button", { name: /保存资料/ }).click();
  await page.waitForTimeout(2000);
  await open(page, "/settings/data");
  check("账号资料保存成功", (await nameField.inputValue()) === `${before}·`, before);
  await nameField.fill(before);
  await page.getByRole("button", { name: /保存资料/ }).click();
  await page.waitForTimeout(1500);

  // 通用设置保存（个人偏好走 preference 载荷）
  await open(page, "/settings/general");
  const leadField = page.locator("#setting-lead");
  const leadBefore = await leadField.inputValue();
  await leadField.fill(String(Number(leadBefore) + 5));
  await page.getByRole("button", { name: /保存更改/ }).click();
  await page.waitForTimeout(2000);
  await open(page, "/settings/general");
  check("通用提醒默认值保存成功", (await leadField.inputValue()) === String(Number(leadBefore) + 5), leadBefore);
  await leadField.fill(leadBefore);
  await page.getByRole("button", { name: /保存更改/ }).click();
  await page.waitForTimeout(1500);

  // 普通用户：看不到站点管理，也不能进入
  await context.clearCookies();
  await login(page, PLAIN_USER);
  await open(page, "/settings/general");
  check("普通用户看不到站点管理入口", !(await page.locator("body").innerText()).includes("站点管理"));
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  check("普通用户访问 /admin 被拦截", !page.url().endsWith("/admin"), page.url());
  const res = await page.request.get(`${BASE}/api/settings?group=smtp`);
  check("普通用户读取 SMTP 配置被拒绝", res.status() === 403, String(res.status()));
  const chRes = await page.request.put(`${BASE}/api/settings`, { data: { group: "ai", value: { enabled: true }, expectedRevision: 0 } });
  check("普通用户写入站点配置被拒绝", chRes.status() === 403, String(chRes.status()));

  // 移动端布局
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/today");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("移动端无横向溢出", overflow <= 1, `overflow=${overflow}px`);
} catch (error) {
  check("脚本执行", false, error.message);
} finally {
  const realConsole = consoleErrors.filter((t) => !/favicon|manifest|ResizeObserver/.test(t));
  check("浏览器无控制台错误", realConsole.length === 0, realConsole.slice(0, 3).join(" | "));
  check("无异常网络响应", badRequests.length === 0, badRequests.slice(0, 5).join(" | "));
  await browser.close();
  console.log(results.join("\n"));
  console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} 通过`);
  process.exitCode = failures ? 1 : 0;
}

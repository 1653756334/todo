// 测试环境引导：在任何应用代码加载之前执行，保证 npm test 永远碰不到应用数据。
//
// 规则很简单，也很硬：
//   1. 数据库、Redis、对象桶一律取自 .env.test 的 TEST_*，不用 .env 里的同名值；
//   2. 库名必须以 _test 结尾，且不能与应用库相同，Redis 与桶也必须与应用不同；
//   3. 校验通过后，把 TEST_* 写进应用读取的变量名（DATABASE_URL / REDIS_URL / MINIO_BUCKET），
//      测试代码照常调用应用自己的模块，不需要知道自己跑在测试环境里。
//
// 这样即使 .env 指向生产库，npm test 也只会连测试库；配错时直接拒绝运行而不是硬跑。
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const HINTS = [
  "在仓库根目录执行：",
  "  ./scripts/service.sh infra-up      （建好测试库与测试桶，并生成 .env.test）",
  "或手动准备：",
  "  cp .env.test.example .env.test     （再按注释填写各项）",
];

function abort(reason, hints = HINTS) {
  console.error([`\n✗ 测试环境未就绪：${reason}`, ...hints.map(hint => `  ${hint}`), ""].join("\n"));
  process.exit(1);
}

function databaseName(url) {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    abort(`TEST_DATABASE_URL 不是合法的连接串：${url}`);
  }
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) abort("缺少 TEST_DATABASE_URL，测试不会使用 .env 里的 DATABASE_URL");
const testDatabase = databaseName(testDatabaseUrl);
if (!testDatabase.endsWith("_test")) abort(`测试库名必须以 _test 结尾，当前是 ${testDatabase}`);
if (process.env.DATABASE_URL === testDatabaseUrl) abort("TEST_DATABASE_URL 与应用库 DATABASE_URL 相同");

const testRedisUrl = process.env.TEST_REDIS_URL?.trim();
if (!testRedisUrl) abort("缺少 TEST_REDIS_URL（建议与应用用不同的库序号，如 /1）");
if (process.env.REDIS_URL === testRedisUrl) abort("TEST_REDIS_URL 与应用 Redis 相同，测试作业会被应用的 worker 取走");

const testBucket = process.env.TEST_MINIO_BUCKET?.trim();
if (!testBucket) abort("缺少 TEST_MINIO_BUCKET");
if (process.env.MINIO_BUCKET === testBucket) abort("TEST_MINIO_BUCKET 与应用桶相同，测试对象会写进应用桶");

process.env.DATABASE_URL = testDatabaseUrl;
process.env.REDIS_URL = testRedisUrl;
process.env.MINIO_BUCKET = testBucket;
process.env.NODE_ENV ||= "test";
process.env.TRUST_PROXY ||= "false";
process.env.APP_URL ||= "http://localhost:23330";

// 用应用自己的迁移文件把测试库结构补到最新（幂等，可跳过）。
if (process.env.TEST_SKIP_MIGRATE !== "1") {
  const migrate = spawnSync(resolve(root, "node_modules/.bin/prisma"), ["migrate", "deploy"], { cwd: root, env: process.env, encoding: "utf8" });
  if (migrate.status !== 0) {
    abort(`测试库 ${testDatabase} 迁移失败`, [
      migrate.stderr?.trim() || migrate.stdout?.trim() || "（没有输出）",
      "若库还不存在，先执行 ./scripts/service.sh infra-up",
    ]);
  }
}

const redisDatabase = new URL(testRedisUrl).pathname.replace(/^\//, "") || "0";
console.log(`测试环境：库 ${testDatabase} · Redis db${redisDatabase} · 桶 ${testBucket}`);

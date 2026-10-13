# Todo · 自托管多用户任务管理

多账号的任务管理器：每个账号有自己的任务、项目、通知渠道和 AI 额度，互相看不到内容；
粘贴邮件或截图，由站点配置的 AI 拆成待办草稿，确认后入库；到截止时间前通过邮件与
群机器人推送提醒。

- 自部署：PostgreSQL + Redis + MinIO，web 与 worker 同一份代码；
- 多账号隔离：所有业务表按账号分区，管理员能看到站点配置与用户列表，**看不到别人的任务、原文或截图**；
- 提醒可靠：逐渠道记录、租约投递、Outbox 兜底，Redis 丢作业也能重新排上；
- 许可证：MIT，见 [LICENSE](LICENSE)。

---

## 功能

| 功能 | 说明 |
| --- | --- |
| 账号 | 用户名 + 密码登录；邀请/重置/邮箱验证都是一次性令牌；会话可单独或全部失效 |
| 权限 | `ADMIN` / `USER` 两种角色；管理员能看到的是站点配置与用户列表，**看不到别人的任务、原文或截图** |
| 任务管理 | 标题、备注（Markdown）、项目、标签、优先级、截止时间或开始~截止的区间、链接 |
| 视图 | 今天（按区间与今天有交集判断，含逾期分组）、收件箱、全部任务（筛选 + 搜索 + 排序）、项目、已完成 |
| 键盘操作 | `N` 新建、`/` 搜索、`J/K` 移动、`X` 完成、`E` 编辑、`Esc` 关闭 |
| 粘贴生成 | 文字或图片 → AI 提取 → 逐条确认 → 入库；来源原文与截图可回看 |
| 链接识别 | 从邮件或截图提取笔试、测评、仓库等链接，入库为任务链接，行内可点开 |
| 提醒投递 | 邮件与群机器人并行；区间任务可分别提醒「开始前」与「截止前」；**逐渠道**记录与重试，某个渠道成功不会随另一个失败一起重发 |
| 按优先级分发 | 每条渠道各设一个触发优先级，任务优先级够才发；都不够时记为已取消并写明原因 |
| 站点管理 | SMTP、AI 接口与额度、注册与验证策略、通知开关、用户与配额 |
| 个人设置 | 时区、外观、默认提醒、通知渠道、账号资料、访问记录、数据导出 |
| 安装到桌面 | PWA：静态资源缓存、离线兜底页；**不缓存页面快照** |
| 导出 | 当前账号的任务/项目/标签/原文 JSON + 截图（ZIP） |

AI Key、SMTP 密码、机器人 webhook 与签名密钥用 AES-256-GCM 加密入库，
接口只返回「已配置」，不回显明文。站点凭据只有管理员能读取或测试。

---

## 架构

```
浏览器 ──► Next.js (web) ──► PostgreSQL        （权威状态：任务、配置、投递记录、Outbox）
   ▲            │
   │            ├──► Redis / BullMQ             （快速派发与重试调度）
   │            └──► MinIO (私有桶)             （导入截图）
   │                    ▲
   └── 提醒 ── worker ───┘
              ├──► SMTP ──► 邮箱
              └──► 群机器人 webhook ──► 微信 / 钉钉 / 飞书群
```

- **web 与 worker 是同一份代码的两个入口**：`src/server/*` 是业务模块（任务、项目、
  配置、通知、导入、AI、作业），web 通过 `src/app/api/*` 调用，worker 通过 `worker/main.ts` 调用。
- **数据库是权威状态**。Redis 只是加速手段：任务或配置写入时，同一个事务里往 `JobOutbox`
  写一条作业，worker 立即派发；如果 Redis 丢了作业，定期对账会按数据库重新发布。
- **投递是可恢复的「至少一次」**：`NotificationDelivery` 行带租约（`lockedUntil` +
  `claimToken`）与 `dispatchVersion`，两个 worker 不会同时发同一条；陷入僵死状态的租约会被
  回收重发。已经交给邮件服务器/群机器人 API 的消息无法收回，因此不承诺严格「恰好一次」。

---

## 快速开始

### 方式一：整栈跑在 Docker 里

```bash
cp .env.example .env
# 至少改这几项：
#   POSTGRES_PASSWORD / APP_SECRET / ENCRYPTION_KEY /
#   MINIO_ROOT_PASSWORD / MINIO_SECRET_KEY
# 随机值生成：openssl rand -hex 32

docker compose up -d --build
docker compose exec -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='至少十位' \
  -e ADMIN_DISPLAY_NAME=管理员 web npm run admin:init
```

打开 http://localhost:23330 登录。

Compose 会启动 postgres、redis、minio、`migrate`（一次性跑迁移）、web、worker。
`minio` 与 `init-storage` 用 `Dockerfile.storage` 从源码校验下载后构建，
因为 `minio/minio` 官方镜像已不再提供。

### 方式二：网页与调度跑在宿主机（推荐开发时用）

```bash
npm ci
cp .env.example .env            # 填好 DATABASE_URL / POSTGRES_PASSWORD / REDIS_URL /
                                # APP_SECRET / ENCRYPTION_KEY / MINIO_*

./scripts/service.sh infra-up   # 只起 postgres + redis + minio，并建好私有桶与应用账号
npm run db:migrate
ADMIN_USERNAME=admin ADMIN_PASSWORD='至少十位的密码' npm run admin:init

npm run build
npm run worker:build
./scripts/service.sh start      # web 与 worker，端口取自 .env 的 PORT
```

打开 http://localhost:${PORT:-23330} 登录。`infra-up` 还会顺带准备好测试用的数据库与对象桶
（见 [验证](#验证)）。

---

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `POSTGRES_PASSWORD` | 是 | Compose 里建库用，需与 `DATABASE_URL` 中的密码一致 |
| `REDIS_URL` | 是 | Redis 连接串，BullMQ 与限流共用 |
| `APP_SECRET` | 是 | 会话签名密钥，至少 16 字符；修改后所有登录失效 |
| `ENCRYPTION_KEY` | 是 | 加密站点凭据与渠道密钥的主密钥；修改后需重新填写这些密钥 |
| `APP_URL` | 是 | 邮件与推送里链接的前缀，也用于同源校验（CSRF） |
| `TRUST_PROXY` | 否 | 放在反向代理后面时设为 `true`，登录限流才按 `X-Forwarded-For` 取真实 IP |
| `MINIO_ENDPOINT` | 是 | 对象存储地址，如 `http://127.0.0.1:29000` |
| `MINIO_BUCKET` | 是 | 私有桶名，默认 `todo-private` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | 是 | 应用账号，只有该桶的读写删权限；不要用 root 账号 |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | 是 | 仅 Compose 初始化用 |
| `PORT` | 否 | 网页端口，默认 23330；`service.sh start` 从 `.env` 读取。放在反向代理/隧道后面时必须与隧道指向的端口一致 |
| `COMPOSE_PROJECT_NAME` | 否 | Compose 项目名，决定容器与数据卷前缀；生产与测试用不同名字即可隔离数据 |

初始化管理员还会读 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`ADMIN_DISPLAY_NAME`。
测试用的 `TEST_*` 单独放在 `.env.test`，见 [验证](#验证)。

改密码不需要动 `.env`：登录后在 **设置 → 账号与数据** 改，或由管理员生成重置链接。

---

## 首次初始化与账号

```bash
# 空库首次建管理员（已有账号时会拒绝，不会覆盖）
ADMIN_USERNAME=admin ADMIN_PASSWORD='至少十位' ADMIN_DISPLAY_NAME='管理员' npm run admin:init
```

- **注册默认关闭**。需要时由管理员在 **站点管理 → 注册与通知策略** 打开。
- 开启「新账号需验证邮箱」后，注册时必须填邮箱并点确认链接；这条策略要求先配好 SMTP。
- 邀请与重置：**站点管理 → 用户** 生成一次性链接（也可选直接发邮件）。
  手工转发的链接只证明「拿到链接」，不等于验证了邮箱。
- 每个账号可绑定一个可选邮箱，用于找回密码和接收渠道验证；不绑定也能正常用任务功能。
- 管理员可以停用账号、调整每日 AI 额度、让某个账号的所有会话立即失效；
  系统保证至少保留一个启用的管理员。

---

## 使用

### 粘贴文字或图片生成待办

1. 管理员先在 **站点管理 → 站点 AI 服务** 填接口地址、API Key、模型并点「测试连接」；
   需要给普通用户用就打开「向普通用户开放」。
2. 点顶栏「粘贴内容」，粘贴邮件正文、需求或截图，也可以只放图片。
   支持 PNG/JPG/WebP，最多 5 张、单张 5 MB、总计 10 MB。
3. 进入确认页：每条可改标题、项目、优先级、时间，也可取消勾选；
   链接必须逐字来自原文或截图，不会补全或编造；原文没有明确时间时**不会自动编造时间**。
4. 点「加入 N 条」正式入库。确认这一步带 `clientMutationId`，重复提交只入库一次。

截图会上传到 MinIO 私有桶，按账号前缀隔离，只能通过带会话校验的接口读取。
取消草稿或长期未确认的图片会走后台清理任务删除对象。

**额度**：站点设置里有「默认每日次数」和「最多并发调用」，管理员还能给单个账号单独设额度。
每次调用先预占、成功后计入已用；超时这类无法确定结果的情况记为 UNKNOWN，避免靠重试绕过上限。

### 任务时间：一个时刻，或一段时间

- 新建任务与详情面板的时间都是两个输入框：填上 **开始时间** 就变成一段
  「开始 ~ 截止」的时间窗口，只填 **截止时间** 就是一个时间点
  （开始时间必须早于截止时间，两边都能单独清除；只填了开始时间会提示还需要截止时间，不会保存）。
- **今天** 页按「和今天有交集」判断：区间今天开始、今天还在进行、或今天结束都会出现在今天；
  列表按开始时间排，没有区间的任务按截止时间排。
- 落在区间里（过了开始时间、还没到截止时间）的任务会显示 **进行中**。
  这只是时间到了的标记，**不会**替你把任务状态改成进行中。
- 时间用日期时间选择器设置，输入之后立刻保存，不需要额外的「保存」步骤。

### 提醒与通知渠道

- **邮件通知**：先由管理员在 **站点管理 → 站点邮件服务** 配置 SMTP；用户再到
  **设置 → 邮件通知** 添加自己的收件邮箱（需要点确认链接验证）并启用。
- **推送渠道**：**设置 → 推送渠道** 可添加多条群机器人（企业微信 / 钉钉 / 飞书 / 自定义 webhook），
  标签可以重复，各自设启用状态、触发优先级和简略模式。
- 每条渠道都有自己的 **触发优先级**：任务优先级够才发这个渠道；一个都不够时这次提醒记为
  **已取消** 并写明原因，不计失败、不重试。
- 发送是**逐渠道**的：成功的不重发，失败的单独按 1 分钟 / 5 分钟退避重试，共 3 次。
  提醒记录里能看到每个渠道的最终状态，失败时可在任务详情点「重新发送」。
- 提醒按**锚点**分开：有区间的任务会排「开始前」和「截止前」两条，各自设提前分钟数
  （开始前默认 0 分钟，即到点提醒）；只有一个截止时间的任务仍然只有一条。
  改期、改提前量或换渠道时，已经发出去的那条不会被当成新提醒重发。
- 管理员可以用「注册与通知策略」里的开关整体暂停某类通知；被暂停时用户无法新启用该类型渠道，
  但已有渠道的配置会保留。
- 任务详情会预告这次会走哪些渠道，例如「通知渠道：推送（邮件需「高」）」。

### 状态与调度

- 调度进程每 30 秒左右更新一次心跳，**设置 → 通用 → 提醒服务** 据此显示「运行中 / 暂不可用」；
  优雅退出时会删除自己的心跳行，不会留下假在线。
- 修改开始时间、截止时间、提醒提前量、关闭提醒、完成任务、删除任务都会立即重算或取消对应提醒，
  重算与任务写入在同一个事务里完成。
- 进程重启或 Redis 丢失作业时，会按数据库的 `JobOutbox` 与未完成的投递记录重新排上。
- 停机期间错过的提醒按策略补发一次（宽限小时数可在站点策略里调）。

---

## 运维

### 进程管理

```bash
./scripts/service.sh infra-up    # postgres + redis + minio（并初始化桶与账号）
./scripts/service.sh infra-status
./scripts/service.sh test-env    # 只准备测试库与测试桶（见「验证」）
./scripts/service.sh start       # web（端口取自 .env 的 PORT）+ worker
./scripts/service.sh status
./scripts/service.sh restart
./scripts/service.sh stop        # 先停 worker（优雅退出），再停 web
./scripts/service.sh logs
```

`web` 与 `worker` 缺一不可：只跑 web 时任务和界面正常，但不会发出提醒。
worker 收到 `SIGTERM` 会先把手上的投递做完再退出（Compose 里 `stop_grace_period: 45s`）。
进程 id 写在 `.run/web.pid`、`.run/worker.pid`。

### 备份

- 数据库：`docker compose exec postgres pg_dump -U todo todo > backup.sql`
- 截图：备份 `minio-data` 卷，或对桶做 `mc mirror`。
- 用户自助导出：**设置 → 账号与数据 → 导出数据**（ZIP：JSON + 截图）。

恢复时先还原数据库、再还原对象存储，最后跑一次 `npm run db:migrate` 确认结构一致。

### 巡检

- `GET /api/health` 只报告进程与数据库可用性，不暴露业务数据。
- `npm run db:migrate` 幂等，可安全重复执行。
- `JobOutbox` 里 `processedAt` 为空且长时间未处理的记录说明派发卡住；worker 的
  对账循环会自动重新发布，持续堆积则应查 Redis 连接与 worker 日志。

---

## 验证

```bash
npm run typecheck        # 网页与共享代码
npm run typecheck:worker # worker 独立 TypeScript 配置
npm run lint
npm test                 # 集成测试：账号隔离、权限、事务/并发、投递租约与重试、
                         # Outbox 重建、导入幂等、对象删除、AI 预算、数据库排序分页
npm run build
npm run worker:build
```

**测试不会碰应用数据。** `npm test` 只认 `.env.test` 里的三个 `TEST_*`：

| 变量 | 说明 |
| --- | --- |
| `TEST_DATABASE_URL` | 测试库连接串；**库名必须以 `_test` 结尾**，且不能与应用库相同 |
| `TEST_REDIS_URL` | 测试用 Redis（换个库序号，如 `/1`），测试作业不会被应用的 worker 取走 |
| `TEST_MINIO_BUCKET` | 测试用对象桶，必须与应用桶不同 |

数据库之外的对象存储地址与账号沿用 `.env` 的 `MINIO_*`，只换桶名。
启动时会校验这几项：缺配置、库名不以 `_test` 结尾、或与应用资源重名，都会**直接拒绝运行**
并打印修复命令，绝不会退回到 `.env` 里的应用库。校验通过后，测试库结构由应用自己的
迁移文件自动补齐。

准备测试环境有两种方式，任选其一：

```bash
./scripts/service.sh infra-up          # 建好测试库与测试桶，并生成 .env.test
# 或者
cp .env.test.example .env.test         # 按注释手填三项
npm test
```

浏览器验收（需要先起 web，并准备好一个管理员与一个普通用户）：

```bash
CHECK_BASE=http://localhost:23330 \
CHECK_ADMIN=你的管理员用户名 CHECK_USER=某个普通用户名 CHECK_PASSWORD='...' \
node scripts/browser-check.mjs
```

覆盖：未登录跳转、各页面渲染、新建与编辑任务、站点配置的保存状态、账号资料保存、
通用偏好保存、普通用户看不到/进不去站点管理且被接口拒绝、移动端无横向溢出、无控制台错误。

完整的产品交互验收会自动创建临时账号与数据，结束后清理；无需事先准备账号。
在测试实例启动后运行（`CHECK_BASE` 应与该实例的 `APP_URL` 一致）：

```bash
CHECK_BASE=http://localhost:23330 npm run test:ui
```

覆盖通知渠道的添加、校验、编辑与删除，用户额度明确保存，项目取消修改，
任务自动保存与失败重试、分页后编辑、批量移动，弹窗与折叠过渡动画，以及桌面和手机布局。
不会发送邮件、Webhook 或实际调用 AI；截图和结果保存在 `.run/ui-artifacts/`。

CI（`.github/workflows/ci.yml`）会跑上面全部检查：`check` 任务做类型、规范与构建，
`test` 任务用仓库自带的 Compose 起一套 PostgreSQL + Redis + MinIO 再跑 `npm test`。

---

## 部署

### 通用部署建议

- 也可以整栈 `docker compose up -d --build`；镜像里 web 与 worker 用同一份构建产物。
- 反向代理层强制 HTTPS，并设 `TRUST_PROXY=true`。
- `APP_URL` 改成公网地址，否则邮件与推送里的链接会指向 `localhost`。
- worker 可以跑多个副本：投递行有租约，不会重复发送同一条；但**同一个账号的提醒顺序不作保证**。
- Postgres、Redis、MinIO 的数据卷都要纳入备份。
- `web` 与 `worker` 需要常驻；用 systemd、supervisor 或你熟悉的进程管理器托管
  `./scripts/service.sh start` 即可，容器本身已经带 `restart: unless-stopped`。

### 安装到桌面（PWA）

| 设备 | 怎么装 |
| --- | --- |
| Android / Chrome 桌面 | 打开网页后会弹「把 Todo 装到桌面」，也可在浏览器菜单里选「安装应用」 |
| iPhone / iPad | Safari → 分享 → 「添加到主屏幕」 |
| 桌面 Edge / Chrome | 地址栏右侧的安装图标 |

离线策略是刻意保守的，因为一个实例可能被多个人共用：

- 静态资源缓存优先；
- **页面 HTML / RSC / 接口响应 / 导入图片一律不缓存**，共用设备上不会留下上一个会话的内容；
- 断网时只落到 `/offline` 说明页（预缓存在 Service Worker 里）；
- 升级到新版本时，激活阶段会删掉旧版遗留的页面快照缓存。

改图标后跑 `node scripts/generate-icons.mjs`，并把 `src/app/layout.tsx` 里清单的 `?v=N`
与 `public/sw.js` 的 `VERSION` 各加一。同一个脚本也生成长按桌面图标弹出的快捷方式
图标（`icons/shortcut-*.png`），字形取自界面里用的那套 lucide 图标。

---

## 安全说明

- 密码用 scrypt 哈希（异步实现，避免阻塞事件循环）；会话用 HMAC-SHA256 签名，
  Cookie 为 `HttpOnly + SameSite=Lax`；`sessionVersion` 变化即让旧会话失效。
- 写操作要求 `x-requested-with: todo` 头，并校验 `Origin` 与 `APP_URL` 同源。
- 登录失败按 IP 与用户名限流，记录写库，重启不清零。
- 站点凭据（SMTP 密码、AI Key）只有管理员能读；测试接口也要求管理员，
  避免普通用户借站点凭据发起模型调用从而绕过额度。
- 所有查询都以 `ownerId` 为基本过滤条件；管理员**不会**因此获得别人私有任务的读权限。
- 外发 webhook 走 SSRF 防护（只允许 http/https、禁止凭据、解析并拦截内网地址）。
- 截图对象键带账号前缀，读取接口逐个校验归属与草稿状态。

---

## 目录结构

```
compose.yaml                       PostgreSQL + Redis + MinIO 编排
compose.host.yaml                  把基础设施端口暴露到 127.0.0.1，供宿主机上的 web/worker 连接
Dockerfile / Dockerfile.storage   web+worker 镜像 / 从源码构建 MinIO 与 mc
.github/workflows/ci.yml          类型、规范、构建与集成测试
prisma/schema.prisma              多用户数据模型
prisma/migrations/                建表、约束、幂等字段、优先级枚举
src/app/(app)/                    登录后的页面：任务视图、设置、站点管理
src/app/api/                      接口
src/app/account/                  邀请/重置/验证令牌落地页
src/server/adapters/              会话与 HTTP 适配层
src/server/auth/                  账号、令牌、密码与加密
src/server/tasks|projects/        任务与项目写入、查询与排序分页
src/server/settings/              站点配置与个人偏好
src/server/notifications/         提醒计划、投递、邮件与 webhook 传输
src/server/imports/               导入草稿、截图与清理
src/server/ai/                    模型调用、额度预占与结算
src/server/jobs/                  Outbox 派发、对账与维护
src/server/infra/                 数据库、队列、对象存储、HTTP 客户端、日志
src/shared/                       浏览器与服务端共用的校验、时间、类型
src/components/                   界面组件（含 Radix 包装的控件）
worker/main.ts                    BullMQ 调度入口（构建为 dist/worker.mjs）
scripts/init-admin.ts             初始化管理员
scripts/service.sh                本地进程与基础设施管理
scripts/browser-check.mjs         浏览器验收脚本
test/                             集成测试（含 test/setup.mjs 的测试环境引导）
.env.test.example                 测试环境配置示例
```

---

## 许可

[MIT](LICENSE)

#!/usr/bin/env bash
# 管理多用户版的两类进程：
#   infra  —— PostgreSQL / Redis / MinIO（Docker Compose）
#   web    —— Next.js 网页与 API
#   worker —— BullMQ 调度进程（提醒投递、Outbox 派发、维护任务）
#
#   ./scripts/service.sh infra-up|infra-down|infra-status|test-env|start|stop|restart|status|logs
#
# 网页与调度进程默认跑在宿主机上（compose 只提供基础设施），
# 端口、数据库连接等项目参数统一从仓库根目录的 .env 读取。
set -uo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
RUN_DIR="$ROOT/.run"
LOG_DIR="$ROOT/logs"

# 先加载 .env，让 PORT / COMPOSE_PROJECT_NAME / MINIO_* 等对脚本和 compose 都生效。
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

WEB_PORT="${PORT:-23330}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$ROOT")}"
COMPOSE="docker compose -p $COMPOSE_PROJECT -f $ROOT/compose.yaml -f $ROOT/compose.host.yaml"
NODE_BIN="$(command -v node)"
NEXT_BIN="$ROOT/node_modules/next/dist/bin/next"

mkdir -p "$RUN_DIR" "$LOG_DIR"

web_pid_file="$RUN_DIR/web.pid"
worker_pid_file="$RUN_DIR/worker.pid"

is_running() {
  local pid_file="$1"
  [ -f "$pid_file" ] || return 1
  local pid
  pid="$(cat "$pid_file" 2>/dev/null)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

start_one() {
  local name="$1" pid_file="$2" log_file="$3"
  shift 3
  if is_running "$pid_file"; then
    echo "$name 已在运行（pid $(cat "$pid_file")）"
    return 0
  fi
  setsid nohup "$@" > "$log_file" 2>&1 < /dev/null &
  echo $! > "$pid_file"
  sleep 1
  if is_running "$pid_file"; then
    echo "$name 已启动（pid $(cat "$pid_file")），日志：$log_file"
  else
    echo "$name 启动失败，请查看 $log_file"
    return 1
  fi
}

stop_one() {
  local name="$1" pid_file="$2"
  if is_running "$pid_file"; then
    local pid
    pid="$(cat "$pid_file")"
    kill "$pid" 2>/dev/null
    for _ in $(seq 1 30); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.3
    done
    kill -9 "$pid" 2>/dev/null
    echo "$name 已停止（pid $pid）"
  else
    echo "$name 未在运行"
  fi
  rm -f "$pid_file"
}

# 测试环境（npm test）使用的独立数据库与对象桶。
# 与应用资源完全分开，测试可以放心地建、删数据；已存在时重复执行无副作用。
prepare_test_env() {
  local test_db="${TEST_DB_NAME:-todo_test}"
  local test_bucket="${TEST_MINIO_BUCKET:-todo-test}"

  if $COMPOSE exec -T postgres psql -U todo -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname='$test_db'" 2>/dev/null | grep -q 1; then
    echo "测试库 $test_db：已存在"
  elif $COMPOSE exec -T postgres createdb -U todo "$test_db" 2>/dev/null; then
    echo "测试库 $test_db：已创建"
  else
    echo "测试库 $test_db：创建失败（可手动 createdb，否则 npm test 会拒绝运行）"
  fi

  # 应用账号原本只被授权访问应用桶，这里再补一条只覆盖测试桶的策略，不动原策略。
  if $COMPOSE run --rm --no-deps --entrypoint /bin/sh init-storage -ec "
    until mc alias set local http://minio:9000 \"\$MINIO_ROOT_USER\" \"\$MINIO_ROOT_PASSWORD\"; do sleep 2; done
    mc mb --ignore-existing local/$test_bucket >/dev/null
    mc anonymous set none local/$test_bucket >/dev/null
    printf '{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\"],\"Resource\":[\"arn:aws:s3:::$test_bucket/*\"]},{\"Effect\":\"Allow\",\"Action\":[\"s3:ListBucket\"],\"Resource\":[\"arn:aws:s3:::$test_bucket\"]}]}' > /tmp/todo-test-policy.json
    mc admin policy create local todo-assets-test /tmp/todo-test-policy.json >/dev/null 2>&1 || true
    mc admin policy attach local todo-assets-test --user \"\$MINIO_ACCESS_KEY\" >/dev/null 2>&1 || true
  " >/dev/null 2>&1; then
    echo "测试桶 $test_bucket：已就绪"
  else
    echo "测试桶 $test_bucket：准备失败（否则 npm test 会拒绝运行）"
  fi

  if [ -f "$ROOT/.env.test" ]; then
    echo ".env.test：已存在，未改动"
    return 0
  fi
  if [ -z "${DATABASE_URL:-}" ] || [ -z "${REDIS_URL:-}" ]; then
    echo ".env.test：未生成（.env 里缺少 DATABASE_URL 或 REDIS_URL，可照 .env.test.example 手写）"
    return 0
  fi
  # 从应用连接串推导测试连接串：只换库名与 Redis 库序号，主机与端口保持与 .env 一致。
  local redis_url="$REDIS_URL"
  case "$redis_url" in
    */[0-9]|*/[0-9][0-9]) redis_url="${redis_url%/*}" ;;
  esac
  cat > "$ROOT/.env.test" <<EOF
# 由 scripts/service.sh infra-up 生成，可按需修改；内容不会进版本库。
TEST_DATABASE_URL=${DATABASE_URL%/*}/$test_db
TEST_REDIS_URL=$redis_url/1
TEST_MINIO_BUCKET=$test_bucket
EOF
  echo ".env.test：已生成（测试专用配置）"
}

infra_up() {
  $COMPOSE up -d postgres redis minio
  $COMPOSE up --exit-code-from init-storage init-storage
  prepare_test_env
}

case "${1:-status}" in
  infra-up)
    infra_up
    ;;
  infra-down)
    $COMPOSE down
    ;;
  infra-status)
    $COMPOSE ps postgres redis minio
    ;;
  test-env)
    prepare_test_env
    ;;
  start)
    if [ ! -f "$ROOT/.next/BUILD_ID" ]; then
      echo "尚未构建网页，请先执行 npm run build"
      exit 1
    fi
    if [ ! -f "$ROOT/dist/worker.mjs" ]; then
      echo "尚未构建调度进程，请先执行 npm run worker:build"
      exit 1
    fi
    start_one "网页" "$web_pid_file" "$LOG_DIR/web.log" \
      "$NODE_BIN" --env-file-if-exists="$ROOT/.env" "$NEXT_BIN" start -p "$WEB_PORT"
    start_one "调度" "$worker_pid_file" "$LOG_DIR/worker.log" \
      "$NODE_BIN" --env-file-if-exists="$ROOT/.env" "$ROOT/dist/worker.mjs"
    ;;
  stop)
    # 先停调度：让进行中的投递走完优雅退出，再停网页。
    stop_one "调度" "$worker_pid_file"
    stop_one "网页" "$web_pid_file"
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    if is_running "$web_pid_file"; then
      echo "网页：运行中（pid $(cat "$web_pid_file")）http://localhost:$WEB_PORT"
    else
      echo "网页：未运行"
    fi
    if is_running "$worker_pid_file"; then
      echo "调度：运行中（pid $(cat "$worker_pid_file")）"
    else
      echo "调度：未运行"
    fi
    $COMPOSE ps postgres redis minio 2>/dev/null || true
    ;;
  logs)
    echo "=== logs/web.log ==="
    tail -n 40 "$LOG_DIR/web.log" 2>/dev/null
    echo "=== logs/worker.log ==="
    tail -n 40 "$LOG_DIR/worker.log" 2>/dev/null
    ;;
  *)
    echo "用法：$0 infra-up|infra-down|infra-status|test-env|start|stop|restart|status|logs"
    exit 1
    ;;
esac

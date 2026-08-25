#!/usr/bin/env bash
# ============================================================
# home-lb 一键部署 / 升级脚本（Linux 服务器）
# 用法：./deploy.sh
# 功能：自动生成密钥 → 构建并启动 → 等待健康检查 → 输出状态
# 升级流程：git pull 后再次运行本脚本即可
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=".env.deploy"
CONTAINER="home-lb"

# ---------- 1. 自动准备环境变量（无需手动配置） ----------
# 首次运行自动生成 .env.deploy 并填入随机密钥；密钥已自定义时不会覆盖
if [ ! -f "$ENV_FILE" ]; then
  cp .env.deploy.example "$ENV_FILE"
fi

# 同时识别新旧占位符（change-me 为早期版本示例值，__GENERATE_RANDOM_KEY__ 为当前哨兵值），
# 并容忍带引号写法（NEXTAUTH_SECRET="__GENERATE_RANDOM_KEY__"）；二者均为公开已知弱密钥，必须替换
if grep -Eq 'NEXTAUTH_SECRET=["'\'']?(change-me|__GENERATE_RANDOM_KEY__)' "$ENV_FILE"; then
  # openssl 缺失时回退 /dev/urandom（Alpine 等最小化系统可能无 openssl）
  SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | tr -dc 'a-f0-9' | head -c 64)
  tmpfile=$(mktemp)
  sed "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${SECRET}|" "$ENV_FILE" > "$tmpfile"
  mv "$tmpfile" "$ENV_FILE"
  echo "==> 已自动生成随机 NEXTAUTH_SECRET"
else
  echo "==> NEXTAUTH_SECRET 已存在，跳过生成"
fi

# ---------- 2. 构建并启动 ----------
echo "==> 构建并启动服务..."
docker compose --env-file "$ENV_FILE" up -d --build

# ---------- 3. 等待健康检查 ----------
echo "==> 等待服务就绪（最长 120s）..."
for i in $(seq 1 24); do
  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    sleep 5
    continue
  fi
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER" 2>/dev/null || echo "none")
  if [ "$health" = "healthy" ]; then
    echo "✅ 服务已就绪（healthy）"
    docker compose --env-file "$ENV_FILE" ps
    exit 0
  fi
  if [ "$health" = "unhealthy" ]; then
    echo "❌ 健康检查失败，请查看日志：docker compose --env-file ${ENV_FILE} logs -f"
    exit 1
  fi
  sleep 5
done

echo "❌ 等待超时，请查看日志：docker compose --env-file ${ENV_FILE} logs -f"
exit 1

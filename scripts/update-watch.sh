#!/usr/bin/env bash
# ============================================================
# home-lb 更新/回滚执行器（宿主机侧，由 cron 每分钟调用一次）
# 作用：轮询 data/deploy/request.json（应用后台写入的握手请求），
#       认领后备份数据库 → git 切换到目标版本 → 重建重启容器 → 写回执行结果，
#       并维护 data/deploy/versions.json 的版本权威记录。
#
# 安装（建议装到仓库之外，避免更新切 tag 时被覆盖）：
#   sudo cp scripts/update-watch.sh /usr/local/bin/home-lb-update
#   sudo chmod +x /usr/local/bin/home-lb-update
#   crontab -e 添加（必须指定 REPO_DIR 为部署仓库目录）：
#       * * * * * flock -n /tmp/home-lb-update.lock env \
#                    REPO_DIR=/home/yourname/home-lb \
#                    /usr/local/bin/home-lb-update >/dev/null 2>&1
# 也可直接置于仓库 scripts/ 内运行：此时自动以仓库目录为 REPO_DIR。
# ============================================================
set -euo pipefail

# ---------- 可覆盖配置 ----------
# 仓库目录（含 .git、docker-compose.yml、deploy.sh、data/ 的部署目录）
REPO_DIR="${REPO_DIR:-}"
if [ -z "$REPO_DIR" ]; then
  _scr="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  _cand="$(cd "$_scr/.." && pwd)"
  if [ -f "$_cand/docker-compose.yml" ] && [ -d "$_cand/data" ]; then
    REPO_DIR="$_cand"
  else
    for _c in "$PWD" "$HOME/home-lb"; do
      if [ -f "$_c/docker-compose.yml" ] && [ -d "$_c/data" ]; then REPO_DIR="$_c"; break; fi
    done
  fi
fi
[ -n "$REPO_DIR" ] || { echo "未定位到仓库目录，请设置 REPO_DIR=/path/to/home-lb" >&2; exit 1; }
REPO_DIR="$(cd "$REPO_DIR" && pwd)"
# 数据目录（内含 prod.db 与 deploy/），默认 docker-compose 映射的 ./data
DATA_DIR="${DATA_DIR:-$REPO_DIR/data}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.deploy}"
CONTAINER="home-lb"
# 镜像更新模式使用的 GHCR 镜像仓库（发布时自动推送）
GHCR_IMAGE="${GHCR_IMAGE:-ghcr.io/sxlb/home-lb-c}"
DEPLOY_DIR="$DATA_DIR/deploy"
BACKUP_DIR="$DEPLOY_DIR/backups"

# ---------- 工具函数 ----------

log()  { echo "[$(date '+%F %T')] $*"; }
fail() { log "✗ $*"; exit 1; }

# 从格式化 JSON 中提取字符串字段值（键值独占一行的写法）。输出无引号的原始值。
json_get() { # file key
  sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$1" | head -1
}

now_ts() { date '+%Y%m%d-%H%M%S'; }

# 更新 versions.json：记录一次操作历史，并更新 currentVersion。
# 优先用 python3，缺失时回退 node（二者在现代 Linux 上通常至少其一）。
update_versions() { # version action
  local version="$1" action="$2" at
  at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local vf="$DEPLOY_DIR/versions.json"
  mkdir -p "$DEPLOY_DIR"
  if [ -f "$vf" ]; then
    if command -v python3 >/dev/null 2>&1; then
      python3 - "$vf" "$version" "$action" "$at" <<'PY'
import json,sys
vf,version,action,at=sys.argv[1:5]
try:
    d=json.load(open(vf,'r',encoding='utf-8'))
except Exception:
    d={"currentVersion":"unknown","updatedAt":"","history":[]}
d.setdefault("history",[])
d["history"].append({"version":version,"action":action,"at":at})
d["currentVersion"]=version
d["updatedAt"]=at
json.dump(d,open(vf,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
PY
    elif command -v node >/dev/null 2>&1; then
      node -e '
        const fs=require("fs");const [vf,v,a,at]=process.argv.slice(2);
        let d={currentVersion:"unknown",updatedAt:"",history:[]};
        try{d=JSON.parse(fs.readFileSync(vf,"utf8"));}catch(e){}
        d.history=d.history||[];d.history.push({version:v,action:a,at});
        d.currentVersion=v;d.updatedAt=at;
        fs.writeFileSync(vf,JSON.stringify(d,null,2));
      ' "$vf" "$version" "$action" "$at"
    else
      fail "缺少 python3 / node，无法维护 versions.json"
    fi
  else
    # 首次：写基线
    printf '{\n  "currentVersion": "%s",\n  "updatedAt": "%s",\n  "history": [{"version": "%s", "action": "%s", "at": "%s"}]\n}\n' \
      "$version" "$at" "$version" "$action" "$at" > "$vf"
  fi
}

# 备份当前数据库（更新/回滚前各存一份，作为回档数据点）
backup_db() { # sourceVersion
  local srcVersion="$1"
  mkdir -p "$BACKUP_DIR"
  local db="$DATA_DIR/prod.db"
  [ -f "$db" ] || return 0
  local dest="$BACKUP_DIR/prod-${srcVersion}-$(now_ts).db"
  cp -f "$db" "$dest"
  log "已备份数据库 → ${dest}"
  # 只保留最近 20 份快照，避免侵占磁盘
  ls -1t "$BACKUP_DIR"/prod-*.db 2>/dev/null | tail -n +21 | xargs -r rm -f
}

# 恢复数据库到某版本快照（回滚用）。找不到快照则仅切代码、保持数据库不变。
restore_db() { # targetVersion
  local target="$1"
  local snap
  snap=$(ls -1t "$BACKUP_DIR"/"prod-${target}-"*.db 2>/dev/null | head -1)
  if [ -z "$snap" ]; then
    log "警告：未找到 ${target} 的数据库快照，回滚保持现有数据库（仅切换代码）"
    return 0
  fi
  local db="$DATA_DIR/prod.db"
  # 先清理 WAL/SHM 残留，避免新旧数据文件混用导致损坏
  rm -f "$db-wal" "$db-shm"
  cp -f "$snap" "$db"
  log "已恢复数据库 → ${db}（来源 ${snap}）"
}

# 写回执行结果（应用侧 readLatestResult 读取 result-*.json）
write_result() { # id action version method status message
  local vf="$DEPLOY_DIR/result-$1.json"
  printf '{\n  "id": "%s",\n  "action": "%s",\n  "version": "%s",\n  "method": "%s",\n  "status": "%s",\n  "message": "%s",\n  "at": "%s"\n}\n' \
    "$1" "$2" "$3" "$4" "$5" "$6" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$vf.tmp"
  mv "$vf.tmp" "$vf"
  log "执行结果已写回 → ${vf}"
}

# ---------- 认领并执行一次请求 ----------
request="$DEPLOY_DIR/request.json"
[ -f "$request" ] || exit 0   # 无待执行请求，本次调度直接退出

req_id=$(json_get "$request" id)
action=$(json_get "$request" action)
version=$(json_get "$request" version)
# 更新方式：build=服务器自建构建 / image=拉取 GHCR 镜像。缺省/未知回退 build
req_method=$(json_get "$request" method)
case "$req_method" in
  image) req_method=image ;;
  *) req_method=build ;;
esac
log "发现请求：action=${action} method=${req_method} version=${version} id=${req_id}"

# 认领：防止 cron 并发重复执行（rename 是原子操作）
[ -f "$DEPLOY_DIR/running-${req_id}.json" ] && exit 0
if ! mv "$request" "$DEPLOY_DIR/running-${req_id}.json"; then
  fail "认领请求失败（可能已被其它进程认领）"
fi
running="$DEPLOY_DIR/running-${req_id}.json"

# 校验动作
case "$action" in
  update|rollback) ;;
  *) write_result "$req_id" "$action" "$version" "$req_method" failed "未知动作类型: $action"; exit 0;;
esac

cd "$REPO_DIR"
[ -f docker-compose.yml ] || fail "未在仓库目录运行：缺少 docker-compose.yml"
command -v git >/dev/null 2>&1 || fail "缺少 git 命令"

# 当前基线版本（从 versions.json 读取，缺失则回退 git describe）
cur=$(sed -n 's/.*"currentVersion"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$DEPLOY_DIR/versions.json" 2>/dev/null | head -1)
[ -n "$cur" ] || cur=$(git describe --tags --abbrev=0 2>/dev/null || echo "unknown")

log "当前基线版本：$cur，目标版本：$version"

# 1) 拉取远程 tag 并切换到目标版本
log "拉取远程 tags..."
git fetch --all --tags --prune >/dev/null 2>&1 || log "警告：git fetch 失败，将使用本地已有 tag"

if git rev-parse -q --verify "refs/tags/$version" >/dev/null 2>&1; then
  log "切换到版本 $version"
  git checkout "$version" >/dev/null 2>&1 || { write_result "$req_id" "$action" "$version" "$req_method" failed "git 切换失败，请检查版本号是否已发布"; exit 0; }
else
  write_result "$req_id" "$action" "$version" "$req_method" failed "目标版本 $version 不存在（未发布或未推送 tag）"
  exit 0
fi

# 2) 优雅停止容器：让 SQLite WAL 落盘，保证后续数据库读写（备份/恢复）处于一致状态
log "停止容器（等待未落盘写入收尾）..."
docker compose --env-file "$ENV_FILE" stop || { write_result "$req_id" "$action" "$version" "$req_method" failed "停止容器失败"; exit 0; }

# 3) 备份当前版本数据库（回档数据点）
backup_db "$cur"

# 4) 回滚时：把数据库恢复到目标版本的快照（代码与数据一同回退）
if [ "$action" = "rollback" ]; then
  restore_db "$version"
fi

# 5) 重建并启动容器（按更新方式分流：build=本地构建 / image=拉取发布镜像）
#    无论哪种方式，均注入 APP_VERSION=目标版本，让容器内"当前版本"与发布版本一致。
if [ "$req_method" = "image" ]; then
  log "镜像更新模式：拉取 ${GHCR_IMAGE}:${version} 并重启容器..."
  IMAGE_TAG="$version" APP_VERSION="$version" docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.image.yml pull \
    || { write_result "$req_id" "$action" "$version" "$req_method" failed "拉取镜像失败，请检查网络与 GHCR 仓库访问权限"; exit 0; }
  IMAGE_TAG="$version" APP_VERSION="$version" docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.image.yml up --no-build -d \
    || { write_result "$req_id" "$action" "$version" "$req_method" failed "启动容器失败，请查看 docker compose logs"; exit 0; }
else
  if [ -f ./deploy.sh ]; then
    APP_VERSION="$version" bash ./deploy.sh || { write_result "$req_id" "$action" "$version" "$req_method" failed "构建/启动失败，请查看 docker compose logs"; exit 0; }
  else
    # 无 deploy.sh 时直接使用 compose 重建（用 .env.deploy 或用户指定的环境文件）
    APP_VERSION="$version" docker compose --env-file "$ENV_FILE" up -d --build || { write_result "$req_id" "$action" "$version" "$req_method" failed "构建/启动失败，请查看 docker compose logs"; exit 0; }
  fi
fi

# 6) 记录版本历史并写成功结果
output="已${action}到 $version"
if [ "$req_method" = "image" ]; then output="${output}（拉取镜像 ${GHCR_IMAGE}:${version}）"; fi
[ "$action" = "rollback" ] && output="${output}（数据库已恢复到 ${version} 快照，若未找到快照则仅切换代码）"
update_versions "$version" "$action"
write_result "$req_id" "$action" "$version" "$req_method" success "$output"
rm -f "$running"
log "完成：${action} 至 $version"
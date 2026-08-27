# ===== 阶段 1: 安装依赖（完整安装，含 dev 依赖供构建使用） =====
# 仅在 package.json / package-lock.json 变化时才重新 npm ci，最大化利用构建缓存
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma/schema.prisma ./prisma/schema.prisma
# 优先 npm ci（可复现构建）；lock 缺失时回退 npm install
RUN npm ci || npm install

# ===== 阶段 2: 构建 =====
FROM node:22-alpine AS builder
WORKDIR /app
# 复用依赖层（含 typescript / tailwindcss 等 dev 依赖，next build 必需）
COPY --from=deps /app/node_modules ./node_modules
# 先复制 Prisma schema：仅 schema 变化时才重新 generate，命中缓存
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npx prisma generate
# 再复制其余源码（不会破坏上方的 generate 缓存层）
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 字体构建容错：优先正常构建（保留 next/font/google 真实自托管字体）；
# 若 fonts.gstatic.com 在国内被墙导致下载失败，则用 NEXT_FONT_GOOGLE_MOCKED_RESPONSES=1
# 兜底重跑一次（离线 mock 字体），保证镜像构建永不因 Google Fonts 阻断。
RUN npm run build || { export NEXT_FONT_GOOGLE_MOCKED_RESPONSES=1 && npm run build; }

# ===== 阶段 3: 运行时 =====
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户（home:app）
RUN addgroup -g 1001 -S app && adduser -S home -u 1001 -G app

# 安装 openssl：让 Prisma Client/CLI 在运行时能正确探测 OpenSSL 版本，
# 消除 "Prisma failed to detect the libssl/openssl version" 启动告警（Alpine 最小镜像默认缺失）
RUN apk add --no-cache openssl

# 复制 standalone 产物与静态资源（public 目录归属 home:app）
COPY --from=builder --chown=home:app /app/public ./public
COPY --from=builder --chown=home:app /app/.next/standalone ./
COPY --from=builder --chown=home:app /app/.next/static ./.next/static

# 复制 Prisma 相关文件（启动时 migrate deploy / seed 需要）
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# 显式复制 bcryptjs：seed.js 在 Next standalone 之外运行，需确保依赖可用
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin

# 修正 Prisma 引擎目录属主：容器以非 root 的 home 用户启动时，
# migrate deploy / seed 阶段可能写入 engines 目录（缓存引擎二进制），
# 属主为 root 时会报 "Can't write to /app/node_modules/@prisma/engines" 错误。
RUN if [ -d /app/node_modules/@prisma ]; then chown -R home:app /app/node_modules/@prisma /app/node_modules/prisma /app/node_modules/.prisma; fi

# 创建数据目录并设置权限（SQLite 数据库文件将存放于此）
RUN mkdir -p /app/data && chown home:app /app/data

USER home

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL="file:/app/data/prod.db"

# 启动脚本：先应用 migrations（幂等，硬性前置），再 seed 默认数据（best-effort，失败不阻断启动），最后启动应用
CMD npx prisma migrate deploy && { node prisma/seed.js || true; } && node server.js

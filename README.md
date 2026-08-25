# home-lb 个人主页

一个开箱即用的现代个人主页 / 导航首页。基于 Next.js 15（App Router）+ TypeScript + Tailwind CSS + Prisma（SQLite）构建，内置后台管理系统，支持 Docker 一键部署与自动打包发版。

## 功能特性

### 首页展示

- **动态壁纸**：必应每日 / 随机风景 / 随机动漫 / 自定义直链，服务端缓存（源站失效不影响展示），支持定时切换、暗化遮罩
- **一言 / 音乐播放器**：多数据源（NeteaseCloudMusicApi / Meting / QQ 音乐），四种播放模式，歌词、Media Session、顶部进度条
- **时钟天气**：高德 / 腾讯天气多数据源自动降级，支持按访客 IP 自动定位，天气结果 5 分钟缓存
- **导航链接**：社交链接、网站链接、友情链接分区展示，图标支持 Lucide / 阿里 iconfont / 图片
- **氛围特效**：全屏加载动画、点击粒子、季节特效（萤火虫 / 雪花 / 灯笼）、动态页面标题、右上角欢迎通知
- **访问统计**：PV / UV（服务端 Cookie 去重，防刷限流）
- **SEO**：动态标题 / 描述 / 关键词（后台可配，ISR 增量渲染）

### 后台管理（`/admin`）

- 站点信息、主题与壁纸、音乐设置、社交 / 网站 / 友情链接、天气设置
- 账号设置（改密强制重新登录）、操作日志审计、外部服务状态监控
- 玻璃拟态卡片、强调色、艺术字体（18 款中英双语）等视觉配置全部可视化

### 安全设计

- **SSRF 防护**：壁纸 / 音乐代理接口校验协议白名单、私网地址拦截、DNS rebinding 防护、响应体大小限制
- **登录防护**：bcrypt 加密、按来源 IP 的失败限流（5 次锁定 10 分钟）、时序攻击防护
- **输入校验**：所有 API 入参经 Zod 校验；脚本注入净化（拦截 on* / javascript: / srcdoc）
- **安全响应头**：CSP / X-Frame-Options / Referrer-Policy 等全站配置
- **操作审计**：后台关键操作全部记录操作日志（含 IP，敏感字段脱敏）

## 技术栈

| 领域 | 选型 |
|------|------|
| 框架 | Next.js 15（App Router，standalone 输出） |
| 语言 | TypeScript（strict） |
| 样式 | Tailwind CSS 3 + shadcn/ui 组件 |
| 数据库 | SQLite + Prisma ORM（含 29 个迁移） |
| 认证 | NextAuth v4（JWT + Credentials） |
| 校验 | Zod |
| 测试 | Vitest（184 用例：SSRF / 限流 / 校验 / 组件交互） |
| CI/CD | GitHub Actions 自动构建打包 + Release |

## 快速开始

### 本地开发

```bash
# 1. 安装依赖并生成 Prisma Client
npm install

# 2. 准备环境变量
cp .env.example .env
# 编辑 .env：NEXTAUTH_SECRET 用 `openssl rand -base64 32` 生成

# 3. 初始化数据库（会自动创建默认账号 admin）
npx prisma migrate deploy
node prisma/seed.js

# 4. 启动开发服务
npm run dev
# 访问 http://localhost:3000，后台 http://localhost:3000/admin
```

### Docker 部署

```bash
# Linux
./deploy.sh

# Windows
.\deploy.ps1
```

脚本会自动生成 `.env.deploy`（含随机 `NEXTAUTH_SECRET`）、构建镜像并等待健康检查。首次启动容器内自动执行数据库迁移与 seed。

手动部署：

```bash
cp .env.deploy.example .env.deploy   # 并填入 NEXTAUTH_URL 等
docker compose --env-file .env.deploy up -d --build
```

### 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DATABASE_URL` | ✅ | SQLite 文件路径（compose 已预设 `file:/app/data/prod.db`） |
| `NEXTAUTH_SECRET` | ✅ | NextAuth 签名密钥（`openssl rand -base64 32` 生成） |
| `NEXTAUTH_URL` | ✅ | 应用对外访问地址（反代 / 域名时必须设置） |
| `SEED_ADMIN_PASSWORD` | — | 默认管理员密码（≥8 位）；留空则 seed 时随机生成并打印到日志 |

> ⚠️ 首次登录后台后请立即在「账号设置」修改默认账号密码。

## 自动打包发版

每次 push 到 `master` 分支，GitHub Actions 自动执行：安装依赖 → 数据库迁移 → 生产构建 → 打包 standalone 产物 → 创建 GitHub Release。

- **版本号**：`home-YYYY-MM-DD-HHmm`（如 `home-2026-08-26-0100`），按时间可识别
- **产物**：Next.js standalone 目录 + Prisma（schema/migrations/seed）+ Dockerfile / compose / 部署脚本 / env 模板，打包为 tar.gz 上传至 Release
- **Release Notes**：自动生成（版本、日期、变更列表、上一版本 CHANGELOG 对比链接）

## 项目结构

```
├── app/                  # 路由与页面（App Router）
│   ├── api/              # API 路由（认证/配置/壁纸/音乐/天气/统计等）
│   ├── admin/            # 后台管理
│   ├── page.tsx          # 首页
│   └── hooks.ts          # 首页数据准备（服务端）
├── components/           # 组件（壁纸/时钟/音乐/特效/后台面板等）
├── lib/                  # 核心逻辑（auth/ssrf/validation/server/壁纸缓存）
├── prisma/               # Schema、迁移、seed
├── public/fonts/         # 自托管艺术字体
├── tests/                # Vitest 测试（184 用例）
├── .github/workflows/    # 自动构建打包发布
└── deploy.sh / deploy.ps1 / Dockerfile / docker-compose.yml
```

## 许可

保留作者版权信息，未经授权请勿整站抄袭。

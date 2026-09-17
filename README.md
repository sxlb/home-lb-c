# home-lb 个人主页

Next.js 15 + TypeScript + Tailwind CSS + Prisma（SQLite）的个人主页 / 导航首页，内置后台管理，Docker 一键部署，推送自动发版。

## 功能

### 前台

- **动态壁纸**：必应每日 / 随机风景 / 随机动漫 / 自定义直链，服务端缓存（源站失效不影响展示），支持定时切换与暗化遮罩
- **一言 + 音乐播放器**：NeteaseCloudMusicApi / Meting / QQ 音乐多数据源，默认 Meting + 网易云热歌榜；四种播放模式、歌词、Media Session、顶部进度条；后台可配自动播放，音量条常驻并实时填充指示
- **时钟天气**：高德 / 腾讯多源自动降级，支持**腾讯 IP 定位 + 高德实况混合模式**（精确到区县），IPv6 / 私网 IP 自动过滤，结果缓存 5 分钟
- **导航链接**：社交 / 网站 / 友情链接分区展示，图标支持 Lucide / 阿里 iconfont / 图片
- **作品集与技能云**：作品封面、标签、置顶、分页浏览；技能按熟练度展示并可选图标
- **氛围特效**：全屏加载动画、点击粒子、季节特效（萤火虫 / 雪花 / 灯笼）、动态页面标题、右上角欢迎通知
- **公告与命令面板**：公告支持置顶与定时上下线；`Ctrl / Cmd + K` 呼出全局命令面板
- **访问统计**：PV / UV（服务端 Cookie 去重 + 防刷限流），后台查看时段 / 来源 / 设备分布
- **SEO**：标题 / 描述 / 关键词后台可配，ISR 增量渲染

### 后台（`/admin`）

- **系统更新**：检测 GitHub 最新版本、一键更新（服务器自建构建 / 拉取 GHCR 镜像）、版本回滚、数据库快照、更新历史；GitHub 代理源并发测速与优先源设置
- **内容管理**：站点信息、主题与壁纸、音乐设置、社交 / 网站 / 友情链接、作品集、技能云、站点公告、天气设置
- **运维与安全**：账号设置（改密强制重新登录）、操作日志审计、访问统计、媒体库、外部服务状态监控、数据导出 / 导入 / 恢复默认
- **视觉配置**：玻璃拟态、强调色、自定义字体、头像形状与边框、页脚 HTML 全可视化

### 安全

- **SSRF 防护**：壁纸 / 音乐代理校验协议白名单、私网地址拦截、DNS rebinding 防护、响应体大小限制
- **登录防护**：bcrypt 加密、IP + 账号双维度失败计数（5 分钟内失败 5 次锁定 10 分钟）、时序攻击防护、TOTP 二次验证
- **输入校验**：全 API Zod 校验，脚本注入净化（拦截 `on*` / `javascript:` / `srcdoc`）
- **认证纵深**：`requireSession` 严格校验 `user.name` 非空（JWT 伪造防御），所有写操作强制会话检查
- **安全响应头**：CSP / X-Frame-Options / Referrer-Policy 等全站配置
- **操作审计**：关键操作落日志（含 IP，敏感字段脱敏）

## 优点

- **开箱即用**：一键脚本自动生成密钥、构建镜像、等待健康检查；首次启动容器内自动迁移 + seed，无需手工建库
- **改动不用写代码**：从站点信息到视觉参数全部后台可视化配置，保存即生效，无需重新构建
- **更新 / 回滚可控**：网页触发，更新前自动备份数据库，回滚时代码与数据库快照一并回退；失败会清理运行标记，不会阻塞后续更新
- **对低配服务器友好**：SQLite 单文件 + standalone 输出，构建阶段限制堆内存，2GB 内存机器可跑
- **字体不依赖外部 CDN**：字体文件随镜像打包自托管，页面渲染不受第三方字体服务抖动影响（可选的阿里 iconfont 除外）
- **国内网络可用**：GitHub 检测与镜像拉取支持自建代理源，可并发测速并指定优先源
- **安全基线完整**：SSRF / 限流 / 审计 / CSP / TOTP 齐备；所有内存缓存与限流表均设硬上限，防伪造请求撑爆内存
- **测试覆盖完整**：48 个测试文件 / 463 个用例，覆盖 SSRF、限流、鉴权、校验、组件交互、更新回滚

## 缺点与限制

- **只能单实例运行**：SQLite + 进程内内存缓存（限流计数、天气缓存），无法水平扩展；多副本部署时限流与缓存各自独立，登录锁定会被绕过
- **限流与缓存不持久**：重启后失败计数、限流桶、天气缓存全部清零，靠重启可「洗掉」锁定状态
- **仅支持单管理员**：`User` 表只有 `username` / `password` / TOTP 字段，没有角色与多用户体系，不支持多人协作或权限分级
- **访客 IP 定位依赖反向代理**：需要反代正确传递 `X-Forwarded-For`；直连 `IP:端口`、反代模板被改、或套了 CDN 时，会退化成按服务器出口 IP 定位（表现为「显示的城市不是访客所在城市」）
- **更新流程不是纯 Docker**：依赖 GitHub 可达（受限网络需自建代理），且宿主机需安装 cron 与更新脚本；容器本身无法独立完成更新
- **构建吃内存**：`next build` 需限制堆内存（`Dockerfile` 已设 `--max-old-space-size=1536`），低配机器构建速度较慢
- **强依赖第三方接口**：天气（高德 / 腾讯）与音乐（Meting / NeteaseCloudMusicApi / QQ）均为外部服务，上游限流、改协议或失效时需要跟着调整；音乐可用性受第三方源影响
- **无内置定时备份**：数据库备份依附于更新 / 回滚流程，日常定期备份需自行配置 cron

## 技术栈

| 领域 | 选型 |
|------|------|
| 框架 | Next.js 15（App Router，standalone 输出） |
| 语言 | TypeScript（strict） |
| 样式 | Tailwind CSS 3 + shadcn/ui 组件 |
| 数据库 | SQLite + Prisma ORM（47 个迁移） |
| 认证 | NextAuth v4（JWT + Credentials，支持 TOTP 二次验证） |
| 校验 | Zod |
| 字体 | 自托管 Noto Sans SC / Inter / Tech Mono + 艺术字体「有爱圆体」（中英双语，无外部 CDN 请求） |
| 测试 | Vitest（48 个文件 / 463 用例） |
| 更新 | 网页触发 + 宿主机执行（GitHub Release 检测 / 更新 / 回滚 / 数据库快照） |
| CI/CD | GitHub Actions 自动构建 + 语义化发版 + GHCR 镜像发布 |

## 快速开始

### 本地开发

```bash
# 1. 安装依赖（postinstall 会自动生成 Prisma Client）
npm install

# 2. 准备环境变量
cp .env.example .env
# 编辑 .env：NEXTAUTH_SECRET 用 `openssl rand -base64 32` 生成

# 3. 初始化数据库（自动创建默认账号 admin）
npx prisma migrate deploy
node prisma/seed.js

# 4. 启动开发服务
npm run dev
# 前台 http://localhost:3000，后台 http://localhost:3000/admin
```

### Docker 部署

```bash
./deploy.sh          # Linux
.\deploy.ps1         # Windows
```

脚本自动生成 `.env.deploy`（含随机 `NEXTAUTH_SECRET`）、构建镜像并等待健康检查。手动部署：

```bash
cp .env.deploy.example .env.deploy   # 填入 NEXTAUTH_URL 等
docker compose --env-file .env.deploy up -d --build
```

### 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DATABASE_URL` | ✅ | SQLite 文件路径（compose 已预设 `file:/app/data/prod.db`） |
| `NEXTAUTH_SECRET` | ✅ | NextAuth 签名密钥（`openssl rand -base64 32` 生成） |
| `NEXTAUTH_URL` | ✅ | 应用对外访问地址（反代 / 域名时必须设置） |
| `SEED_ADMIN_PASSWORD` | — | 默认管理员密码（≥8 位）；留空则 seed 时随机生成并打印到日志 |
| `APP_VERSION` | — | 当前发布版本（由更新流程自动注入）；缺省回退为 package.json 版本 |

> ⚠️ 首次登录后台后请立即在「账号设置」修改默认账号密码。

## 自动发版

每次 push 到 `master`，GitHub Actions 自动执行：语义化版本递增（`patch+1`，基于已发布最大版本）→ 安装依赖 → 数据库迁移 → 生产构建 → 推送 `ghcr.io/sxlb/home-lb-c:<版本>` 与 `:latest` 镜像 → 打包 standalone 产物（含 Prisma、Dockerfile、部署脚本）→ 创建 GitHub Release（标题含中国时区时间，自动生成变更列表与上一版本对比链接）。

## 系统更新 / 回滚

后台「系统更新」面板负责检测与执行，宿主机定时器执行实际部署动作：

- **检测**：GitHub Releases API 发现最新语义化版本，10 分钟缓存防限流；检测前并发测试所有代理源连通性，可设优先源（失败自动回退竞速），也可用 `GITHUB_API_MIRRORS` / `IMAGE_MIRROR_PREFIX` / `GIT_PROXY_URL` 覆盖
- **更新方式**（每次二选一）：
  - **服务器自建构建**：宿主机 `git checkout` 到目标 tag，本地 `docker build` + `compose up`，依赖服务器算力
  - **拉取发布镜像**：直接拉取 GHCR `:<版本>` 镜像并以 `--no-build` 重启，速度快、服务器零构建压力
- **安全机制**：更新 / 回滚前自动备份数据库；`flock` + 每分钟 cron 防并发；结果回写面板并落操作日志

## 项目结构

```
├── app/                  # 路由与页面（App Router）
│   ├── api/              # API 路由（认证/配置/壁纸/音乐/天气/统计/更新等）
│   ├── admin/            # 后台管理
│   ├── page.tsx          # 首页
│   └── hooks.ts          # 首页数据准备（服务端）
├── components/           # 组件（壁纸/时钟/音乐/特效/后台面板等）
├── lib/                  # 核心逻辑（auth/ssrf/validation/server/version/update）
├── prisma/               # Schema、迁移（47 个，含 migration_lock.toml）、seed
├── public/fonts/         # 自托管字体（Noto Sans SC / Inter / 等宽 + 艺术字体）
├── tests/                # Vitest 测试（48 个文件 / 463 用例）
├── scripts/              # 宿主机更新/回滚执行器与通道安装脚本
├── .github/workflows/    # 自动构建、语义化发版、GHCR 镜像发布
└── deploy.sh / deploy.ps1 / Dockerfile / docker-compose*.yml
```

## 许可

保留作者版权信息，未经授权请勿整站抄袭。

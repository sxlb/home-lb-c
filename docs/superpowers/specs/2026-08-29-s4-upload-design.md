# 后台增强 S4：文件上传 设计文档

- 日期：2026-08-29
- 状态：已批准
- 涉及模块：后台头像/图标/壁纸本地文件上传
- 关联计划：后台增强批次二（S3 + S4 + S5）

## 背景与目标

头像（avatar）、网站图标（siteIcon）、自定义壁纸（bgApi）当前仅支持 URL 输入。目标：支持本地文件上传，上传后自动填充 URL（`/api/uploads/file/xxx`），复用 wallpaperCache 的成熟安全模式。

## 设计决策

### 1. 存储与核心逻辑（lib/uploads.ts）

- 目录：`<cwd>/data/uploads`（Docker 卷映射，与 wallpapers 并列）
- `saveUpload(buffer, ext)`：唯一文件名（时间戳 + 随机串），写入目录
- `readUpload(fileName)`：白名单字符 + 防目录穿越（复用 readCachedWallpaper 模式）
- 类型校验：
  - magic number 识别 jpg/png/webp/gif/avif/bmp + **ICO**（favicon）
  - 拒绝 SVG（可内嵌脚本，存储型 XSS 风险）
  - 单文件上限 10MB

### 2. API

| 路由 | 说明 |
|------|------|
| `POST /api/uploads` | 需登录；multipart form（file 字段）；校验后保存；返回 `{ url }` |
| `GET /api/uploads/file/[name]` | 文件服务（复用 wallpaper 路由模式，长缓存） |

### 3. 前端接入

- 通用组件 `components/admin/UploadButton.tsx`：按钮 + 隐藏 file input + 上传状态 + toast
- ProfilePanel：头像区、网站图标区接入上传按钮，成功自动填充 avatar/siteIcon
- ThemePanel：自定义壁纸输入旁接入上传，成功填充 bgApi

### 4. 文件变更

| 文件 | 操作 |
|------|------|
| `lib/uploads.ts` | 新建 |
| `app/api/uploads/route.ts` | 新建（POST） |
| `app/api/uploads/file/[name]/route.ts` | 新建（GET） |
| `components/admin/UploadButton.tsx` | 新建 |
| `components/admin/ProfilePanel.tsx` | 修改 |
| `components/admin/ThemePanel.tsx` | 修改 |
| `tests/uploads.test.ts` | 新建 |

### 5. 安全

- 上传 API 需登录；类型白名单（magic number）+ 大小限制；SVG 拒绝；文件名随机化 + 防穿越

## 测试与验收

- lib/uploads 校验单测：非法类型/SVG/超大拒绝；文件名安全
- 手工：上传头像/图标/壁纸成功并显示；未登录 401

## 非目标

- 多文件批量上传（单文件即满足当前需求）
- 图片压缩/尺寸处理（保持原图，节省复杂度）

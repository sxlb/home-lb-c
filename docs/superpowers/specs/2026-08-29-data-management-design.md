# 数据管理套件（S2）设计文档

- 日期：2026-08-29
- 状态：已批准
- 涉及模块：后台数据备份/恢复、配置迁移
- 关联计划：后台增强批次一（S1 + S2 + S7）

## 背景与目标

后台缺少数据安全能力：站点数据（配置 + 链接）仅存在服务器 SQLite 文件中，误删/误改无法回滚，迁移部署需手动搬运。目标：

1. 一键备份：导出全部业务数据为 JSON 文件下载
2. 恢复：上传备份 JSON，事务性覆盖恢复
3. 配置迁移：下载备份 → 新环境上传恢复（覆盖"配置导出/导入"诉求）

## 设计决策

### 1. 备份范围

**包含**：Profile（站点配置，单行）、SocialLink、SiteLink、FriendLink（全表）
**不包含**（安全）：
- `User` 表：登录密码 hash，绝不导出
- `OperationLog`：审计日志保留现场，恢复不清空

### 2. 备份文件格式

```json
{
  "version": 1,
  "exportedAt": "2026-08-29T12:00:00.000Z",
  "profile": { "...Profile 全字段..." },
  "socialLinks": [{ "name": "...", "icon": "...", "url": "...", "tip": "...", "sort": 0 }],
  "siteLinks": [...],
  "friendLinks": [...]
}
```

### 3. API 设计

**GET /api/backup**（需登录）
- 查询 Profile + 三个链接表，组装备份 JSON
- 响应：`Content-Disposition: attachment; filename="home-lb-backup-YYYYMMDD.json"`

**POST /api/backup/restore**（需登录 + 危险操作）
- 请求体：`{ confirm: true, backup: <备份 JSON> }`
- 校验链：version === 1 → profile 用 `profileSchema` 校验 → 链接数组逐条用 `socialLinkSchema` / `siteLinkSchema` / `friendLinkSchema` 校验
- 事务：清空三个链接表 + upsert Profile（单例）+ createMany 链接，失败整体回滚
- 写操作日志（`backup` 模块）
- 返回恢复统计（各表条数）

### 4. 前端 DataPanel（新后台 tab「数据管理」）

- 备份区：说明 + 「下载备份」按钮
- 恢复区：文件选择 → 本地校验 version → 预览摘要（备份时间/各表条数）→ 勾选确认 → 「确认恢复」
- 面板入口在「运维工具」分组，图标 Database

### 5. 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/backup.ts` | 新建 | buildBackup / parseBackup / restoreBackup 核心逻辑 |
| `app/api/backup/route.ts` | 新建 | GET 下载备份 |
| `app/api/backup/restore/route.ts` | 新建 | POST 恢复 |
| `components/admin/DataPanel.tsx` | 新建 | 数据管理面板 |
| `app/admin/page.tsx` | 修改 | 新增「数据管理」tab（运维工具分组） |
| `lib/server.ts` | 修改 | LogModule 增加 "backup" |
| `tests/backup.test.ts` | 新建 | 备份/解析/恢复逻辑单测 |

### 6. 安全细节

- 两个 API 均 `requireSession` 鉴权
- 恢复必须带 `confirm: true`；前端勾选确认 + 明确危险文案
- 恢复请求体大小限制 5MB（超限拒绝）
- 备份文件仅登录态可下载；Profile 敏感密钥字段随导出（管理员有完整权限）

### 7. 测试与验收

- `tests/backup.test.ts`：buildBackup 结构完整；parseBackup 拒绝非法 version/结构；restore 校验失败不写库
- 手工清单：下载备份 → 修改数据 → 上传恢复 → 回滚正确；未登录 API 401；无 confirm 恢复被拒

## 非目标

- 定时自动备份（可后续加 cron）
- 备份文件云端存储（本地下载为主）

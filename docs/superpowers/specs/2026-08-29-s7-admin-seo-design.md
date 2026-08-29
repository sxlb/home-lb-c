# 后台增强 S7：日志筛选 + 页脚自定义 + SEO 设计文档

- 日期：2026-08-29
- 状态：已批准
- 涉及模块：操作日志、页脚、SEO
- 关联计划：后台增强批次一（S1 + S2 + S7）

## 背景与目标

1. 操作日志仅支持 `?limit=` 拉取固定条数，缺少筛选/搜索/分页
2. 页脚仅支持备案号/建站日期/统计等固定内容，无法自定义 HTML
3. 无 sitemap / robots，SEO 能力缺失

## 设计决策

### A. 操作日志增强

**API**：`GET /api/operation-logs` 参数扩展：
- `module`：精确筛选（profile / social-links / site-links / friend-links / account / weather-setting / backup）
- `keyword`：模糊匹配 username / summary（`contains`）
- `page`（默认 1）、`pageSize`（默认 20，最大 100）
- 返回 `{ items, total, page, pageSize }`（`count` + `skip/take`）

**前端**：模块下拉 + 关键词输入 + 刷新；分页栏（上一页/下一页 + 总数）；保留展开详情；MODULE_LABEL/COLOR 补充 `friend-links`、`backup`。

### B. 页脚自定义 HTML

- Profile 新字段 `siteFooterHtml`（String，默认空，textarea 输入）
- 渲染：Footer 在版权行上方插入 `dangerouslySetInnerHTML`（管理员输入，与 analyticsScript 同信任级）
- 链路：schema + migration → `lib/validation.ts` → `components/admin/profileShared.ts` → `app/api/profile/route.ts` → `components/admin/ProfilePanel.tsx`（页脚区 textarea）→ `app/hooks.ts` 透传 → `components/Footer.tsx` 渲染

### C. sitemap / robots

- `app/sitemap.ts`：读 Profile `siteUrl`，配置后输出主页 URL（`lastModified`）；未配置返回空数组
- `app/robots.ts`：`allow: /`，siteUrl 存在时引用 sitemap

## 文件变更

| 文件 | 操作 |
|------|------|
| `app/api/operation-logs/route.ts` | 修改：筛选/搜索/分页 |
| `components/admin/OperationLogPanel.tsx` | 修改：筛选 + 分页 UI |
| `prisma/schema.prisma` + `prisma/migrations/20260829010000_add_site_footer_html/migration.sql` | 修改/新建：siteFooterHtml |
| `lib/validation.ts`、`components/admin/profileShared.ts`、`app/api/profile/route.ts`、`components/admin/ProfilePanel.tsx`、`app/hooks.ts`、`components/Footer.tsx` | 修改：页脚字段链路 |
| `app/sitemap.ts`、`app/robots.ts` | 新建 |

## 安全

- 日志 API 保持 `requireSession`
- `siteFooterHtml` 为管理员可信内容（与 analyticsScript / headScript 一致），无额外净化

## 测试与验收

- 现有测试全过；类型/构建/lint 通过
- 手工：日志模块筛选与关键词搜索、分页跳转；页脚自定义 HTML 显示；`/sitemap.xml`、`/robots.txt` 正确（含 siteUrl 时）

## 非目标

- 日志时间范围筛选（有搜索/分页已满足排查需求）
- 多页面 sitemap（个人主页仅主页一个 URL）

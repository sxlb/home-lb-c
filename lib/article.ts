/**
 * 文章共享逻辑：创建/更新时字段归一化 + 自动摘要。
 * 供 /api/articles 与 /api/articles/:slug 两个路由复用，避免重复定义。
 */

/** 提交项 → 数据库可写字段（白名单，防止多余字段污染） */
export const articleDataOf = (it: {
  title: string; slug: string; content: string; excerpt: string;
  cover: string; tags: string; published: boolean; pinned: boolean;
}) => ({
  title: it.title,
  slug: it.slug,
  content: it.content,
  excerpt: it.excerpt,
  cover: it.cover,
  tags: it.tags,
  published: it.published,
  pinned: it.pinned,
});

/** 从正文提取摘要（去除 Markdown 标记，取前 120 字符） */
export function autoExcerpt(content: string): string {
  return content
    .replace(/[#>*_`~\-\[\]()!]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
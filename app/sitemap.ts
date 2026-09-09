import { prisma } from "@/lib/db";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

/** 站点地图：配置 siteUrl 后输出主页 + 已发布文章 + 文章列表页 URL，否则空数组 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const profile = await prisma.profile.findFirst({ orderBy: { id: "asc" } });
  const siteUrl = profile?.siteUrl?.trim().replace(/\/+$/, "");
  if (!profile || !siteUrl) return [];

  const base: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: profile.updatedAt,
      changeFrequency: "daily",
      priority: 1,
    },
  ];

  // 已发布文章链接（登录接口不可用时不阻塞全站地图）
  const articles = await prisma.article
    .findMany({ where: { published: true }, orderBy: { publishedAt: "desc" }, select: { slug: true, updatedAt: true } })
    .catch(() => []);

  if (articles.length > 0) {
    base.push({ url: `${siteUrl}/articles`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 });
    for (const a of articles) {
      base.push({
        url: `${siteUrl}/articles/${a.slug}`,
        lastModified: a.updatedAt,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  }

  return base;
}

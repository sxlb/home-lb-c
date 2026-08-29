import { prisma } from "@/lib/db";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

/** 站点地图：配置 siteUrl 后输出主页 URL，否则空数组 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const profile = await prisma.profile.findFirst({ orderBy: { id: "asc" } });
  const siteUrl = profile?.siteUrl?.trim().replace(/\/+$/, "");
  if (!profile || !siteUrl) return [];

  return [
    {
      url: siteUrl,
      lastModified: profile.updatedAt,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}

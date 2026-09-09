import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { internalError, error, success, getClientIp } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/** 公开：前台阅读页加载时递增阅读量（仅统计已发布文章，防抖以避免同会话重复计数） */
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const slug = (await ctx.params).slug;
    const ip = getClientIp(request);

    // 会话级防抖：同一 IP 对同一 slug 在 5 分钟内只计一次，避免刷新连刷
    const key = `article:${slug}:${ip}`;
    const now = Date.now();
    const window = 5 * 60 * 1000;
    try {
      // 轻量内存去抖：仅用于避免连刷，非严格统计，无过期清理需求（仅存最近 200 条）
      const recent = viewDedup.get(key);
      if (recent && now - recent < window) {
        return NextResponse.json({ ok: true, deduped: true, viewCount: await peekView(slug) });
      }
    } catch {
      /* 忽略去抖缓存读取异常 */
    }

    const article = await prisma.article.findFirst({ where: { slug, published: true }, select: { id: true, viewCount: true } });
    if (!article) return error("文章不存在", 404);

    const updated = await prisma.article.update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } });
    viewDedup.set(key, now);
    return success({ ok: true, viewCount: updated.viewCount });
  } catch (e) {
    return internalError("[POST /api/articles/:slug/views] 计数失败", e);
  }
}

/** 读取当前阅读量（用于去抖时返回实时值） */
async function peekView(slug: string): Promise<number> {
  const a = await prisma.article.findFirst({ where: { slug }, select: { viewCount: true } });
  return a?.viewCount ?? 0;
}

declare global {
  var __articleViewDedup: Map<string, number> | undefined;
}

// 跨模块共享去抖动缓存：内存常驻、最多保留 200 条，超出清空最旧（简单容量保护）
const viewDedup: Map<string, number> = global.__articleViewDedup ?? (global.__articleViewDedup = new Map());
if (viewDedup.size > 200) {
  const oldest = viewDedup.keys().next().value;
  if (oldest !== undefined) viewDedup.delete(oldest);
}
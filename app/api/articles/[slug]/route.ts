import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  internalError, error, success, requireSession, parseJsonBody,
  formatZodError, getClientIp, writeOperationLog,
} from "@/lib/server";
import { articleSchema } from "@/lib/validation";
import { articleDataOf, autoExcerpt } from "@/lib/article";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/** 后台：单篇详情（编辑回填，按 slug 定位） */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    if (!session) return error("未授权", 401);
    const slug = (await ctx.params).slug;
    if (!slug) return error("参数错误", 400);
    const article = await prisma.article.findUnique({ where: { slug } });
    if (!article) return error("文章不存在", 404);
    return NextResponse.json(article);
  } catch (e) {
    return internalError("[GET /api/articles/:slug] 查询失败", e);
  }
}

/** 后台：更新文章（按 slug 定位，允许改 slug） */
export async function PUT(request: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    if (!session) return error("未授权", 401);
    const oldSlug = (await ctx.params).slug;
    if (!oldSlug) return error("参数错误", 400);
    const json = await parseJsonBody(request);
    if (json === null) return error("请求体格式错误，需为合法 JSON");
    const parsed = articleSchema.safeParse(json);
    if (!parsed.success) return error(`参数校验失败：${formatZodError(parsed.error)}`);

    const existing = await prisma.article.findUnique({ where: { slug: oldSlug } });
    if (!existing) return error("文章不存在", 404);

    const updated = await prisma.article.update({
      where: { slug: oldSlug },
      data: articleDataOf({ ...parsed.data, excerpt: parsed.data.excerpt || autoExcerpt(parsed.data.content) }),
    });
    await writeOperationLog({
      module: "articles",
      action: "update",
      username: session.user?.name || "unknown",
      summary: `更新文章「${parsed.data.title}」`,
      ip: getClientIp(request),
    });
    return success(updated);
  } catch (e) {
    return internalError("[PUT /api/articles/:slug] 更新失败", e);
  }
}

/** 后台：删除文章（按 slug 定位） */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    if (!session) return error("未授权", 401);
    const slug = (await ctx.params).slug;
    if (!slug) return error("参数错误", 400);
    const existing = await prisma.article.findUnique({ where: { slug } });
    if (!existing) return error("文章不存在", 404);
    await prisma.article.delete({ where: { slug } });
    await writeOperationLog({
      module: "articles",
      action: "delete",
      username: session.user?.name || "unknown",
      summary: `删除文章「${existing.title}」`,
      ip: getClientIp(request),
    });
    return success({ ok: true }, 200);
  } catch (e) {
    return internalError("[DELETE /api/articles/:slug] 删除失败", e);
  }
}
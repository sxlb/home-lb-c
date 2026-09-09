import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  internalError, error, success, requireSession, parseJsonBody,
  formatZodError, getClientIp, writeOperationLog,
} from "@/lib/server";
import { articleSchema } from "@/lib/validation";
import { articleDataOf, autoExcerpt } from "@/lib/article";

export const dynamic = "force-dynamic";

/** 后台：文章列表（全部，含草稿） */
export async function GET() {
  try {
    const session = await requireSession();
    if (!session) return error("未授权", 401);
    const list = await prisma.article.findMany({ orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }, { id: "desc" }] });
    return NextResponse.json(list);
  } catch (e) {
    return internalError("[GET /api/articles] 查询失败", e);
  }
}

/** 后台：新增文章 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return error("未授权", 401);
    const json = await parseJsonBody(request);
    if (json === null) return error("请求体格式错误，需为合法 JSON");
    const parsed = articleSchema.safeParse(json);
    if (!parsed.success) return error(`参数校验失败：${formatZodError(parsed.error)}`);
    const created = await prisma.article.create({ data: articleDataOf({ ...parsed.data, excerpt: parsed.data.excerpt || autoExcerpt(parsed.data.content) }) });
    await writeOperationLog({
      module: "articles",
      action: "create",
      username: session.user?.name || "unknown",
      summary: `新增文章「${parsed.data.title}」`,
      ip: getClientIp(request),
    });
    return success(created, 201);
  } catch (e) {
    return internalError("[POST /api/articles] 创建失败", e);
  }
}
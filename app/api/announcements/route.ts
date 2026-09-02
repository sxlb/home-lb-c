import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  internalError, error, success, requireSession, parseJsonBody,
  formatZodError, writeOperationLog, getClientIp,
} from "@/lib/server";
import { announcementSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** 后台：公告列表（全部，含未上线/过期，倒序）+ 新增（仅管理员） */
export async function GET() {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }
    const list = await prisma.siteAnnouncement.findMany({
      orderBy: [{ pinned: "desc" }, { sort: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(list);
  } catch (e) {
    return internalError("[GET /api/announcements] 查询失败", e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }
    const json = await parseJsonBody(request);
    if (json === null) {
      return error("请求体格式错误，需为合法 JSON");
    }
    const parsed = announcementSchema.safeParse(json);
    if (!parsed.success) {
      return error(`参数校验失败：${formatZodError(parsed.error)}`);
    }

    const data = parsed.data;
    const created = await prisma.siteAnnouncement.create({
      data: {
        title: data.title,
        content: data.content,
        pinned: data.pinned,
        enabled: data.enabled,
        sort: data.sort,
        startAt: data.startAt ? new Date(data.startAt) : null,
        endAt: data.endAt ? new Date(data.endAt) : null,
      },
    });

    const username = session.user?.name || "unknown";
    await writeOperationLog({
      module: "announcements",
      action: "create",
      username,
      summary: `发布公告「${data.title}」`,
      ip: getClientIp(request),
    });
    return success(created, 201);
  } catch (e) {
    return internalError("[POST /api/announcements] 创建失败", e);
  }
}
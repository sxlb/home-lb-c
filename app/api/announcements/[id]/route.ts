import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  internalError, error, success, requireSession, parseJsonBody,
  formatZodError, writeOperationLog, getClientIp,
} from "@/lib/server";
import { announcementPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function resolveId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 编辑公告（仅管理员）：支持部分字段（title/content/pinned/enabled/sort/startAt/endAt） */
export async function PUT(request: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }
    const id = await resolveId(ctx.params);
    if (id === null) {
      return error("参数校验失败：id 不合法", 400);
    }

    const json = await parseJsonBody(request);
    if (json === null) {
      return error("请求体格式错误，需为合法 JSON");
    }
    const parsed = announcementPatchSchema.safeParse(json);
    if (!parsed.success) {
      return error(`参数校验失败：${formatZodError(parsed.error)}`);
    }

    const existing = await prisma.siteAnnouncement.findUnique({ where: { id } });
    if (!existing) {
      return error("公告不存在", 404);
    }

    const p = parsed.data;
    const updated = await prisma.siteAnnouncement.update({
      where: { id },
      data: {
        ...(p.title !== undefined ? { title: p.title } : {}),
        ...(p.content !== undefined ? { content: p.content } : {}),
        ...(p.pinned !== undefined ? { pinned: p.pinned } : {}),
        ...(p.enabled !== undefined ? { enabled: p.enabled } : {}),
        ...(p.sort !== undefined ? { sort: p.sort } : {}),
        ...(p.startAt !== undefined ? { startAt: p.startAt ? new Date(p.startAt) : null } : {}),
        ...(p.endAt !== undefined ? { endAt: p.endAt ? new Date(p.endAt) : null } : {}),
      },
    });

    const username = session.user?.name || "unknown";
    await writeOperationLog({
      module: "announcements",
      action: "update",
      username,
      summary: `编辑公告「${updated.title}」`,
      ip: getClientIp(request),
    });
    return success(updated);
  } catch (e) {
    return internalError("[PUT /api/announcements/:id] 更新失败", e);
  }
}

/** 删除公告（仅管理员） */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }
    const id = await resolveId(ctx.params);
    if (id === null) {
      return error("参数校验失败：id 不合法", 400);
    }

    const existing = await prisma.siteAnnouncement.findUnique({ where: { id } });
    if (!existing) {
      return error("公告不存在", 404);
    }
    await prisma.siteAnnouncement.delete({ where: { id } });

    const username = session.user?.name || "unknown";
    await writeOperationLog({
      module: "announcements",
      action: "delete",
      username,
      summary: `删除公告「${existing.title}」`,
      ip: getClientIp(request),
    });
    return success({ ok: true });
  } catch (e) {
    return internalError("[DELETE /api/announcements/:id] 删除失败", e);
  }
}
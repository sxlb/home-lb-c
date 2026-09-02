import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { internalError, error, parseJsonBody, isRateLimited, getClientIp } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 网站/友情链接的点击上报：聚合计数到 SiteLinkClick（用于后台"热门链接"统计） */
export async function POST(request: NextRequest) {
  try {
    // 防刷：按 IP + 链接合并限流，避免刷点击
    const ip = getClientIp(request) || "unknown";
    if (isRateLimited(`click:${ip}`, 30, 60_000)) {
      return NextResponse.json({ ok: false, error: "请求过于频繁" }, { status: 429 });
    }

    const body = await parseJsonBody<{ id?: number; name?: string; url?: string }>(request);
    if (!body) {
      return error("请求体格式错误，需为合法 JSON");
    }
    const linkId = Number(body.id);
    if (!Number.isInteger(linkId) || linkId <= 0) {
      return error("参数校验失败：id 必须为正整数");
    }
    const name = typeof body.name === "string" ? body.name.slice(0, 100) : "";
    const url = typeof body.url === "string" ? body.url.slice(0, 2000) : "";

    await prisma.siteLinkClick.upsert({
      where: { linkId },
      update: { count: { increment: 1 }, name: name || undefined, url: url || undefined },
      create: { linkId, name, url, count: 1 },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return internalError("[POST /api/stats/click] 记录点击失败", e);
  }
}
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { internalError, error, parseJsonBody, isRateLimited, getClientIp } from "@/lib/server";
import { serialized } from "@/lib/serialize";

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
    // 内容净化：该接口无鉴权，任意访客可直接 POST，防伪造 name/url 投毒后台「热门链接」。
    // name 去除控制字符并截断；url 仅允许 http/https，杜绝 javascript:/data: 等危险 scheme 入库。
    const name = (typeof body.name === "string" ? body.name : "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 100);
    let url = typeof body.url === "string" ? body.url.trim().slice(0, 2000) : "";
    if (url && !/^https?:\/\//i.test(url)) url = "";

    // upsert 为写操作，放入串行队列避免并发写触发 SQLITE_BUSY
    await serialized(async () => {
      await prisma.siteLinkClick.upsert({
        where: { linkId },
        update: { count: { increment: 1 }, name: name || undefined, url: url || undefined },
        create: { linkId, name, url, count: 1 },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return internalError("[POST /api/stats/click] 记录点击失败", e);
  }
}
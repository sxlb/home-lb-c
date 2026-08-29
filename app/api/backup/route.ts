import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildBackup } from "@/lib/backup";
import { requireSession, error, internalError } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 下载完整备份：Profile + 三个链接表（不含 User / OperationLog） */
export async function GET() {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }

    const [profile, socialLinks, siteLinks, friendLinks] = await Promise.all([
      prisma.profile.findFirst({ orderBy: { id: "asc" } }),
      prisma.socialLink.findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] }),
      prisma.siteLink.findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] }),
      prisma.friendLink.findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] }),
    ]);

    const backup = buildBackup(
      (profile as unknown as Record<string, unknown>) ?? {},
      socialLinks as unknown as Record<string, unknown>[],
      siteLinks as unknown as Record<string, unknown>[],
      friendLinks as unknown as Record<string, unknown>[]
    );

    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="home-lb-backup-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return internalError("[GET /api/backup] 导出失败", e);
  }
}

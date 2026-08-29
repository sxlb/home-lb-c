import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, error, internalError } from "@/lib/server";
import { buildDailySeries } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** 当前日期（东八区 YYYY-MM-DD，与 /api/stats 一致） */
function todayStr(): string {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 偏移 N 天日期 */
function shiftDate(base: string, offset: number): string {
  const d = new Date(`${base}T00:00:00+08:00`);
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 访问统计看板：概要指标 + 最近 30 天趋势（仅后台管理员） */
export async function GET() {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }

    const today = todayStr();
    const yesterday = shiftDate(today, -1);
    const windowStart = shiftDate(today, -29);

    const [todayRow, yesterdayRow, all, recent] = await Promise.all([
      prisma.visitStat.findUnique({ where: { date: today } }),
      prisma.visitStat.findUnique({ where: { date: yesterday } }),
      prisma.visitStat.aggregate({ _sum: { pv: true, uv: true } }),
      prisma.visitStat.findMany({
        where: { date: { gte: windowStart } },
        orderBy: { date: "asc" },
      }),
    ]);

    const daily = buildDailySeries(
      recent.map((r) => ({ date: r.date, pv: r.pv, uv: r.uv })),
      30,
      today
    );

    return NextResponse.json({
      totalPv: all._sum.pv ?? 0,
      totalUv: all._sum.uv ?? 0,
      todayPv: todayRow?.pv ?? 0,
      todayUv: todayRow?.uv ?? 0,
      yesterdayPv: yesterdayRow?.pv ?? 0,
      yesterdayUv: yesterdayRow?.uv ?? 0,
      daily,
    });
  } catch (e) {
    return internalError("[GET /api/stats/dashboard] 查询失败", e);
  }
}

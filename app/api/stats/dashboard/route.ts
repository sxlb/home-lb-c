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

/* ==================== 地域（IP → 国家/省份，尽力而为） ==================== */
// 内存缓存：ip → 地域；避免对同一 IP 重复请求外部服务。仅缓存"解析成功"结果，
// 失败返回 null（下次再试），防止把瞬时网络错误永久固化。
const geoCache = new Map<string, string>();

/** 用 ip-api 免费接口解析 IP 地域（国家或省份），失败返回 null；结果缓存。 */
async function resolveGeo(ip: string): Promise<string | null> {
  if (!ip) return null;
  if (geoCache.has(ip)) return geoCache.get(ip) ?? null;
  try {
    // fields=country,regionName：country 即为国家；地区名给 regionName（用于国家内区分省份）
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName&lang=zh-CN`,
      { signal: AbortSignal.timeout(2500) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { status: string; country?: string; regionName?: string };
    if (data.status !== "success" || !data.country) return null;
    const region = data.regionName && data.regionName !== data.country ? ` ${data.regionName}` : "";
    const label = `${data.country}${region}`.trim();
    geoCache.set(ip, label);
    return label;
  } catch {
    return null;
  }
}

/** 访问统计看板：概要 + 30 天趋势 + 来源/设备/系统/浏览器/时段 + 热门链接 + 地域（仅后台管理员） */
export async function GET() {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }

    const today = todayStr();
    const yesterday = shiftDate(today, -1);
    const windowStart = shiftDate(today, -29);

    const [
      todayRow,
      yesterdayRow,
      all,
      recent,
      referrers,
      devices,
      oss,
      browsers,
      hours,
      topLinks,
    ] = await Promise.all([
      prisma.visitStat.findUnique({ where: { date: today } }),
      prisma.visitStat.findUnique({ where: { date: yesterday } }),
      prisma.visitStat.aggregate({ _sum: { pv: true, uv: true } }),
      prisma.visitStat.findMany({
        where: { date: { gte: windowStart } },
        orderBy: { date: "asc" },
      }),
      // 来源站（last 30 天，仅非空）
      prisma.visitRecord.groupBy({
        by: ["referrerDomain"],
        where: { date: { gte: windowStart }, referrerDomain: { not: "" } },
        _count: { _all: true },
        orderBy: { _count: { referrerDomain: "desc" } },
        take: 10,
      }),
      // 设备
      prisma.visitRecord.groupBy({
        by: ["device"],
        where: { date: { gte: windowStart } },
        _count: { _all: true },
        orderBy: { _count: { device: "desc" } },
      }),
      // 操作系统（Top 8，空归"未知"）
      prisma.visitRecord.groupBy({
        by: ["os"],
        where: { date: { gte: windowStart } },
        _count: { _all: true },
        orderBy: { _count: { os: "desc" } },
        take: 8,
      }),
      // 浏览器（Top 8）
      prisma.visitRecord.groupBy({
        by: ["browser"],
        where: { date: { gte: windowStart } },
        _count: { _all: true },
        orderBy: { _count: { browser: "desc" } },
        take: 8,
      }),
      // 24 小时时段分布
      prisma.visitRecord.groupBy({
        by: ["hour"],
        where: { date: { gte: windowStart } },
        _count: { _all: true },
        orderBy: { hour: "asc" },
      }),
      // 热门链接（点击量 Top 8）
      prisma.siteLinkClick.findMany({
        orderBy: { count: "desc" },
        take: 8,
      }),
    ]);

    const daily = buildDailySeries(
      recent.map((r) => ({ date: r.date, pv: r.pv, uv: r.uv })),
      30,
      today
    );

    // 地域：取窗口内访问量最高的 IP Top 12 逐个解析（尽力而为，带缓存）
    const topIps = await prisma.visitRecord.groupBy({
      by: ["ip"],
      where: { date: { gte: windowStart }, ip: { not: "" } },
      _count: { _all: true },
      orderBy: { _count: { ip: "desc" } },
      take: 12,
    });
    const geo = { total: 0, unknown: 0, regions: [] as { name: string; count: number }[] };
    if (topIps.length) {
      const agg = new Map<string, number>();
      for (const row of topIps) {
        const label = await resolveGeo(row.ip);
        const name = label ?? "未知";
        agg.set(name, (agg.get(name) ?? 0) + row._count._all);
      }
      for (const [name, count] of agg) {
        geo.regions.push({ name: name === "未知" ? "未知/局域网" : name, count });
      }
      geo.regions.sort((a, b) => b.count - a.count);
      geo.total = topIps.reduce((s, r) => s + r._count._all, 0);
      geo.unknown = agg.get("未知") ?? 0;
    }

    return NextResponse.json({
      totalPv: all._sum.pv ?? 0,
      totalUv: all._sum.uv ?? 0,
      todayPv: todayRow?.pv ?? 0,
      todayUv: todayRow?.uv ?? 0,
      yesterdayPv: yesterdayRow?.pv ?? 0,
      yesterdayUv: yesterdayRow?.uv ?? 0,
      daily,
      // 增强维度
      referrers: referrers.map((r) => ({ name: r.referrerDomain, count: r._count._all })),
      devices: devices.map((r) => ({ name: r.device, count: r._count._all })),
      os: oss.map((r) => ({ name: r.os || "未知", count: r._count._all })),
      browsers: browsers.map((r) => ({ name: r.browser || "未知", count: r._count._all })),
      hours: Array.from({ length: 24 }, (_, h) => {
        const row = hours.find((x) => x.hour === h);
        return { hour: h, count: row?._count._all ?? 0 };
      }),
      topLinks: topLinks.map((l) => ({ name: l.name, count: l.count, url: l.url })),
      geo,
      windowStart,
    });
  } catch (e) {
    return internalError("[GET /api/stats/dashboard] 查询失败", e);
  }
}
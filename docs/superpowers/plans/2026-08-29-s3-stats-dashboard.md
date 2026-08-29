# S3 访问统计看板 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后台新增访问统计看板：概要指标 + 14 天 PV/UV 趋势（零依赖 SVG）。

**Architecture:** `app/api/stats/dashboard/route.ts` 查询 VisitStat 组装 `{ total, today, yesterday, daily }`；`components/admin/StatsPanel.tsx` 纯 SVG 折线图；日期补零逻辑抽 `buildDailySeries` 纯函数（单测）。

**Tech Stack:** Next.js 15 / Prisma 5 / vitest

**设计文档:** `docs/superpowers/specs/2026-08-29-s3-stats-dashboard-design.md`

---

### Task 1: 数据组装纯函数 + 单测（TDD）

**Files:**
- Create: `lib/stats.ts`
- Test: `tests/stats-dashboard.test.ts`

- [ ] **Step 1: 编写失败测试**

创建 `tests/stats-dashboard.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { buildDailySeries } from "@/lib/stats";

describe("buildDailySeries（趋势序列组装）", () => {
  const base = "2026-08-29";

  it("缺失日期补零，窗口取最近 N 天", () => {
    const records = [
      { date: "2026-08-27", pv: 5, uv: 1 },
      { date: "2026-08-29", pv: 10, uv: 2 },
    ];
    const series = buildDailySeries(records, 5, base);
    expect(series).toHaveLength(5);
    expect(series[4]).toEqual({ date: "2026-08-29", pv: 10, uv: 2 });
    expect(series[3]).toEqual({ date: "2026-08-28", pv: 0, uv: 0 });
    expect(series[0].date).toBe("2026-08-25");
  });

  it("记录超过窗口时只取最近 N 天", () => {
    const records = [
      { date: "2026-08-01", pv: 1, uv: 0 },
      { date: "2026-08-29", pv: 2, uv: 0 },
    ];
    const series = buildDailySeries(records, 3, base);
    expect(series).toHaveLength(3);
    expect(series[0].date).toBe("2026-08-27");
    expect(series.some((s) => s.date === "2026-08-01")).toBe(false);
  });

  it("空记录返回全零窗口", () => {
    const series = buildDailySeries([], 3, base);
    expect(series).toHaveLength(3);
    expect(series.every((s) => s.pv === 0 && s.uv === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/stats-dashboard.test.ts`
Expected: FAIL（`@/lib/stats` 不存在）

- [ ] **Step 3: 实现 lib/stats.ts**

创建 `lib/stats.ts`：

```ts
/** 单日统计记录（VisitStat 行） */
export interface DailyStat {
  date: string; // YYYY-MM-DD
  pv: number;
  uv: number;
}

/** 生成 YYYY-MM-DD 前/后偏移日期（东八区固定，与 /api/stats 一致） */
function shiftDate(base: string, offset: number): string {
  const d = new Date(`${base}T00:00:00+08:00`);
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 组装趋势序列：按 base 日期向前取 window 天，缺失日期补零。
 * records 可乱序/超窗，输出严格升序、长度恰为 window。
 */
export function buildDailySeries(
  records: DailyStat[],
  window: number,
  base: string
): DailyStat[] {
  const map = new Map(records.map((r) => [r.date, r]));
  const series: DailyStat[] = [];
  for (let i = window - 1; i >= 0; i--) {
    const date = shiftDate(base, -i);
    const hit = map.get(date);
    series.push(hit ? { date, pv: hit.pv, uv: hit.uv } : { date, pv: 0, uv: 0 });
  }
  return series;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/stats-dashboard.test.ts`
Expected: 3 个用例 PASS

- [ ] **Step 5: 提交**

```bash
git add lib/stats.ts tests/stats-dashboard.test.ts
git commit -m "feat(stats): buildDailySeries date-filling pure function with tests"
```

---

### Task 2: dashboard API

**Files:**
- Create: `app/api/stats/dashboard/route.ts`

- [ ] **Step 1: 创建路由**

创建 `app/api/stats/dashboard/route.ts`：

```ts
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
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 3: 提交**

```bash
git add app/api/stats/dashboard/route.ts
git commit -m "feat(stats): dashboard API with summary and 30-day trend"
```

---

### Task 3: StatsPanel 前端 + 后台 tab

**Files:**
- Create: `components/admin/StatsPanel.tsx`
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: 创建 StatsPanel**

创建 `components/admin/StatsPanel.tsx`：

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Eye, Users, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

interface DailyStat { date: string; pv: number; uv: number }
interface DashboardData {
  totalPv: number; totalUv: number;
  todayPv: number; todayUv: number;
  yesterdayPv: number; yesterdayUv: number;
  daily: DailyStat[];
}

/** 概要卡片 */
function StatCard({ label, value, delta, icon: Icon, accent }: {
  label: string; value: number; delta?: number;
  icon: typeof Eye; accent: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {delta !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up ? "+" : ""}{delta}%
          </span>
        )}
      </div>
    </div>
  );
}

/** 趋势折线图（纯 SVG，hover 显示 tooltip） */
function TrendChart({ data, label, color }: { data: DailyStat[]; label: string; color: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => d[label as "pv" | "uv"]);
  const max = Math.max(1, ...values);
  const W = 560, H = 140, PAD = 6;
  const stepX = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : 0;
  const pts = values
    .map((v, i) => `${(PAD + i * stepX).toFixed(1)},${(H - PAD - (v / max) * (H - PAD * 2)).toFixed(1)}`)
    .join(" ");

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground">最近 {data.length} 天</span>
      </div>
      {values.every((v) => v === 0) ? (
        <div className="flex h-[140px] items-center justify-center text-xs text-muted-foreground">
          暂无访问数据
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-[140px] w-full" onMouseLeave={() => setHover(null)}>
            {/* 网格线 */}
            {[0.25, 0.5, 0.75].map((r) => (
              <line key={r} x1={PAD} x2={W - PAD} y1={H * r} y2={H * r} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="4 4" />
            ))}
            {/* 折线 */}
            <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {/* 数据点与 hover 命中区 */}
            {values.map((v, i) => (
              <g key={i}>
                <circle cx={PAD + i * stepX} cy={H - PAD - (v / max) * (H - PAD * 2)} r={hover === i ? 4 : 2.5} fill={color} />
                <rect
                  x={PAD + i * stepX - stepX / 2}
                  y={0}
                  width={stepX}
                  height={H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            ))}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow"
              style={{ left: `${(PAD + hover * stepX) / W * 100}%` }}
            >
              {data[hover].date}
              <br />
              {label}：{values[hover]}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StatsPanel() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (!cancelled && json) setData(json); })
      .catch(() => toast.error("加载统计数据失败"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16 text-muted-foreground">加载中...</CardContent>
      </Card>
    );
  }

  const deltaPv = data && data.yesterdayPv > 0 ? Math.round(((data.todayPv - data.yesterdayPv) / data.yesterdayPv) * 100) : undefined;
  const deltaUv = data && data.yesterdayUv > 0 ? Math.round(((data.todayUv - data.yesterdayUv) / data.yesterdayUv) * 100) : undefined;
  const recent = data?.daily.slice(-14) ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">访问统计</CardTitle>
            <CardDescription>今日与累计访问数据，以及最近 14 天趋势</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="今日 PV" value={data?.todayPv ?? 0} delta={deltaPv} icon={Eye} accent="text-blue-500" />
          <StatCard label="今日 UV" value={data?.todayUv ?? 0} delta={deltaUv} icon={Users} accent="text-violet-500" />
          <StatCard label="累计 PV" value={data?.totalPv ?? 0} icon={Eye} accent="text-emerald-500" />
          <StatCard label="累计 UV" value={data?.totalUv ?? 0} icon={Users} accent="text-amber-500" />
        </div>
        <TrendChart data={recent} label="PV" color="#3b82f6" />
        <TrendChart data={recent} label="UV" color="#8b5cf6" />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 后台增加 tab**

修改 `app/admin/page.tsx`：
1. TabId 增加 `"stats"`；import `BarChart3`（lucide）与 `StatsPanel`
2. 「运维工具」分组 items 加入：

```tsx
{ id: "stats", label: "访问统计", icon: BarChart3, description: "查看访问数据与趋势" },
```

3. 内容区加入：`{activeTab === "stats" && <StatsPanel />}`

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功

- [ ] **Step 4: 提交**

```bash
git add components/admin/StatsPanel.tsx app/admin/page.tsx
git commit -m "feat(stats): dashboard panel with summary cards and SVG trend charts"
```

---

### Task 4: 全量验证

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 全部 PASS（含 stats-dashboard 用例）

- [ ] **Step 2: 类型 + Lint + 构建**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 无错误

- [ ] **Step 3: 手工验证清单**

1. 后台「运维工具 → 访问统计」：4 个概要卡显示今日/累计 PV/UV，今日较昨日有增减百分比（昨日为 0 时无 delta）
2. PV、UV 两个趋势图渲染折线与数据点；hover 显示日期与数值
3. 无数据时显示"暂无访问数据"空态
4. 未登录访问 `/api/stats/dashboard` 返回 401

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore(stats): final verification" || echo "无新增变更"
```

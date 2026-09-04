"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, Users, TrendingUp, TrendingDown, Link2, Focus, CalendarRange } from "lucide-react";
import { toast } from "sonner";

interface DailyStat { date: string; pv: number; uv: number }
interface BarRow { name: string; count: number }
interface HourPoint { hour: number; count: number }
interface TopLink { name: string; count: number; url: string }
interface GeoData { total: number; unknown: number; regions: { name: string; count: number }[] }
interface WeekCompare {
  curStart: string; curEnd: string; prevStart: string; prevEnd: string;
  curPv: number; curUv: number; prevPv: number; prevUv: number;
  pvDelta: number; uvDelta: number;
}

interface DashboardData {
  totalPv: number; totalUv: number;
  todayPv: number; todayUv: number;
  yesterdayPv: number; yesterdayUv: number;
  daily: DailyStat[];
  referrers: BarRow[];
  sourceBuckets: BarRow[];
  devices: BarRow[];
  os: BarRow[];
  browsers: BarRow[];
  hours: HourPoint[];
  topLinks: TopLink[];
  geo: GeoData;
  weekCompare: WeekCompare;
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
          <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? "text-success" : "text-error"}`}>
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
        <div className="flex h-[140px] items-center justify-center text-xs text-muted-foreground">暂无访问数据</div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-[140px] w-full" onMouseLeave={() => setHover(null)}>
            {[0.25, 0.5, 0.75].map((r) => (
              <line key={r} x1={PAD} x2={W - PAD} y1={H * r} y2={H * r} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="4 4" />
            ))}
            <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {values.map((v, i) => (
              <g key={i}>
                <circle cx={PAD + i * stepX} cy={H - PAD - (v / max) * (H - PAD * 2)} r={hover === i ? 4 : 2.5} fill={color} />
                <rect x={PAD + i * stepX - stepX / 2} y={0} width={stepX} height={H} fill="transparent"
                  onMouseEnter={() => setHover(i)} />
              </g>
            ))}
          </svg>
          {hover !== null && (
            <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow"
              style={{ left: `${((PAD + hover * stepX) / W) * 100}%` }}>
              {data[hover].date}<br />{label}：{values[hover]}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 横向条形图（Top-N 维度） */
function MiniBars({ title, rows, empty }: { title: string; rows: BarRow[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{empty ?? "暂无数据"}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 truncate text-right text-muted-foreground" title={r.name}>{r.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
              <span className="w-8 shrink-0 tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 24 小时访问时段柱状图 */
function HourChart({ data }: { data: HourPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-1 text-sm font-semibold">24 小时时段分布</h3>
      <div className="flex h-[110px] items-end gap-[3px]">
        {data.map((d) => (
          <div key={d.hour} title={`${d.hour}时 · ${d.count}次`} className="group relative flex-1">
            <div className="w-full rounded-t-sm bg-muted" style={{ height: `${110 * (1 - d.count / max)}px` }} />
            <div className="absolute bottom-0 w-full rounded-t-sm bg-primary/70 group-hover:bg-primary"
              style={{ height: `${110 * (d.count / max)}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>0时</span><span>6时</span><span>12时</span><span>18时</span><span>23时</span>
      </div>
    </div>
  );
}

/** 来源构成（直接/搜索/社交/外链）——横向比例条 + 占比 */
function SourceCompose({ rows }: { rows: BarRow[] }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const isEmpty = total === 0;
  const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#10b981"];
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Focus className="h-4 w-4" />来源构成（最近 30 天）</h3>
      {isEmpty ? (
        <p className="py-4 text-center text-xs text-muted-foreground">暂无访问明细</p>
      ) : (
        <div className="space-y-3">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {rows.map((r, i) => (
              r.count > 0 && <div key={r.name} className="h-full" style={{ width: `${(r.count / total) * 100}%`, background: COLORS[i % COLORS.length] }} />
            ))}
          </div>
          <ul className="space-y-2">
            {rows.map((r, i) => {
              const pct = total ? Math.round((r.count / total) * 1000) / 10 : 0;
              return (
                <li key={r.name} className="flex items-center gap-2 text-xs">
                  <span className="flex h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="flex-1">{r.name}</span>
                  <span className="tabular-nums">{r.count}</span>
                  <span className="w-11 shrink-0 text-right tabular-nums text-muted-foreground">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** 本周 vs 上周对比 */
function WeekCompareCard({ w, today }: { w: WeekCompare; today: string }) {
  const currentWeekLabel = w.curStart === today ? "本周" : `${w.curStart} ~ ${w.curEnd}`;
  const prevWeekLabel = `${w.prevStart} ~ ${w.prevEnd}`;
  const rows = [
    { label: "PV", cur: w.curPv, prev: w.prevPv, delta: w.pvDelta },
    { label: "UV", cur: w.curUv, prev: w.prevUv, delta: w.uvDelta },
  ];
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><CalendarRange className="h-4 w-4" />周环比（本周 vs 上周）</h3>
      {rows.map((r) => {
        const up = r.delta >= 0;
        return (
          <div key={r.label} className="mb-3 rounded-lg border bg-muted/40 px-3 py-2.5 last:mb-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{r.label}</span>
              <span title={`上周（${prevWeekLabel}）：${r.prev}`}>本周（{currentWeekLabel}）：{r.cur}</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-semibold tabular-nums">{r.cur}</span>
              <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? "text-success" : "text-error"}`}>
                {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {up ? "+" : ""}{r.delta}%
              </span>
              <span className="text-[11px] text-muted-foreground">上周 {r.prev}</span>
            </div>
          </div>
        );
      })}
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
    return (<Card><CardContent className="flex items-center justify-center py-16 text-muted-foreground">加载中...</CardContent></Card>);
  }

  const deltaPv = data && data.yesterdayPv > 0 ? Math.round(((data.todayPv - data.yesterdayPv) / data.yesterdayPv) * 100) : undefined;
  const deltaUv = data && data.yesterdayUv > 0 ? Math.round(((data.todayUv - data.yesterdayUv) / data.yesterdayUv) * 100) : undefined;
  const recent = data?.daily.slice(-14) ?? [];

  const GEO = data?.geo;

  return (
    <Card>
      {/* 页面级标题/描述由 admin/page.tsx 提供，卡内不再重复标题 */}
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="今日 PV" value={data?.todayPv ?? 0} delta={deltaPv} icon={Eye} accent="text-blue-500" />
          <StatCard label="今日 UV" value={data?.todayUv ?? 0} delta={deltaUv} icon={Users} accent="text-violet-500" />
          <StatCard label="累计 PV" value={data?.totalPv ?? 0} icon={Eye} accent="text-emerald-500" />
          <StatCard label="累计 UV" value={data?.totalUv ?? 0} icon={Users} accent="text-amber-500" />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <TrendChart data={recent} label="PV" color="#3b82f6" />
          <TrendChart data={recent} label="UV" color="#8b5cf6" />
        </div>

        {/* F4 深度分析：来源构成 + 周环比 */}
        <div className="grid gap-3 md:grid-cols-2">
          <SourceCompose rows={data?.sourceBuckets ?? []} />
          {data?.weekCompare && <WeekCompareCard w={data.weekCompare} today={data.weekCompare.curEnd} />}
        </div>

        {/* 增强维度：时段 + 设备 */}
        <div className="grid gap-3 md:grid-cols-2">
          <HourChart data={data?.hours ?? []} />
          <MiniBars title="设备分布" rows={data?.devices ?? []} empty="暂无访问明细" />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <MiniBars title="操作系统" rows={data?.os ?? []} />
          <MiniBars title="浏览器" rows={data?.browsers ?? []} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <MiniBars title="访问来源" rows={data?.referrers ?? []} empty="暂无来源数据（均为直接访问）" />
          <MiniBars title="访客地域分布（IP 库离线解析）" rows={(GEO?.regions ?? []).map((r) => ({ name: r.name, count: r.count }))} empty="暂无地域数据" />
        </div>

        {/* 热门链接 */}
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Link2 className="h-4 w-4" />热门链接（点击量）</h3>
          </div>
          {(data?.topLinks ?? []).length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">暂无点击数据，点击首页链接后累计</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {(data?.topLinks ?? []).map((t) => (
                <li key={t.url} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{t.count}</span>
                  <span className="min-w-0 flex-1 truncate text-sm" title={t.name}>{t.name || "未命名"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
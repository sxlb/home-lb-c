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
              style={{ left: `${((PAD + hover * stepX) / W) * 100}%` }}
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

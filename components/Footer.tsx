"use client";

import { useEffect, useMemo, useState } from "react";
import { Shield, Zap } from "lucide-react";

interface Props {
  siteName?: string;
  siteUrl?: string;
  siteIcp?: string;
  siteMps?: string;
  siteStart?: string;
  showStats?: boolean;
}

interface StatsData {
  todayPv: number;
  todayUv: number;
  totalPv: number;
  totalUv: number;
}

function calcDays(siteStart: string): number {
  const start = new Date(siteStart);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.floor((Date.now() - start.getTime()) / 86_400_000);
}

function getResponseTime(): number {
  try {
    const perfData = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (perfData) {
      return Math.round(perfData.responseEnd - perfData.requestStart);
    }
  } catch { /* silent */ }
  return 0;
}

/** 使用 useMemo 构建页脚分组，避免每次 render 重建 DOM 树 */
function useFooterGroups(
  icp: string,
  mps: string,
  showStats: boolean,
  stats: StatsData | null,
  days: number,
  loadTime: number,
) {
  return useMemo(() => {
    type Group = { key: string; node: React.ReactNode };
    const groups: Group[] = [];

    // 第 1 组：备案号
    if (icp || mps) {
      const items: React.ReactNode[] = [];
      if (icp) {
        items.push(
          <a key="icp" href="https://beian.miit.gov.cn" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-white">
            <Shield className="h-3 w-3" />{icp}
          </a>,
        );
      }
      if (mps) {
        if (items.length > 0) items.push(<span key="sep-mps" className="text-white/25">·</span>);
        items.push(
          <a key="mps" href="https://beian.mps.gov.cn" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-white">
            <Shield className="h-3 w-3" />{mps}
          </a>,
        );
      }
      groups.push({ key: "beian", node: <span className="inline-flex items-center gap-x-2">{items}</span> });
    }

    // 第 2 组：访客统计
    const todayPv = stats?.todayPv ?? 0;
    const pv = stats?.totalPv ?? 0;
    const uv = stats?.totalUv ?? 0;
    if (showStats && (todayPv > 0 || pv > 0 || uv > 0)) {
      groups.push({
        key: "visitors",
        node: (
          <span className="inline-flex items-center gap-x-2">
            <span>今日 <strong>{todayPv}</strong></span>
            <span className="text-white/25">·</span>
            <span>累计 <strong>{pv}</strong></span>
            <span className="text-white/25">·</span>
            <span>访客 <strong>{uv}</strong></span>
          </span>
        ),
      });
    }

    // 第 3 组：运行天数 + 速度
    if (days > 0 || loadTime > 0) {
      const parts: React.ReactNode[] = [];
      if (days > 0) parts.push(<span key="days">已运行 {days} 天</span>);
      if (loadTime > 0) {
        if (parts.length > 0) parts.push(<span key="sep-time" className="text-white/25">·</span>);
        parts.push(
          <span key="speed" className="inline-flex items-center gap-1">
            <Zap className="h-3 w-3" />
            <span>运行速度</span>
            {loadTime < 500 ? <span className="text-emerald-400">{loadTime} ms</span> :
             loadTime < 1000 ? <span className="text-amber-400">{loadTime} ms</span> :
                               <span className="text-red-400">{loadTime} ms</span>}
          </span>,
        );
      }
      groups.push({ key: "runtime-speed", node: <span className="inline-flex items-center gap-x-2">{parts}</span> });
    }

    return groups;
  }, [icp, mps, showStats, stats, days, loadTime]);
}

export default function Footer({
  siteName = "无名",
  siteUrl = "",
  siteIcp = "",
  siteMps = "",
  siteStart = "",
  showStats = false,
}: Props) {
  const year = new Date().getFullYear();
  const url = siteUrl.trim();
  const icp = siteIcp.trim();
  const mps = siteMps.trim();

  const [days, setDays] = useState(0);
  const [loadTime, setLoadTime] = useState(0);
  const [stats, setStats] = useState<StatsData | null>(null);

  // 运行天数（每分钟更新）
  useEffect(() => {
    if (!siteStart) return;
    setDays(calcDays(siteStart));
    const timer = setInterval(() => setDays(calcDays(siteStart)), 60_000);
    return () => clearInterval(timer);
  }, [siteStart]);

  // 页面加载耗时
  useEffect(() => {
    const handler = () => setLoadTime(getResponseTime());
    if (document.readyState === "complete") handler();
    else window.addEventListener("load", handler);
    return () => window.removeEventListener("load", handler);
  }, []);

  // 统计数据：上报本次访问（PV）并读取展示
  // （原 SiteStats 组件功能已合并至此，保证统计记录与显示不分离）
  // UV 去重由服务端 Cookie 判定，客户端仅上报一次 PV
  useEffect(() => {
    let cancelled = false;

    fetch("/api/stats", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    }).catch(() => {
      /* 上报失败不影响页面 */
    });

    fetch("/api/stats", { cache: "no-store", signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json) setStats(json as StatsData);
      })
      .catch(() => {
        /* 忽略 */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // memo 化页脚分组
  const groups = useFooterGroups(icp, mps, showStats, stats, days, loadTime);

  // 非固定页脚：位于主内容之后（文档流），滚动到页面底部时自然出现，不遮挡内容；
  // mt-6 保证与上方主内容的间距，正常浏览时页脚不在视口内
  return (
    <footer className="z-10 mt-6 w-full border-t border-white/5 bg-black/15 py-3.5 text-center text-sm text-white/50 backdrop-blur-md">
      <div className="mx-auto max-w-4xl flex flex-col items-center justify-center gap-y-1 px-4">
        {groups.map((group) => (
          <span key={group.key} className="inline-flex items-center gap-x-2 text-center text-xs md:text-sm">
            {group.node}
          </span>
        ))}
        {/* Copyright 独立一行，靠右下角（优化透明度与扫光效果） */}
        <div className="mt-1.5 text-right text-[11px] text-white/35 md:text-xs">
          <span className="shine-text">
            Copyright © {year}{" "}
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="underline decoration-white/25 underline-offset-2 hover:text-white/70">
                {siteName}
              </a>
            ) : (
              <span>{siteName}</span>
            )}
          </span>
        </div>
      </div>
    </footer>
  );
}

/** 单日统计记录（VisitStat 行） */
export interface DailyStat {
  date: string; // YYYY-MM-DD
  pv: number;
  uv: number;
}

/** 生成 YYYY-MM-DD 前/后偏移日期（东八区固定，与 /api/stats 一致） */
export function shiftDate(base: string, offset: number): string {
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

/* ==================== 来源构成分桶（深度分析） ==================== */
export type SourceBucketKey = "direct" | "search" | "social" | "external";
export const SOURCE_BUCKET_LABEL: Record<SourceBucketKey, string> = {
  direct: "直接访问",
  search: "搜索引擎",
  social: "社交平台",
  external: "外链",
};

const SEARCH_DOMAINS = [/baidu/, /bing/, /google/, /so\.com/, /sogou/, /sm\.cn/, /yandex/, /duckduckgo/];
const SOCIAL_DOMAINS = [/weibo/, /weixin/, /qq\.com/, /zhihu/, /bilibili/, /douyin/, /xiaohongshu/, /x\.com/, /twitter/, /facebook/, /instagram/, /youtube/, /reddit/, /telegram/, /tiktok/];

/** 把 referrerDomain 归为 直接/搜索引擎/社交/外链 */
export function sourceBucket(domain: string): SourceBucketKey {
  if (!domain) return "direct";
  if (SEARCH_DOMAINS.some((r) => r.test(domain))) return "search";
  if (SOCIAL_DOMAINS.some((r) => r.test(domain))) return "social";
  return "external";
}

/* ==================== 周环比（深度分析） ==================== */
/** 返回 base 所在周的周一（YYYY-MM-DD，周一为一周起点；周日属上一周） */
export function mondayOf(base: string): string {
  const jsDay = new Date(`${base}T00:00:00+08:00`).getDay();
  const offset = jsDay === 0 ? 6 : jsDay - 1;
  return shiftDate(base, -offset);
}

/** 周环比增幅（%）：prev 为基准；prev=0 时按 cur>0 记为 +100，否则 0；避免 -0 */
export function weekDelta(cur: number, prev: number): number {
  const r = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? 100 : 0;
  return r === 0 ? 0 : r;
}

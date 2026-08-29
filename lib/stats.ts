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

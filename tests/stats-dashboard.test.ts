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

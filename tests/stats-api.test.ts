import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimiter } from "@/lib/server";

/** 构造统计上报请求（可携带 UV Cookie） */
function makeRequest(cookie?: string): NextRequest {
  const headers: Record<string, string> = cookie ? { Cookie: cookie } : {};
  return new NextRequest("http://localhost/api/stats", {
    method: "POST",
    headers,
  });
}

// 模拟 Prisma 客户端，避免连接真实数据库
const mocks = {
  findUnique: vi.fn(),
  aggregate: vi.fn(),
  upsert: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  prisma: {
    visitStat: {
      findUnique: (...args: unknown[]) => mocks.findUnique(...args),
      aggregate: (...args: unknown[]) => mocks.aggregate(...args),
      upsert: (...args: unknown[]) => mocks.upsert(...args),
    },
  },
}));

// 动态导入被测模块（在 mock 注册之后）
const { GET, POST } = await import("@/app/api/stats/route");

describe("stats API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 清空 IP 限流状态，避免用例间互相影响
    resetRateLimiter();
  });

  describe("GET", () => {
    it("今日与累计数据均为 0 时返回默认值", async () => {
      mocks.findUnique.mockResolvedValue(null);
      mocks.aggregate.mockResolvedValue({ _sum: { pv: null, uv: null } });

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        todayPv: 0,
        todayUv: 0,
        totalPv: 0,
        totalUv: 0,
      });
    });

    it("存在今日记录与累计数据时正确返回", async () => {
      mocks.findUnique.mockResolvedValue({ date: "2026-08-07", pv: 10, uv: 3 });
      mocks.aggregate.mockResolvedValue({ _sum: { pv: 100, uv: 30 } });

      const res = await GET();
      const body = await res.json();

      expect(body).toEqual({
        todayPv: 10,
        todayUv: 3,
        totalPv: 100,
        totalUv: 30,
      });
    });

    it("数据库异常时返回 500", async () => {
      mocks.findUnique.mockRejectedValue(new Error("db down"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await GET();
      expect(res.status).toBe(500);

      consoleSpy.mockRestore();
    });
  });

  describe("POST", () => {
    it("首次访问（无 UV Cookie）：pv 与 uv 均 +1，并签发去重 Cookie", async () => {
      mocks.upsert.mockResolvedValue({});

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const [args] = mocks.upsert.mock.calls[0];
      expect(args.update).toEqual({
        pv: { increment: 1 },
        uv: { increment: 1 },
      });
      expect(args.create).toEqual({
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        pv: 1,
        uv: 1,
      });
      // 服务端签发 httpOnly Cookie 用于后续 UV 去重
      const cookie = res.cookies.get("home-lb-uv");
      expect(cookie?.value).toBe("1");
      expect(cookie?.httpOnly).toBe(true);
    });

    it("老访客（携带 UV Cookie）：仅 pv +1，不再更新 uv", async () => {
      mocks.upsert.mockResolvedValue({});

      const res = await POST(makeRequest("home-lb-uv=1"));

      expect(res.status).toBe(200);
      const [args] = mocks.upsert.mock.calls[0];
      expect(args.update).toEqual({ pv: { increment: 1 } });
      expect(args.create).toEqual({
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        pv: 1,
        uv: 0,
      });
      // 老访客不再重复签发 Cookie
      expect(res.cookies.get("home-lb-uv")).toBeUndefined();
    });

    it("同一 IP 高频请求触发限流（429），且不再写库", async () => {
      mocks.upsert.mockResolvedValue({});

      // 前 60 次正常放行（默认每分钟 60 次）
      for (let i = 0; i < 60; i++) {
        await POST(makeRequest("home-lb-uv=1"));
      }
      const res = await POST(makeRequest("home-lb-uv=1"));

      expect(res.status).toBe(429);
      expect(mocks.upsert).toHaveBeenCalledTimes(60);
    });

    it("数据库异常时返回 500", async () => {
      mocks.upsert.mockRejectedValue(new Error("db down"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(makeRequest());
      expect(res.status).toBe(500);

      consoleSpy.mockRestore();
    });
  });
});

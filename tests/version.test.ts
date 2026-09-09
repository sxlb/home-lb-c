import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLatestRelease, resetReleaseCache } from "../lib/version";

const OFFICIAL = "https://api.github.com";
const OK = {
  ok: true,
  status: 200,
  json: async () => ({
    tag_name: "0.0.5",
    name: "v0.0.5",
    body: "b",
    html_url: "https://github.com/sxlb/home-lb-c/releases/tag/0.0.5",
    published_at: "2026-01-01T00:00:00Z",
  }),
};

/** 按 URL 返回差异化响应：官方命中/不可达，代理命中/不可达 */
function mockFetch(opts: { official?: number | null; proxy?: number | null }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const isOfficial = url.startsWith(OFFICIAL);
      const s = isOfficial ? opts.official : opts.proxy;
      if (s === undefined || s === null || (s as number) === null) {
        return { ok: false, status: 0, json: async () => ({}) }; // 不可达（测速视为失败）
      }
      return { ok: (s as number) >= 200 && (s as number) < 300, status: s as number, json: async () => OK.json() };
    })
  );
}

describe("fetchLatestRelease 多源降级", () => {
  beforeEach(() => resetReleaseCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("官方可达时优先走官方并成功", async () => {
    mockFetch({ official: 200, proxy: 200 });
    const r = await fetchLatestRelease();
    expect(r.data?.version).toBe("0.0.5");
    expect(r.error).toBeUndefined();
  });

  it("官方不通时降级到公共代理并成功", async () => {
    mockFetch({ official: null, proxy: 200 });
    const r = await fetchLatestRelease();
    expect(r.data?.version).toBe("0.0.5");
  });

  it("官方与全部代理均失败时返回友好文案而非抛底层异常", async () => {
    mockFetch({ official: null, proxy: null });
    const r = await fetchLatestRelease();
    expect(r.data).toBeNull();
    expect(r.error).toBeDefined();
    expect(r.error).not.toMatch(/aborted|timeout/i); // 不透传底层英文原文
  });
});
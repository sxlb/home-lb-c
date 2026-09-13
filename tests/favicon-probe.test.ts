import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** SSRF 校验打桩：默认全部通过，个别用例让它抛错以模拟内网/无法解析的域名 */
const mocks = vi.hoisted(() => ({ assertPublicHttpUrl: vi.fn() }));
vi.mock("@/lib/ssrf", () => ({ assertPublicHttpUrl: mocks.assertPublicHttpUrl }));

import { faviconCandidates, probeFavicon } from "@/lib/favicon";

const HOST = "github.com";
const [PRIMARY, SECOND, THIRD, FOURTH] = faviconCandidates(HOST).map((c) => c.url);

/** 构造一个带 content-type 的假响应 */
function imageResponse(contentType: string, status = 200) {
  return new Response(new Uint8Array([1, 2, 3]), {
    status,
    headers: { "content-type": contentType },
  });
}

describe("probeFavicon（候选源探测策略）", () => {
  beforeEach(() => {
    mocks.assertPublicHttpUrl.mockReset();
    mocks.assertPublicHttpUrl.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("站点自身 favicon.ico 可用时直接采用，不再请求第三方源", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url) === PRIMARY ? imageResponse("image/x-icon") : imageResponse("image/png"),
    );
    vi.stubGlobal("fetch", fetchMock);

    const hit = await probeFavicon(HOST);

    expect(hit?.url).toBe(PRIMARY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("站点自身图标不可用时，按优先级取其余源中第一个成功的", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u === PRIMARY) return imageResponse("text/html", 404);
      if (u === SECOND) return imageResponse("image/svg+xml");
      return imageResponse("image/png");
    });
    vi.stubGlobal("fetch", fetchMock);

    const hit = await probeFavicon(HOST);

    // favicon.im（第二个候选）优先级高于 iowen / Google
    expect(hit?.url).toBe(SECOND);
  });

  it("返回 HTML 的候选视为无效（避免把 SPA 首页当成图标）", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u === PRIMARY) return imageResponse("text/html");
      if (u === SECOND) return imageResponse("image/svg+xml");
      return imageResponse("image/png");
    });
    vi.stubGlobal("fetch", fetchMock);

    const hit = await probeFavicon(HOST);

    expect(hit?.url).toBe(SECOND);
  });

  it("所有候选都不可用（含 4xx / HTML / 异常）时返回 null", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await probeFavicon(HOST)).toBeNull();
    // 主候选 1 次 + 其余候选并行各 1 次
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("目标域名无法解析/为内网地址时直接返回 null，且不发起任何请求", async () => {
    mocks.assertPublicHttpUrl.mockRejectedValue(new Error("目标地址为内网/保留地址，已拒绝"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await probeFavicon(HOST)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("所有候选地址都带上目标主机，第三方源不会串到别的主机", async () => {
    const requested: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      requested.push(String(url));
      return imageResponse("image/png", 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    await probeFavicon("sxlb.xyz");

    expect(requested).toContain(THIRD.replace(HOST, "sxlb.xyz"));
    expect(requested).toContain(FOURTH.replace(HOST, "sxlb.xyz"));
    expect(requested.every((u) => u.includes("sxlb.xyz"))).toBe(true);
  });

  it("重定向到内网地址时不跟随（防盲 SSRF）", async () => {
    // SSRF 校验对 127.0.0.1 抛错，模拟 lib/ssrf 的真实行为
    mocks.assertPublicHttpUrl.mockImplementation(async (u: string) => {
      if (u.includes("127.0.0.1")) throw new Error("目标地址为内网/保留地址，已拒绝");
    });
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u === PRIMARY) {
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } });
      }
      return imageResponse("image/png", 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await probeFavicon(HOST)).toBeNull();
    // 关键：从未真正请求过内网地址
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes("127.0.0.1"))).toBe(true);
  });

  it("重定向到公网地址时正常跟随（不影响真实图标源）", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u === PRIMARY) {
        return new Response(null, { status: 302, headers: { location: "https://cdn.example.com/icon.png" } });
      }
      if (u === "https://cdn.example.com/icon.png") return imageResponse("image/png");
      return imageResponse("image/png", 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    expect((await probeFavicon(HOST))?.url).toBe(PRIMARY);
  });

  it("重定向次数超过上限时放弃该候选", async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n += 1;
      return new Response(null, {
        status: 302,
        headers: { location: `https://loop.example.com/${n}` },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await probeFavicon(HOST)).toBeNull();
  });
});

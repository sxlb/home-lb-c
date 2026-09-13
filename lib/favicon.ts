import { assertPublicHttpUrl } from "@/lib/ssrf";

/**
 * 网站图标（favicon）自动探测：
 * 后台「从网站获取」此前直接拼接 google.com/s2/favicons —— 国内网络通常不可达，
 * 拿到的是打不开的图片。这里改为服务端按优先级依次探测，返回首个**真实可用**的地址。
 */

export interface FaviconCandidate {
  /** 候选图标地址 */
  url: string;
  /** 来源说明（用于后台提示） */
  source: string;
}

/**
 * 从用户输入提取主机名。
 * 兼容三种写法：`github.com`、`https://github.com/sxlb`、`github.com/sxlb`。
 * 非法（含空格、无点、路径穿越等）返回 null。
 */
export function extractHostname(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (!host.includes(".") || host.startsWith(".") || host.endsWith(".") || host.includes("..")) return null;
  return host;
}

/**
 * 候选图标源，按可靠性排序：
 * 1) 站点自身 /favicon.ico —— 最权威、无第三方依赖
 * 2) favicon.im —— 国内可访问的免费图标服务
 * 3) iowen 图标库 —— 国内常用备用源
 * 4) Google favicon —— 最后兜底（国内可能不可达）
 */
export function faviconCandidates(host: string): FaviconCandidate[] {
  return [
    { url: `https://${host}/favicon.ico`, source: "站点自身 favicon.ico" },
    { url: `https://favicon.im/${host}`, source: "favicon.im" },
    { url: `https://api.iowen.cn/favicon/${host}.png`, source: "iowen 图标库" },
    { url: `https://www.google.com/s2/favicons?domain=${host}&sz=64`, source: "Google favicon（备用）" },
  ];
}

/** 探测单个候选地址是否返回真实图片（带 SSRF 校验与超时） */
async function isReachable(url: string, timeoutMs: number): Promise<boolean> {
  try {
    await assertPublicHttpUrl(url);
  } catch {
    return false;
  }
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "home-lb-favicon/1.0", Accept: "image/*,*/*;q=0.8" },
    });
    if (!res.ok) return false;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType.startsWith("image/")) return true;
    // 少数站点以 octet-stream 返回图标：读少量数据确认非空，避免把空响应当成图标
    if (contentType.includes("octet-stream")) {
      const buf = await res.arrayBuffer();
      return buf.byteLength > 0;
    }
    // 明确是 HTML（常见于 SPA 把未知路径回落到首页）：视为无效
    return false;
  } catch {
    return false;
  }
}

/**
 * 依次探测候选源，返回首个真实可用的地址；全部不可用返回 null。
 * 用总超时兜底，避免多个候选串行叠加导致接口长时间不响应。
 *
 * 探测前先确认目标主机能解析且为公网地址：否则像 favicon.im 这类服务对
 * 不存在的域名也会返回一张占位图，会把「域名写错」伪装成「已获取到图标」。
 */
export async function probeFavicon(host: string, perTryMs = 3000, totalMs = 8000): Promise<FaviconCandidate | null> {
  try {
    await assertPublicHttpUrl(`https://${host}/`);
  } catch {
    return null;
  }

  const deadline = Date.now() + totalMs;
  for (const candidate of faviconCandidates(host)) {
    const remaining = deadline - Date.now();
    if (remaining <= 500) break;
    if (await isReachable(candidate.url, Math.min(perTryMs, remaining))) {
      return candidate;
    }
  }
  return null;
}

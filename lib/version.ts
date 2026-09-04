import packageJson from "../package.json";

/**
 * 版本与发布检测：
 * - CURRENT_VERSION 在构建时由 package.json 版本号内联（Next 会打包 JSON），
 *   因此运行时（含 standalone 产物）无需依赖 package.json 文件即可获得当前版本。
 * - fetchLatestRelease 通过 GitHub Releases API 探测远端最新版本，用于"检测到新版本"。
 */

/**
 * 当前应用版本。
 * 优先取宿主机记录的已部署版本（APP_VERSION，由部署方注入，形如 home-2026-8-26-01-19-01），
 * 缺省回退 package.json 的语义化版本。二者均用于"是否有新版本"的判断基准。
 */
export const CURRENT_VERSION = process.env.APP_VERSION || packageJson.version;

export const GITHUB_REPO = "sxlb/home-lb-c";

/** 一次发布的概要信息（来自 GitHub Releases API） */
export interface ReleaseInfo {
  tag: string; // 如 v1.2.0
  version: string; // 标准化后的版本号，如 1.2.0
  name: string;
  body: string; // 发布说明（Markdown）
  htmlUrl: string;
  publishedAt: string; // ISO 时间
}

/** 将 git tag 规范化为无 v 前缀的版本号（v1.2.0 -> 1.2.0） */
export function normalizeVersion(tag: string): string {
  return String(tag || "").replace(/^v/i, "");
}

/** home-时间戳 tag 的分段提取：home-2026-8-26-01-19-01 -> [2026,8,26,1,19,1]；非该格式返回 null */
function timestampParts(tag: string): number[] | null {
  const m = /^home-(\d{4})-(\d{1,2})-(\d{1,2})-(\d{1,2})-(\d{1,2})-(\d{1,2})$/i.exec(String(tag || "").replace(/^v/i, ""));
  if (!m) return null;
  return m.slice(1).map(Number);
}

/** 判断是否为 home-时间戳 发布的 tag */
export function isTimestampTag(tag: string): boolean {
  return timestampParts(tag) !== null;
}

/**
 * 语义化版本比较（最多取前 3 段）：
 * 返回 a>b:1, a<b:-1, 相等:0。非法段按 0 处理，便于前端做"是否有新版本"判断。
 * 若两者均为本仓库的 home-时间戳 tag（home-YYYY-M-D-HH-MM-SS），按时间先后比较。
 */
export function compareVersions(a: string, b: string): number {
  const ta = timestampParts(a);
  const tb = timestampParts(b);
  if (ta || tb) {
    // 出现时间戳 tag 时：仅当另一方也是时间戳才可精确比较；
    // 一方非时间戳视为"早期/未知"版本（时间戳视为较新），避免误判无更新。
    if (!ta) return -1;
    if (!tb) return 1;
    for (let i = 0; i < 6; i++) {
      if (ta[i] > tb[i]) return 1;
      if (ta[i] < tb[i]) return -1;
    }
    return 0;
  }
  const pa = String(a || "").replace(/^v/i, "").split(".").slice(0, 3).map((n) => parseInt(n, 10));
  const pb = String(b || "").replace(/^v/i, "").split(".").slice(0, 3).map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** 判断远端 tag 是否为"较新版本"（标准化后比较） */
export function isNewerRelease(tag: string, current = CURRENT_VERSION): boolean {
  return compareVersions(normalizeVersion(tag), current) > 0;
}

/* ---------------- GitHub Releases 探测（含内存缓存，防触发限流） ---------------- */

interface FetchCache {
  at: number;
  data: ReleaseInfo | null;
  error?: string;
}

/** 进程级缓存（单实例部署适用）：避免频繁请求 GitHub API 触发 60 次/小时限流 */
const globalCache: Record<string, FetchCache | undefined> =
  (globalThis as unknown as { __updateReleaseCache?: Record<string, FetchCache> }).__updateReleaseCache ??= {};

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 分钟

function mapRelease(raw: Record<string, unknown>): ReleaseInfo {
  const tag = String(raw.tag_name ?? "");
  return {
    tag,
    version: normalizeVersion(tag),
    name: String(raw.name ?? tag),
    body: String(raw.body ?? ""),
    htmlUrl: String(raw.html_url ?? ""),
    publishedAt: String(raw.published_at ?? ""),
  };
}

export interface FetchLatestResult {
  data: ReleaseInfo | null;
  fromCache: boolean;
  error?: string;
}

/**
 * 获取 GitHub 最新 release。带 10 分钟内存缓存；force=true 时绕过缓存强制刷新。
 * 失败返回 { data:null, error }，不抛异常（让上层把"检测失败"呈现给用户而非崩溃）。
 */
export async function fetchLatestRelease(force = false): Promise<FetchLatestResult> {
  const cached = globalCache.latest;
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { data: cached.data, fromCache: true, error: cached.error };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

    if (!res.ok) {
      // 404 = 仓库还没有 release
      const error = res.status === 404 ? "暂无已发布的版本" : `GitHub 请求失败（HTTP ${res.status}）`;
      globalCache.latest = { at: Date.now(), data: null, error };
      return { data: null, fromCache: false, error };
    }

    const raw = (await res.json()) as Record<string, unknown>;
    const data = mapRelease(raw);
    globalCache.latest = { at: Date.now(), data };
    return { data, fromCache: false };
  } catch (e) {
    const error = e instanceof Error ? e.message : "网络错误";
    globalCache.latest = { at: Date.now(), data: null, error };
    return { data: null, fromCache: false, error };
  }
}

/** 供测试清空缓存 */
export function resetReleaseCache(): void {
  delete globalCache.latest;
}
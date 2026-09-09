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

const CACHE_TTL_MS = 10 * 60 * 1000; // 成功结果 10 分钟
// 错误（超时/网络抖动）短 TTL：临时性问题应快速自愈，避免用户反复点"检查更新"却一直拿到旧错误
const ERROR_CACHE_TTL_MS = 30 * 1000;

/* ---------------- GitHub API 多源（官方优先，失败降级公共代理）+ 测速选源 ---------------- */

const OFFICIAL_BASE = "https://api.github.com";

/** 默认公共代理镜像（官方不可达时按序降级）。可用环境变量 GITHUB_API_MIRRORS（逗号分隔）覆盖 */
const DEFAULT_MIRRORS: string[] = [
  // 实测仅 gh-proxy.com 支持 GitHub Releases JSON API（其余常见镜像只代理文件下载，返回 403）
  "https://gh-proxy.com/",
];

const RELEASE_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const SPEED_TEST_TIMEOUT_MS = 3000; // 单个候选源测速超时
const REQUEST_TIMEOUT_MS = 8000; // 真实请求超时
const SPEED_CACHE_TTL_MS = 60 * 1000; // 测速结果缓存 60s，避免频繁探测触发限流

function configuredMirrors(): string[] {
  const raw = (process.env.GITHUB_API_MIRRORS || "").trim();
  if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return DEFAULT_MIRRORS;
}

/** 由候选源 base 拼接 GH 最新 release 端点：官方直接加路径，代理前缀 + 完整官方 URL */
function releaseUrl(base: string): string {
  return `${base}repos/${GITHUB_REPO}/releases/latest`;
}

/** 测速：探测某源可达性并测其延迟（毫秒）。不可达返回 null */
async function testSource(base: string): Promise<{ base: string; ms: number } | null> {
  const started = Date.now();
  try {
    // 用真实端点探测——既能测速又能直接拿到数据（若命中则免去二次请求）
    await fetch(releaseUrl(base), {
      headers: RELEASE_HEADERS,
      signal: AbortSignal.timeout(SPEED_TEST_TIMEOUT_MS),
      cache: "no-store",
    });
    return { base, ms: Date.now() - started };
  } catch {
    return null; // 超时/网络错误视为不可达
  }
}

let speedCacheAt = 0;
let speedOrder: string[] = [];

/**
 * 返回候选源顺序：官方始终居首（满足"默认官方优先"）；若官方不可达则跳过，
 * 其余代理按测速延迟升序排列（结果缓存 60s，避免频繁探测触发限流）。
 * 全不可达时退化为仅保留官方，让外层请求得到友好错误而非空转。
 */
async function orderSources(): Promise<string[]> {
  if (speedOrder.length && Date.now() - speedCacheAt < SPEED_CACHE_TTL_MS) return speedOrder;
  const official = await testSource(OFFICIAL_BASE);
  const mirrorResults = await Promise.all(configuredMirrors().map((m) => testSource(m)));
  const reachableMirrors = (mirrorResults.filter((r) => r !== null) as { base: string; ms: number }[])
    .sort((a, b) => a.ms - b.ms)
    .map((r) => r.base);
  speedOrder =
    (official ? [official.base] : []).concat(reachableMirrors).length
      ? (official ? [official.base] : []).concat(reachableMirrors)
      : [OFFICIAL_BASE];
  speedCacheAt = Date.now();
  return speedOrder;
}

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
 * 获取 GitHub 最新 release，官方源优先，失败自动降级到公共代理。
 * 成功结果带 10 分钟内存缓存，错误结果仅缓存 30 秒（允许快速自愈）；
 * force=true 时绕过进程级缓存强制刷新（仍复用 60s 测速结果，不重复探测）。
 * 全部源失败才返回 { data:null, error }（已映射为友好中文提示），不抛异常。
 */
export async function fetchLatestRelease(force = false): Promise<FetchLatestResult> {
  const cached = globalCache.latest;
  if (cached) {
    const isError = cached.error !== undefined;
    const ttl = isError ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS;
    if (!force && Date.now() - cached.at < ttl) {
      return { data: cached.data, fromCache: true, error: cached.error };
    }
  }

  const sources = await orderSources();
  let lastError: string | undefined;

  for (const base of sources) {
    try {
      const res = await fetch(releaseUrl(base), {
        headers: RELEASE_HEADERS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });

      if (!res.ok) {
        // 404 = 仓库还没有 release（在哪个源都一样，可直接定性返回）
        if (res.status === 404) {
          const error = "暂无已发布的版本";
          globalCache.latest = { at: Date.now(), data: null, error };
          return { data: null, fromCache: false, error };
        }
        lastError = `GitHub 请求失败（HTTP ${res.status}）`;
        continue; // 本源异常，降级到下一个源
      }

      const data = mapRelease((await res.json()) as Record<string, unknown>);
      globalCache.latest = { at: Date.now(), data };
      return { data, fromCache: false };
    } catch (e) {
      // 超时/网络/解析失败：记录友好提示后降级到下一个源
      const isTimeout =
        e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError" || /timeout|aborted/i.test(e.message));
      lastError = isTimeout ? "检测最新版本超时，请稍后重试" : "网络错误，获取最新版本失败，请重试";
    }
  }

  globalCache.latest = { at: Date.now(), data: null, error: lastError };
  return { data: null, fromCache: false, error: lastError };
}

/** 供测试清空缓存（含测速缓存，保证隔离） */
export function resetReleaseCache(): void {
  delete globalCache.latest;
  speedOrder = [];
  speedCacheAt = 0;
}
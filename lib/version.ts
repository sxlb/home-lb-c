import path from "node:path";
import { promises as fs } from "node:fs";
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

/* ---------------- 宿主机版本缓存（权威来源） ---------------- */
// 容器内 Node 直连 GitHub 不稳定（api.github.com 稳定超时、gh-proxy.com 间歇失败），
// 但宿主机网络可靠。故由宿主机 cron（update-watch.sh）轮询 GitHub 写入 latest.json，
// 容器优先读取该缓存。文件与 prod.db 同数据卷：宿主机 data/deploy/latest.json == 容器 /app/data/deploy/latest.json。
const HOST_CACHE_FILE = process.env.DEPLOY_DIR
  ? path.join(process.env.DEPLOY_DIR, "latest.json")
  : "/app/data/deploy/latest.json";
const HOST_CACHE_TTL_MS = 10 * 60 * 1000;

interface HostVersionCache {
  timestamp: number;
  data: ReleaseInfo | null;
  error?: string;
}

/** 读取宿主机写入的版本缓存；文件缺失/损坏/无时间戳时返回 null（不影响网络竞速兜底） */
async function readHostVersionCache(): Promise<HostVersionCache | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(HOST_CACHE_FILE, "utf8")) as {
      timestamp?: number;
      data?: ReleaseInfo | null;
      error?: string;
    };
    if (!parsed || typeof parsed.timestamp !== "number") return null;
    return { timestamp: parsed.timestamp, data: parsed.data ?? null, error: parsed.error };
  } catch {
    return null;
  }
}

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

const REQUEST_TIMEOUT_MS = 5000; // 单个源单次请求超时
const MAX_ROUNDS = 2; // 竞速总轮数：首轮失败后短暂间隔重试，抵御服务器出网间歇性丢包
const ROUND_GAP_MS = 300; // 轮次间间隔

function configuredMirrors(): string[] {
  const raw = (process.env.GITHUB_API_MIRRORS || "").trim();
  if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return DEFAULT_MIRRORS;
}

/** 由候选源 base 拼接 GH 最新 release 端点：官方直接加路径，代理前缀 + 完整官方 URL */
function releaseUrl(base: string): string {
  return `${base}repos/${GITHUB_REPO}/releases/latest`;
}

/** 候选源列表（去重，官方居首）。所有源始终参与检测，不做测速裁减——避免出网波动时误删可用的代理 */
function candidateSources(): string[] {
  return Array.from(new Set([OFFICIAL_BASE, ...configuredMirrors()]));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * 获取 GitHub 最新 release：所有候选源并发竞速，取最快成功；一轮全部失败则短暂间隔后整体重试一轮，
 * 以此抵御服务器出网间歇性丢包（同一源往往 1-2 次内即恢复）。任何时刻都保留全部源，不做测速裁减。
 * 成功结果带 10 分钟内存缓存，错误结果仅缓存 30 秒（允许快速自愈）；force=true 绕过进程级缓存。
 * 全部源均失败才返回 { data:null, error }（已映射为友好中文提示），不抛异常。
 */

type ProbeResult =
  | { kind: "ok"; data: ReleaseInfo }
  | { kind: "http"; status: number }
  | { kind: "timeout" }
  | { kind: "net" }
  | { kind: "noRelease" };

const TIMEOUT_RE = /timeout|aborted/i;

/** 单源单次探测：成功返回 release，否则返回定性错误（不做重试，重试在轮次层统一处理） */
async function probe(base: string): Promise<ProbeResult> {
  try {
    const res = await fetch(releaseUrl(base), {
      headers: RELEASE_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) {
      try {
        return { kind: "ok", data: mapRelease((await res.json()) as Record<string, unknown>) };
      } catch {
        return { kind: "net" }; // 响应体解析失败
      }
    }
    return { kind: "http", status: res.status };
  } catch (e) {
    const timeout =
      e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError" || TIMEOUT_RE.test(e.message));
    return { kind: timeout ? "timeout" : "net" };
  }
}

/** 汇总一轮全部失败结果，定性最贴切的失败原因（noRelease > timeout > http > net） */
function classify(results: ProbeResult[]): ProbeResult {
  if (results.some((r) => r.kind === "noRelease") || results.some((r) => r.kind === "http" && r.status === 404)) {
    return { kind: "noRelease" };
  }
  if (results.some((r) => r.kind === "timeout")) return { kind: "timeout" };
  const http = results.find((r) => r.kind === "http");
  if (http) return http;
  return { kind: "net" };
}

/** 一轮竞速：并发探测全部候选源，首个成功即返回（快源无需等慢源），全失败则汇总定性原因 */
async function raceOnce(sources: string[]): Promise<ProbeResult> {
  return new Promise<ProbeResult>((resolve) => {
    let settled = false;
    let failed = 0;
    const results = new Array<ProbeResult>(sources.length);
    sources.forEach((base, i) => {
      probe(base).then((r) => {
        if (settled) return;
        if (r.kind === "ok") {
          settled = true;
          resolve(r);
          return;
        }
        results[i] = r;
        failed++;
        if (failed === sources.length) {
          settled = true;
          resolve(classify(results));
        }
      });
    });
  });
}

export async function fetchLatestRelease(force = false): Promise<FetchLatestResult> {
  // 宿主机缓存为权威来源：新鲜即直接采用（并回写进程级缓存，避免后续反复读盘）；
  // 文件过期则保留为"末级兜底"，网络竞速全失败时降级返回过期数据，避免 UI 显示"未知"。
  let staleHost: HostVersionCache | null = null;
  if (!force) {
    const host = await readHostVersionCache();
    if (host) {
      const fresh = Date.now() - host.timestamp < HOST_CACHE_TTL_MS;
      if (fresh) {
        globalCache.latest = { at: Date.now(), data: host.data, error: host.error };
        return { data: host.data, fromCache: true, error: host.error };
      }
      staleHost = host;
    }
  }

  const cached = globalCache.latest;
  if (cached) {
    const isError = cached.error !== undefined;
    const ttl = isError ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS;
    if (!force && Date.now() - cached.at < ttl) {
      return { data: cached.data, fromCache: true, error: cached.error };
    }
  }

  const sources = candidateSources();
  let last: ProbeResult | undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await raceOnce(sources);
    if (res.kind === "ok") {
      globalCache.latest = { at: Date.now(), data: res.data };
      return { data: res.data, fromCache: false };
    }
    if (res.kind === "noRelease") {
      const message = "暂无已发布的版本";
      globalCache.latest = { at: Date.now(), data: null, error: message };
      return { data: null, fromCache: false, error: message };
    }
    last = res;
    if (round < MAX_ROUNDS - 1) await sleep(ROUND_GAP_MS);
  }

  // 网络全失败：优先降级到宿主机缓存的过期版本数据，其次复用其错误/失败说明
  if (staleHost?.data) {
    globalCache.latest = { at: Date.now(), data: staleHost.data };
    return { data: staleHost.data, fromCache: true };
  }
  const message =
    last?.kind === "timeout" ? "检测最新版本超时，请稍后重试" : "网络错误，获取最新版本失败，请重试";
  if (staleHost?.error) {
    globalCache.latest = { at: Date.now(), data: null, error: staleHost.error };
    return { data: null, fromCache: true, error: staleHost.error };
  }
  globalCache.latest = { at: Date.now(), data: null, error: message };
  return { data: null, fromCache: false, error: message };
}

/** 供测试清空缓存，保证隔离 */
export function resetReleaseCache(): void {
  delete globalCache.latest;
}
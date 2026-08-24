import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { assertPublicHttpUrl } from "@/lib/ssrf";

/**
 * ===== 壁纸服务端缓存 =====
 *
 * 目的：壁纸源（必应 / MWM 图床）随时可能失效，将壁纸下载到服务器本地缓存，
 * 页面展示一律走本地文件，源 API 挂掉也不影响已有壁纸展示。
 *
 * 机制：
 * - 缓存目录：<cwd>/data/wallpapers（.gitignore 已排除 data/，Docker 卷映射目录）
 * - 上限：MAX_CACHE_SIZE = 100 张，超出时按 addedAt 删除最旧的
 * - manifest.json 记录缓存清单（文件名/来源/时间/大小）与上次刷新时间
 * - 刷新间隔（后台可配 0/3/10/30 分钟）：请求到来时若到期则后台静默预取一张新壁纸，
 *   无访问则不刷新（不占用服务器资源）
 * - 所有写操作串行化（内存队列），避免并发请求竞争写坏 manifest / 目录
 */

/** 缓存文件上限（张） */
export const MAX_CACHE_SIZE = 100;
/** 单张图片大小上限（字节）：20MB */
const MAX_FILE_SIZE = 20 * 1024 * 1024;
/** 下载超时（ms） */
const DOWNLOAD_TIMEOUT = 15_000;
/** 相邻两次下载的最小间隔（ms）：防止短时间连续请求壁纸源被屏蔽 */
const MIN_DOWNLOAD_GAP_MS = 5_000;

/** 壁纸缓存目录 */
export function getWallpaperCacheDir(): string {
  return path.join(process.cwd(), "data", "wallpapers");
}

const MANIFEST_FILE = () => path.join(getWallpaperCacheDir(), "manifest.json");

interface CacheEntry {
  fileName: string;
  sourceUrl: string;
  addedAt: number;
  size: number;
}

interface Manifest {
  entries: CacheEntry[];
  lastRefreshAt: number | null;
  /** 上次下载/尝试时刻（用于节流，持久化避免重启后突发请求） */
  lastDownloadAt: number | null;
}

/** 空清单工厂：每次返回新对象，避免共享引用被并发操作污染 */
function emptyManifest(): Manifest {
  return { entries: [], lastRefreshAt: null, lastDownloadAt: null };
}

/** 串行化写操作的执行队列（模块级单例，单进程内有效） */
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {
    /* 错误由调用方处理，队列继续 */
  });
  return run;
}

/** 确保缓存目录存在 */
async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(getWallpaperCacheDir(), { recursive: true });
}

/** 读取 manifest；不存在/损坏时返回空清单 */
async function loadManifest(): Promise<Manifest> {
  try {
    const raw = await fs.readFile(MANIFEST_FILE(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Manifest>;
    if (!Array.isArray(parsed.entries)) return emptyManifest();
    return {
      entries: parsed.entries as CacheEntry[],
      lastRefreshAt: typeof parsed.lastRefreshAt === "number" ? parsed.lastRefreshAt : null,
      lastDownloadAt: typeof parsed.lastDownloadAt === "number" ? parsed.lastDownloadAt : null,
    };
  } catch {
    return emptyManifest();
  }
}

/** 保存 manifest */
async function saveManifest(manifest: Manifest): Promise<void> {
  await ensureCacheDir();
  await fs.writeFile(MANIFEST_FILE(), JSON.stringify(manifest), "utf8");
}

/** Content-Type → 文件扩展名；非图片返回空 */
function extFromContentType(contentType: string): string {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
  };
  return map[mime] || "";
}

/** 扩展名 → Content-Type（供本地文件响应使用） */
function contentTypeFromExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
  };
  return map[ext] || "application/octet-stream";
}

/** 下载图片（SSRF 校验 + 超时 + 类型/大小校验），失败抛错 */
async function downloadImage(sourceUrl: string): Promise<{ buffer: Buffer; ext: string }> {
  const url = await assertPublicHttpUrl(sourceUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);
  try {
    const res = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; homepage-bot/1.0)" },
    });
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
    const ext = extFromContentType(res.headers.get("content-type") || "");
    if (!ext) throw new Error(`非图片响应：${res.headers.get("content-type") || "unknown"}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0) throw new Error("图片内容为空");
    if (buffer.byteLength > MAX_FILE_SIZE) throw new Error("图片超过 20MB 限制");
    return { buffer, ext };
  } finally {
    clearTimeout(timer);
  }
}

/** 生成唯一安全的文件名 */
function newFileName(ext: string): string {
  return `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
}

/**
 * 下载并加入缓存（必须在 enqueue 内调用，保证写操作串行）。
 * 返回文件名；下载失败返回 null。
 *
 * 节流：相邻两次下载/尝试至少间隔 MIN_DOWNLOAD_GAP_MS，
 * 防止短时间连续请求壁纸源被屏蔽；失败也会记录尝试时刻，重试同样有间隔。
 */
async function addWallpaperLocked(sourceUrl: string, manifest: Manifest, now: number): Promise<string | null> {
  // 距上次尝试不足 5s：跳过本次（返回 null，前端走直连兜底）
  if (manifest.lastDownloadAt !== null && now - manifest.lastDownloadAt < MIN_DOWNLOAD_GAP_MS) {
    return null;
  }
  // 记录尝试时刻（成功/失败都持久化）
  manifest.lastDownloadAt = now;

  try {
    const { buffer, ext } = await downloadImage(sourceUrl);
    const fileName = newFileName(ext);
    await ensureCacheDir();
    await fs.writeFile(path.join(getWallpaperCacheDir(), fileName), buffer);

    manifest.entries.push({ fileName, sourceUrl, addedAt: now, size: buffer.byteLength });
    manifest.lastRefreshAt = now;

    // 超出上限：按加入时间删除最旧的文件
    if (manifest.entries.length > MAX_CACHE_SIZE) {
      const sorted = [...manifest.entries].sort((a, b) => a.addedAt - b.addedAt);
      const overflow = manifest.entries.length - MAX_CACHE_SIZE;
      for (let i = 0; i < overflow; i++) {
        const oldest = sorted[i];
        const idx = manifest.entries.indexOf(oldest);
        if (idx >= 0) manifest.entries.splice(idx, 1);
        await fs
          .rm(path.join(getWallpaperCacheDir(), oldest.fileName), { force: true })
          .catch(() => {
            /* 删除失败不影响主流程 */
          });
      }
    }

    await saveManifest(manifest);
    return fileName;
  } catch {
    // 下载/写入失败：不更新 lastRefreshAt（下次到期自动重试），
    // 但持久化 lastDownloadAt 节流标记，保证重试也有间隔
    await saveManifest(manifest).catch(() => {
      /* 保存失败静默 */
    });
    return null;
  }
}

/**
 * 从缓存随机取一张壁纸；缓存为空返回 null。
 * 读取不经过写队列（允许读到稍旧的 manifest，可接受）。
 */
export async function getRandomCachedWallpaper(): Promise<string | null> {
  try {
    const manifest = await loadManifest();
    if (manifest.entries.length === 0) return null;
    const idx = Math.floor(Math.random() * manifest.entries.length);
    return manifest.entries[idx].fileName;
  } catch {
    return null;
  }
}

/**
 * 下载一张壁纸并加入缓存（缓存为空时的首次填充）。
 * 成功返回文件名，失败返回 null。
 */
export function downloadAndCacheWallpaper(sourceUrl: string): Promise<string | null> {
  return enqueue(async () => {
    const manifest = await loadManifest();
    return addWallpaperLocked(sourceUrl, manifest, Date.now());
  });
}

/**
 * 按刷新间隔后台预取：到期时下载一张新壁纸入缓存（轮换），否则跳过。
 * intervalMin：0 表示不刷新；5 / 10 / 30 分钟。
 * 全程静默，失败不影响响应（下次请求自动重试）。
 */
export function maybePrefetchWallpaper(sourceUrl: string, intervalMin: number): Promise<void> {
  if (intervalMin <= 0) return Promise.resolve();
  return enqueue(async () => {
    const manifest = await loadManifest();
    const now = Date.now();
    const due = manifest.lastRefreshAt === null || now - manifest.lastRefreshAt >= intervalMin * 60_000;
    if (!due) return;
    await addWallpaperLocked(sourceUrl, manifest, now);
  });
}

/**
 * 读取本地缓存图片。文件名不合法 / 不存在返回 null。
 */
export async function readCachedWallpaper(
  fileName: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  // 白名单字符 + 禁止目录穿越（".." / "."）
  if (!/^[0-9a-zA-Z_.-]+$/.test(fileName)) return null;
  if (fileName === "." || fileName === ".." || fileName.includes("..")) return null;
  const filePath = path.join(getWallpaperCacheDir(), fileName);
  // 双重保险：确保解析结果仍位于缓存目录内（防路径穿越）
  if (!filePath.startsWith(getWallpaperCacheDir() + path.sep)) return null;
  try {
    const buffer = await fs.readFile(filePath);
    return { buffer, contentType: contentTypeFromExt(fileName) };
  } catch {
    return null;
  }
}

import { getRandomCachedWallpaper } from "@/lib/wallpaperCache";

/**
 * SSR 阶段解析壁纸直链（仅走快速路径，绝不阻塞首屏渲染）：
 * - 自定义直链：直接返回
 * - 已有缓存：随机返回一张本地缓存壁纸
 * - 无缓存：返回空串，由前端 /api/wallpaper 触发首次下载
 *
 * 不做网络请求（不解析壁纸源、不下载），仅做一次本地文件清单读取，
 * 因此即使在 ISR/SSR 流程中执行也足够快。
 */
export async function resolveWallpaperUrl(bgApi: string): Promise<string> {
  const custom = bgApi.trim();
  if (custom) return custom;
  try {
    const cached = await getRandomCachedWallpaper();
    return cached ? `/api/wallpaper/file/${cached}` : "";
  } catch {
    return "";
  }
}

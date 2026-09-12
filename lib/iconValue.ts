/**
 * 图标 / 封面值解析工具（前后端共用，纯函数）
 *
 * 支持的值形态：
 * - 图标名：iconfont symbol（如 icon-github）、lucide（lucide:github）
 * - 图片：http(s):// 外链、/api/uploads/ 媒体库路径
 * - 随机图：random:关键词（当前写法）
 *
 * 说明：旧前缀 `unsplash:关键词` 中依赖的 source.unsplash.com 已停止服务（返回 503），
 * 现统一改用 loremflickr 关键词随机图；旧前缀仅作兼容识别，避免历史数据渲染成破图。
 */

/** 随机图值前缀（当前写法） */
export const RANDOM_PREFIX = "random:";
/** 旧随机图前缀（source.unsplash.com 已停服，仅兼容识别） */
export const LEGACY_RANDOM_PREFIX = "unsplash:";

/** 判断是否为随机图值（兼容新旧前缀） */
export function isRandomImageValue(value: string): boolean {
  return value.startsWith(RANDOM_PREFIX) || value.startsWith(LEGACY_RANDOM_PREFIX);
}

/** 从随机图值中提取关键词（无关键词时返回空串） */
export function extractRandomKeyword(value: string): string {
  if (value.startsWith(RANDOM_PREFIX)) return value.slice(RANDOM_PREFIX.length);
  if (value.startsWith(LEGACY_RANDOM_PREFIX)) return value.slice(LEGACY_RANDOM_PREFIX.length);
  return "";
}

/**
 * 按关键词生成随机图直链。
 * 使用 loremflickr（Flickr 图源，无需 API Key），每次请求可能返回不同图片，
 * 适合「未设置封面图时随机展示」的场景；如需可控版权的图片请使用 Openverse 搜索并保存直链。
 */
export function getRandomImageUrl(keyword: string, width: number, height: number = width): string {
  const kw = encodeURIComponent(keyword.trim() || "random");
  return `https://loremflickr.com/${width}/${height}/${kw}`;
}

/**
 * 解析「图片型」图标 / 封面值 → 可渲染的图片地址。
 * - random: / unsplash: 关键词 → 随机图直链
 * - http(s):// 外链、/api/uploads/ 媒体库路径 → 原样返回
 * - 其他（纯图标名）→ null，由调用方走图标渲染分支
 */
export function resolveIconImageSrc(value: string, size: number): string | null {
  if (!value) return null;
  if (isRandomImageValue(value)) return getRandomImageUrl(extractRandomKeyword(value), size);
  if (/^(https?:\/\/|\/api\/uploads\/)/i.test(value)) return value;
  return null;
}

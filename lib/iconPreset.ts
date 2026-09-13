/**
 * @vicons/fa 预设图标名映射（前后台共用，纯数据 + 纯函数）
 *
 * 背景：`D:\wenjian\home\home`（Vue 版）的 WebIcon.vue 直接引用 `@vicons/fa` 组件，
 * 历史数据里存的是 PascalCase 预设名（如 "Blog" / "CompactDisc"）。
 * home-lb 是 React 项目，没有也不应引入 Vue 专用图标包，因此这里维护一份
 * 「预设名 → lucide 图标名（kebab-case）」的映射表，保证同一份历史数据
 * 在两个项目里都能渲染出语义一致的图标。
 *
 * 注意：本文件不导入任何 React / lucide 组件，避免被打进不必要的 bundle；
 * 调用方拿到 kebab 名后再交给 components/lucideIconResolver 解析组件。
 */

/** @vicons/fa 预设名 → lucide 白名单内的 kebab 图标名 */
export const FA_PRESET_TO_LUCIDE: Record<string, string> = {
  Blog: "newspaper",
  Cloud: "cloud",
  CompactDisc: "disc",
  Compass: "compass",
  Book: "book",
  Fire: "flame",
  LaptopCode: "code",
};

/** 全部预设名（供后台做快捷选择与占位提示，顺序与映射表一致） */
export const FA_PRESET_NAMES: string[] = Object.keys(FA_PRESET_TO_LUCIDE);

/**
 * 判断某个值是否为 @vicons/fa 预设名，是则返回对应的 lucide kebab 名，否则返回 null。
 * 大小写敏感：仅匹配历史数据的 PascalCase 写法，避免把 "blog" / "cloud"
 * 这类普通 lucide 图标名误判成预设名（它们本身就能直接解析）。
 */
export function resolveFaPresetLucideName(value: string | null | undefined): string | null {
  if (!value) return null;
  return FA_PRESET_TO_LUCIDE[value.trim()] ?? null;
}

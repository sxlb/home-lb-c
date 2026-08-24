/**
 * 主页数据准备（Server Helper）
 * 接收 Prisma Profile 行对象，返回组件所需的完整 props + 默认值 + CSS 派生计算结果。
 */

import { prisma } from "@/lib/db";
import { DEFAULT_WELCOME_MESSAGES } from "@/lib/validation";
import { resolveWallpaperUrl } from "@/lib/wallpaperServer";
import type { Profile } from "@prisma/client";
import type { ThemeMode } from "@/components/ThemeProvider";

// ── 静态常量：字体映射表（不依赖运行时） ──────────────────────
const LOGO_FONT_CLASS: Record<string, string> = {
  "ma-shan-zheng": "font-art-ma-shan",
  "zcool-kuail": "font-art-zcool",
  "long-cang": "font-art-long-cang",
  "zcool-xiaowei": "font-art-zcool-xiaowei",
  "zcool-qingke": "font-art-zcool-qingke",
  "liu-jian-mao-cao": "font-art-liu-jian-mao-cao",
  "zhi-mang-xing": "font-art-zhi-mang-xing",
  "noto-serif-sc": "font-art-noto-serif-sc",
  "smiley-sans": "font-art-smiley-sans",
  "maoken-sans": "font-art-maoken-sans",
  yozai: "font-art-yozai",
  "lxgw-wen-kai": "font-art-lxgw-wen-kai",
  "alimama-daka": "font-art-alimama-daka",
  "dingtalk-jinbuti": "font-art-dingtalk-jinbuti",
  hongleixingshu: "font-art-hongleixingshu",
  xiaolai: "font-art-xiaolai",
  slidefu: "font-art-slidefu",
  slideqiuhong: "font-art-slideqiuhong",
};

export interface SiteLinkRow {
  id: number;
  name: string;
  url: string;
  icon?: string;
  sort: number;
}

export interface SocialLinkRow {
  id: number;
  name: string;
  icon: string;
  url: string;
  tip: string;
  sort: number;
}

export interface FriendLinkRow {
  id: number;
  name: string;
  url: string;
  icon: string;
  description: string;
  sort: number;
}

// ── 头像相关工具函数 ──────────────────────────────────────────

interface AvatarFallbacks {
  finalAvatar: string;
  avatarShapeClass: string;
  avatarStyle: React.CSSProperties | undefined;
}

// 随机头像结果缓存（60s TTL）：外部头像源慢/抖动的去重缓存，避免每次 SSR 都打外部接口拖慢首屏
let avatarCache: { url: string; expireAt: number } | null = null;
const AVATAR_CACHE_TTL = 60 * 1000;

async function fetchRandomAvatar(): Promise<string> {
  if (avatarCache && avatarCache.expireAt > Date.now()) return avatarCache.url;
  try {
    const res = await fetch("https://v2.xxapi.cn/api/head?return=json", {
      next: { revalidate: 60 },
      // 外部头像源失败/超时不阻塞首页 SSR：1.5s 超时快速失败回退（配合上方缓存，源慢只影响首次）
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return "";
    const json = await res.json();
    const url = typeof json?.data === "string" && json.data ? json.data : "";
    if (url) avatarCache = { url, expireAt: Date.now() + AVATAR_CACHE_TTL };
    return url;
  } catch {
    return "";
  }
}

async function resolveAvatar(
  profile: Pick<Profile, "avatar" | "useRandomAvatar" | "avatarShape" | "avatarBorderColor">
): Promise<AvatarFallbacks> {
  const useRandomAvatar = profile.useRandomAvatar ?? false;
  let finalAvatar = profile.avatar || "";

  if (useRandomAvatar && !finalAvatar) {
    finalAvatar = await fetchRandomAvatar();
  }

  const shape = profile.avatarShape || "circle";
  const shapeClass =
    shape === "square" ? "rounded-none"
    : shape === "rounded" ? "rounded-2xl"
    : "rounded-full";

  const borderColor = profile.avatarBorderColor || "";
  const style = borderColor
    ? { boxShadow: `0 0 0 2px ${borderColor}, 0 8px 24px rgba(0, 0, 0, 0.35)` }
    : undefined;

  return { finalAvatar, avatarShapeClass: shapeClass, avatarStyle: style };
}

// ── 季节特效 ──────────────────────────────────────────────────
export type SeasonEffect = "firefly" | "snow" | "lantern";

export function getSeasonalEffect(): SeasonEffect {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 11) return "firefly";
  return (month === 1 || month === 2) ? "lantern" : "snow";
}

// ── 核心导出：将 Profile 转换为 Home component props ────
// 注意：这是服务端数据准备函数（非 React Hook），刻意不用 use 前缀，
// 避免被 react-hooks/rules-of-hooks 误判为 Hook 并限制调用位置。
export async function getHomeData(profile: Profile | null): Promise<{
  // ===== 基础信息 =====
  nickname: string;
  bio: string;
  finalAvatar: string;
  siteIcon: string;
  bgApi: string;
  /** SSR 阶段解析的壁纸直链（空串表示需前端兜底下载） */
  wallpaperUrl: string;

  // ===== 进阶配置 =====
  coverType: string;
  autoBGSwitchInterval: number;
  wallpaperRefresh: number;
  theme: ThemeMode;
  songApi: string;
  songServer: string;
  songId: string;
  siteUrl: string;
  siteIcp: string;
  siteMps: string;
  siteStart: string;
  siteLinksTitle: string;
  siteLinksIcon: string;
  friendLinksTitle: string;
  /** 阿里云矢量图标库 symbol 脚本地址（空串表示未配置） */
  iconfontUrl: string;
  logoFontClass: string;
  loadingScreen: boolean;
  clickEffect: boolean;
  consoleEgg: boolean;
  showStats: boolean;
  dynamicTitle: boolean;
  topProgressBar: boolean;
  welcomeEnabled: boolean;
  welcomeIndex: number;
  welcomeMessages: string;

  // ===== 高级配置 =====
  accentColor: string;
  glassOpacity: number;
  glassBlur: number;
  analyticsScript: string;
  headScript: string;
  timeFormat: string;
  showSeconds: boolean;
  dateFormat: string;
  hitokotoType: string;
  bgOverlay: number;
  avatarShapeClass: string;
  avatarStyle: React.CSSProperties | undefined;
  /** 自定义头像边框色（空串时前端使用默认白色半透明描边） */
  avatarBorderColor: string;

  // ===== 关联数据 =====
  siteLinks: SiteLinkRow[];
  socialLinks: SocialLinkRow[];
  friendLinks: FriendLinkRow[];
  effectType: SeasonEffect;
}> {
  const rawNickname = profile?.nickname || "无名";
  const avatarPivot = {
    avatar: profile?.avatar || "",
    useRandomAvatar: profile?.useRandomAvatar ?? false,
    avatarShape: profile?.avatarShape || "circle",
    avatarBorderColor: profile?.avatarBorderColor || "",
  };

  // 并行执行五个独立的异步操作，缩短 SSR 时间
  const [avatarResult, wallpaperUrl, siteLinks, socialLinks, friendLinks] = await Promise.all([
    resolveAvatar(avatarPivot),
    resolveWallpaperUrl(profile?.bgApi || ""),
    prisma.siteLink
      .findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] })
      .catch(() => [] as SiteLinkRow[]),
    prisma.socialLink
      .findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] })
      .catch(() => [] as SocialLinkRow[]),
    prisma.friendLink
      .findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] })
      .catch(() => [] as FriendLinkRow[]),
  ]);

  const { finalAvatar, avatarShapeClass, avatarStyle } = avatarResult;

  return {
    // 基础
    nickname: rawNickname,
    bio: profile?.bio || "这个人很懒，什么都没写",
    finalAvatar,
    siteIcon: profile?.siteIcon || "",
    bgApi: profile?.bgApi || "",
    // SSR 阶段解析壁纸直链（用于 <link rel="preload"> 与首次直接加载）
    wallpaperUrl,

    // 进阶
    coverType: profile?.coverType || "bing",
    autoBGSwitchInterval: profile?.autoBGSwitchInterval ?? 0,
    wallpaperRefresh: profile?.wallpaperRefresh ?? 0,
    theme: (profile?.theme || "system") as ThemeMode,
    songApi: profile?.songApi || "",
    songServer: profile?.songServer || "netease",
    songId: profile?.songId || "",
    siteUrl: profile?.siteUrl || "",
    siteIcp: profile?.siteIcp || "",
    siteMps: profile?.siteMps || "",
    siteStart: profile?.siteStart || "",
    siteLinksTitle: profile?.siteLinksTitle || "我的网站",
    siteLinksIcon: profile?.siteLinksIcon || "link",
    friendLinksTitle: profile?.friendLinksTitle || "友情链接",
    iconfontUrl: profile?.iconfontUrl || "",
    logoFontClass: (profile?.logoArtFont ?? true)
      ? (LOGO_FONT_CLASS[profile?.logoFont || "zcool-kuail"] || "font-art-zcool")
      : "font-bold",
    loadingScreen: profile?.loadingScreen ?? true,
    clickEffect: profile?.clickEffect ?? true,
    consoleEgg: profile?.consoleEgg ?? true,
    showStats: profile?.showStats ?? true,
    dynamicTitle: profile?.dynamicTitle ?? true,
    topProgressBar: profile?.topProgressBar ?? true,
    welcomeEnabled: profile?.welcomeEnabled ?? true,
    welcomeIndex: profile?.welcomeIndex ?? 0,
    welcomeMessages: profile?.welcomeMessages || JSON.stringify(DEFAULT_WELCOME_MESSAGES),

    // 高级
    accentColor: profile?.accentColor || "",
    glassOpacity: profile?.glassOpacity ?? 28,
    glassBlur: profile?.glassBlur ?? 16,
    analyticsScript: profile?.analyticsScript || "",
    headScript: profile?.headScript || "",
    timeFormat: profile?.timeFormat || "24",
    showSeconds: profile?.showSeconds ?? true,
    dateFormat: profile?.dateFormat || "YYYY年M月D日 dddd",
    hitokotoType: profile?.hitokotoType || "",
    bgOverlay: profile?.bgOverlay ?? 0,
    avatarShapeClass,
    avatarStyle,
    avatarBorderColor: profile?.avatarBorderColor || "",

    // 关联
    siteLinks,
    socialLinks,
    friendLinks,
    effectType: getSeasonalEffect(),
  };
}

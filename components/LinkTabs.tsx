"use client";

import { useState } from "react";
import {
  Users,
  BookOpen,
  Cloud,
  Music,
  Compass,
  Link,
  Flame,
  Monitor,
  Globe,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useIconfontSymbols } from "./Iconfont";
import { resolveLucideIcon, isLucideIcon } from "./lucideIconResolver";

// 图标映射表（与并入前的网站链接组件一致）
const ICON_MAP: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  book: BookOpen,
  cloud: Cloud,
  music: Music,
  compass: Compass,
  link: Link,
  flame: Flame,
  fire: Flame,
  monitor: Monitor,
  globe: Globe,
  website: Globe,
  default: Globe,
};

interface TabLink {
  id: number;
  name: string;
  icon: string;
  url: string;
  sort: number;
}

interface LinkTabsProps {
  /** 网站链接（tab「网站」） */
  siteLinks: TabLink[];
  /** 友情链接（tab「友情」） */
  friendLinks: TabLink[];
  /** 区域标题「网站」部分（后台可配置） */
  siteTitle?: string;
  /** 区域标题「友情」部分（后台可配置） */
  friendTitle?: string;
  /** 区域标题图标名（lucide/iconfont，统一用于组合标题） */
  siteIcon?: string;
}

// 每页 6 个（3 列 × 2 行），对齐原网站链接轮播布局
const PAGE_SIZE = 6;

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function isImageIcon(icon: string): boolean {
  return /^https?:\/\//i.test(icon);
}

export default function LinkTabs({
  siteLinks,
  friendLinks,
  siteTitle = "我的网站",
  friendTitle = "友情链接",
  siteIcon = "link",
}: LinkTabsProps) {
  const [tab, setTab] = useState<"site" | "friend">(siteLinks.length ? "site" : "friend");
  const [sitePage, setSitePage] = useState(0);
  const [friendPage, setFriendPage] = useState(0);
  const iconfontSymbols = useIconfontSymbols();

  if (siteLinks.length === 0 && friendLinks.length === 0) {
    return null;
  }

  // 当前活跃数据源与对应分页 state
  const active = tab === "site" ? siteLinks : friendLinks;
  const page = tab === "site" ? sitePage : friendPage;
  const setPage = tab === "site" ? setSitePage : setFriendPage;
  const isSite = tab === "site";

  const getIcon = (iconName: string): LucideIcon => {
    if (isLucideIcon(iconName)) {
      const LucideIconComp = resolveLucideIcon(iconName);
      if (LucideIconComp) return LucideIconComp;
    }
    const key = iconName.toLowerCase().replace(/[^a-z-]/g, "");
    return ICON_MAP[key] || ICON_MAP[iconName] || ICON_MAP.default;
  };

  // 「网站」tab 保留音乐触发特例（与并入前行为一致）
  const isMusicTrigger = (link: TabLink) => link.name === "音乐" || link.url === "music:";

  const handleClick = (link: TabLink) => {
    if (isSite && isMusicTrigger(link)) {
      const event = new CustomEvent("toggle-music-player");
      window.dispatchEvent(event);
      return;
    }
    // 热门链接统计：fire-and-forget 上报（失败静默，不影响跳转）
    try {
      fetch("/api/stats/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: link.id, name: link.name, url: link.url }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* 忽略 */
    }
    window.open(link.url, "_blank", "noopener,noreferrer");
  };

  const pages = chunk(active, PAGE_SIZE);
  const currentPage = Math.min(page, pages.length - 1);
  const goTo = (index: number) => setPage(index);

  const handleWheel = (e: React.WheelEvent) => {
    if (pages.length <= 1) return;
    if (e.deltaY > 0) {
      setPage((p) => Math.min(p + 1, pages.length - 1));
    } else {
      setPage((p) => Math.max(p - 1, 0));
    }
  };

  // 键盘翻页：左右方向键 / PageUp-PageDown / Home-End（对齐轮播滚轮交互）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (pages.length <= 1) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      setPage((p) => Math.min(p + 1, pages.length - 1));
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      setPage((p) => Math.max(p - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setPage(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setPage(pages.length - 1);
    }
  };

  // 组合标题：网站与友情的可配置标题合并为区域大标题（显眼），仅一类数据时只显示对应的标题
  const hasSite = siteLinks.length > 0;
  const hasFriend = friendLinks.length > 0;
  const shownSite = hasSite ? siteTitle : "";
  const shownFriend = hasFriend ? friendTitle : "";
  const titleText =
    shownSite && shownFriend
      ? `${shownSite} / ${shownFriend}`
      : shownSite || shownFriend || "网站链接";
  // 「网站」标题图标固定用网站图标（不随当前 tab 变化）；友情标题统一用 Users
  const siteIsIconfont = iconfontSymbols.includes(siteIcon);
  const SiteTitleGlyph = getIcon(siteIcon);

  return (
    <div className="site-links-container">
      {/* 左右两栏分隔：左端「我的网站」、右端「友情链接」，容器中央贯穿竖线形成「从中间分隔」；
          点击任一标题切换 tab，选中项白色 + 强调色下划线指示；单类数据时只显示该侧 */}
      <div className="relative mb-5 flex items-center rounded-2xl border border-white/10 bg-white/5 py-2.5 backdrop-blur-sm">
        {hasSite && (
          <button
            type="button"
            onClick={() => setTab("site")}
            aria-pressed={tab === "site"}
            aria-label={`切换至${shownSite || "网站"}`}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-1 text-base font-semibold transition-all duration-200 ${
              tab === "site" ? "text-white" : "text-white/55 hover:text-white/85"
            } ${tab === "site" && hasFriend ? "underline decoration-[2px] underline-offset-[6px]" : ""}`}
            style={
              tab === "site" && hasFriend
                ? { textDecorationColor: "var(--accent-color, #7dd3fc)" }
                : undefined
            }
          >
            {siteIsIconfont ? (
              <svg className="h-5 w-5 shrink-0" aria-hidden="true" focusable="false">
                <use href={`#${siteIcon}`} />
              </svg>
            ) : (
              <SiteTitleGlyph className="h-5 w-5 shrink-0" />
            )}
            {shownSite}
          </button>
        )}

        {/* 中央贯穿分隔线：仅两类都存在时从卡片中间分隔左/右两栏 */}
        {hasFriend && hasSite && (
          <span
            className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-white/15"
            aria-hidden
          />
        )}

        {hasFriend && (
          <button
            type="button"
            onClick={() => setTab("friend")}
            aria-pressed={tab === "friend"}
            aria-label={`切换至${shownFriend || "友情链接"}`}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-1 text-base font-semibold transition-all duration-200 ${
              tab === "friend" ? "text-white" : "text-white/55 hover:text-white/85"
            } ${tab === "friend" && hasSite ? "underline decoration-[2px] underline-offset-[6px]" : ""}`}
            style={
              tab === "friend" && hasSite
                ? { textDecorationColor: "var(--accent-color, #7dd3fc)" }
                : undefined
            }
          >
            <Users className="h-5 w-5 shrink-0" />
            {shownFriend}
          </button>
        )}
      </div>

      {/* 卡片轮播：每页固定 6 格（3 列 × 2 行），不足补占位以保持网格高度恒定 */}
      <div
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        role="region"
        aria-label={`${titleText}，可用左右方向键翻页`}
        tabIndex={0}
        className="select-none outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <div key={currentPage} className="animate-fade-in grid grid-cols-3 gap-5">
          {Array.from({ length: PAGE_SIZE }, (_, i) => {
            const link = pages[currentPage][i];
            if (!link) {
              return <div key={`site-link-ph-${i}`} className="h-[100px]" aria-hidden />;
            }
            const isImg = isImageIcon(link.icon);
            const IconComponent = isImg ? Globe : getIcon(link.icon);
            const useIconfont = !isImg && iconfontSymbols.includes(link.icon);
            return (
              <button
                key={link.id}
                onClick={() => handleClick(link)}
                className="card-btn flex h-[100px] w-full flex-row items-center justify-center gap-2"
                title={link.name}
              >
                {isImg ? (
                  <Image
                    src={link.icon}
                    alt={link.name}
                    width={26}
                    height={26}
                    className="h-[26px] w-[26px] shrink-0 rounded-full object-cover"
                    unoptimized
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : useIconfont ? (
                  <svg className="h-[26px] w-[26px] shrink-0 text-white/80" aria-hidden="true" focusable="false">
                    <use href={`#${link.icon}`} />
                  </svg>
                ) : (
                  <IconComponent className="h-[26px] w-[26px] shrink-0 text-white/80" />
                )}
                <span className="hidden max-w-[7.5rem] truncate text-base font-medium tracking-wide text-white/85 md:inline">
                  {link.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 翻页按钮：左右箭头 + 分页指示点（保留原网站链接交互） */}
      {pages.length > 1 && (
        <div className="mt-5 flex items-center justify-center gap-4 lg:mt-6">
          <button
            onClick={() => setPage((p) => Math.max(p - 1, 0))}
            disabled={currentPage === 0}
            aria-label="上一页"
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 ${
              currentPage === 0
                ? "cursor-not-allowed bg-white/5 text-white/25"
                : "bg-white/10 text-white/75 hover:bg-white/20 hover:text-white active:scale-95"
            }`}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            {pages.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`第 ${i + 1} 页`}
                className={`h-2.5 rounded-full transition-all duration-300 ease-out ${
                  i === currentPage ? "w-6 bg-white/90" : "w-2.5 bg-white/20 hover:bg-white/40"
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => setPage((p) => Math.min(p + 1, pages.length - 1))}
            disabled={currentPage === pages.length - 1}
            aria-label="下一页"
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 ${
              currentPage === pages.length - 1
                ? "cursor-not-allowed bg-white/5 text-white/25"
                : "bg-white/10 text-white/75 hover:bg-white/20 hover:text-white active:scale-95"
            }`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
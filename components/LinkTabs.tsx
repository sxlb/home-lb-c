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
    window.open(link.url, "_blank");
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

  // 组合标题：网站与友情的可配置标题合并为区域大标题（显眼），仅一类数据时只显示对应的标题
  const hasSite = siteLinks.length > 0;
  const hasFriend = friendLinks.length > 0;
  const shownSite = hasSite ? siteTitle : "";
  const shownFriend = hasFriend ? friendTitle : "";
  const titleText =
    shownSite && shownFriend
      ? `${shownSite} / ${shownFriend}`
      : shownSite || shownFriend || "网站链接";
  const TitleIcon = isSite ? getIcon(siteIcon) : Users;
  const useIconfontTitle = isSite && iconfontSymbols.includes(siteIcon);

  // 只展示有数据的 tab；只有一类数据时不显示切换按钮
  const tabs = [
    { key: "site", label: "网站", count: siteLinks.length },
    { key: "friend", label: "友情", count: friendLinks.length },
  ].filter((t) => t.count > 0);

  return (
    <div className="site-links-container">
      {/* 标题行 + tab 切换 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {useIconfontTitle ? (
            <svg className="h-5 w-5 shrink-0 text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]" aria-hidden="true" focusable="false">
              <use href={`#${siteIcon}`} />
            </svg>
          ) : (
            <TitleIcon className="h-5 w-5 shrink-0 text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]" />
          )}
          <span className="truncate text-lg font-bold tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
            {titleText}
          </span>
        </div>

        {tabs.length > 1 && (
          <div className="flex shrink-0 items-center gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as "site" | "friend")}
                aria-label={t.label}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 ${
                  tab === t.key
                    ? "bg-white/90 text-neutral-900"
                    : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 卡片轮播：每页固定 6 格（3 列 × 2 行），不足补占位以保持网格高度恒定 */}
      <div onWheel={handleWheel} className="select-none">
        <div key={currentPage} className="animate-fade-in grid grid-cols-3 gap-3.5">
          {Array.from({ length: PAGE_SIZE }, (_, i) => {
            const link = pages[currentPage][i];
            if (!link) {
              return <div key={`site-link-ph-${i}`} className="h-[72px]" aria-hidden />;
            }
            const isImg = isImageIcon(link.icon);
            const IconComponent = isImg ? Globe : getIcon(link.icon);
            const useIconfont = !isImg && iconfontSymbols.includes(link.icon);
            return (
              <button
                key={link.id}
                onClick={() => handleClick(link)}
                className="card-btn flex h-[72px] flex-col items-center justify-center gap-1.5"
                title={link.name}
              >
                {isImg ? (
                  <Image
                    src={link.icon}
                    alt={link.name}
                    width={20}
                    height={20}
                    className="h-5 w-5 shrink-0 rounded-full object-cover"
                    unoptimized
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : useIconfont ? (
                  <svg className="h-5 w-5 shrink-0 text-white/80" aria-hidden="true" focusable="false">
                    <use href={`#${link.icon}`} />
                  </svg>
                ) : (
                  <IconComponent className="h-5 w-5 shrink-0 text-white/80" />
                )}
                <span className="line-clamp-2 w-full break-words text-center text-xs font-medium leading-snug tracking-wide text-white/85">
                  {link.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 翻页按钮：左右箭头 + 分页指示点（保留原网站链接交互） */}
      {pages.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(p - 1, 0))}
            disabled={currentPage === 0}
            aria-label="上一页"
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200 ${
              currentPage === 0
                ? "cursor-not-allowed bg-white/5 text-white/25"
                : "bg-white/10 text-white/75 hover:bg-white/20 hover:text-white active:scale-95"
            }`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            {pages.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`第 ${i + 1} 页`}
                className={`h-2 rounded-full transition-all duration-300 ease-out ${
                  i === currentPage ? "w-6 bg-white/90" : "w-2 bg-white/20 hover:bg-white/40"
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => setPage((p) => Math.min(p + 1, pages.length - 1))}
            disabled={currentPage === pages.length - 1}
            aria-label="下一页"
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200 ${
              currentPage === pages.length - 1
                ? "cursor-not-allowed bg-white/5 text-white/25"
                : "bg-white/10 text-white/75 hover:bg-white/20 hover:text-white active:scale-95"
            }`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
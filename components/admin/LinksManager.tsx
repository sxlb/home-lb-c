"use client";

import { useState } from "react";
import { Link2, Share2, Globe, Users } from "lucide-react";
import LinksPanel from "@/components/admin/LinksPanel";
import FriendLinksPanel from "@/components/admin/FriendLinksPanel";

/**
 * 链接管理（三合一）：把 社交 / 网站 / 友情 三个独立面板收敛到单个导航入口，
 * 用内部 Tab 切换，避免导航项重复（P1 信息架构收敛）。
 * 三个面板各自持有独立的列表状态与批量保存，Tab 切换不互相污染。
 */

type LinkSubTab = "social" | "site" | "friend";

const SUB_TABS: { id: LinkSubTab; label: string; icon: typeof Share2 }[] = [
  { id: "social", label: "社交链接", icon: Share2 },
  { id: "site", label: "网站链接", icon: Globe },
  { id: "friend", label: "友情链接", icon: Users },
];

export default function LinksManager() {
  const [sub, setSub] = useState<LinkSubTab>("social");
  // 已访问过的子面板保持挂载（未激活的用 CSS 隐藏）：切子 Tab 不再销毁列表状态，
  // 否则刚编辑但未保存的链接会被直接丢弃，全局保存也拿不到它们
  const [mountedSubs, setMountedSubs] = useState<Set<LinkSubTab>>(
    () => new Set<LinkSubTab>(["social"])
  );

  const selectSub = (next: LinkSubTab) => {
    setSub(next);
    setMountedSubs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };

  return (
    <div className="space-y-4">
      {/* 内部 Tab 切换（分段控件）：移动端加大点击高度、收窄内边距，避免三项挤在一起 */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectSub(t.id)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-2.5 text-xs transition-all duration-150 ease-out sm:gap-1.5 sm:px-3 sm:py-2 sm:text-sm ${
                active
                  ? "bg-primary text-primary-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 当前子 Tab 对应的独立面板 */}
      <div className="flex items-start gap-2 px-1 text-xs text-muted-foreground sm:justify-center sm:text-sm">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {sub === "social" && "管理主页显示的社交入口（GitHub、邮箱等）。"}
          {sub === "site" && "管理主页网站列表（博客、网盘、图床等）。"}
          {sub === "friend" && "管理首页友情链接与合作伙伴。"}
        </span>
      </div>

      {mountedSubs.has("social") && (
        <div className={sub === "social" ? "" : "hidden"}>
          <LinksPanel
            apiPath="/api/social-links"
            emptyText="暂无社交链接，点击右上角「添加链接」创建"
            successMessage="社交链接保存成功"
            tabLabel="社交链接"
            showTip
            namePlaceholder="如 GitHub"
            iconPlaceholder="图标名 / 图片URL / random:关键词"
            urlPlaceholder="https://github.com/yourname 或 mailto:xxx"
          />
        </div>
      )}
      {mountedSubs.has("site") && (
        <div className={sub === "site" ? "" : "hidden"}>
          <LinksPanel
            apiPath="/api/site-links"
            emptyText="暂无网站链接，点击右上角「添加链接」创建"
            successMessage="网站链接保存成功"
            tabLabel="网站链接"
            namePlaceholder="如 博客"
            iconPlaceholder="图标名 / 图片URL / random:关键词"
            urlPlaceholder="https://blog.example.com"
          />
        </div>
      )}
      {mountedSubs.has("friend") && (
        <div className={sub === "friend" ? "" : "hidden"}>
          <FriendLinksPanel />
        </div>
      )}
    </div>
  );
}
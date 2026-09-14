"use client";

import { useState, useCallback, useRef } from "react";
import { Share2, Globe, Users, Link2 } from "lucide-react";
import LinksPanel from "@/components/admin/LinksPanel";
import FriendLinksPanel from "@/components/admin/FriendLinksPanel";
import { useRegisterSave } from "./GlobalSave";

/** 子 tab 标识 */
type LinkSubTab = "social" | "site" | "friend";

const SUB_TABS: { id: LinkSubTab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "social", label: "社交链接", Icon: Share2 },
  { id: "site", label: "网站链接", Icon: Globe },
  { id: "friend", label: "友情链接", Icon: Users },
];

/** 子面板暴露的 save 方法引用 */
type SaveFn = (() => Promise<boolean>) | undefined;

export default function LinksManagerWithGlobalSave() {
  const [sub, setSub] = useState<LinkSubTab>("social");
  const [mountedSubs, setMountedSubs] = useState<Set<LinkSubTab>>(() => new Set(["social"]));
  // 每个子面板的 dirty 状态 + save 方法集合
  const [dirtyMap, setDirtyMap] = useState<Record<LinkSubTab, boolean>>({
    social: false,
    site: false,
    friend: false,
  });
  // 各子面板的 save 方法（用于全局保存时遍历调用）
  const savesRef = useRef<Record<LinkSubTab, SaveFn>>({
    social: undefined,
    site: undefined,
    friend: undefined,
  });

  const selectSub = (next: LinkSubTab) => {
    setSub(next);
    setMountedSubs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };

  // 标记各子面板的 dirty
  const markDirty = useCallback((tab: LinkSubTab, val: boolean) => {
    setDirtyMap((prev) => ({ ...prev, [tab]: val }));
  }, []);

  /** 设置某个子面板的 save 方法 */
  const registerSaveFn = useCallback((tab: LinkSubTab, saveFn: SaveFn) => {
    savesRef.current[tab] = saveFn;
  }, []);

  // 全局保存时的汇总 save callback
  const handleGlobalSave = useCallback(async () => {
    const saves = Object.values(savesRef.current).filter(
      (fn): fn is () => Promise<boolean> => typeof fn === "function"
    );
    if (saves.length === 0) return true;
    const results = await Promise.all(
      saves.map(async (fn) => {
        try {
          return await fn();
        } catch {
          return false;
        }
      })
    );
    return results.every((r) => r);
  }, []);

  // 计算总 dirty
  const isDirty = dirtyMap.social || dirtyMap.site || dirtyMap.friend;

  // 注册到 GlobalSave
  useRegisterSave({
    id: "links-manager",
    label: "链接管理",
    dirty: isDirty,
    save: handleGlobalSave,
    markClean: () => {
      setDirtyMap({ social: false, site: false, friend: false });
    },
  });

  return (
    <div className="space-y-4">
      {/* 内部 Tab 切换 */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
        {SUB_TABS.map((t) => {
          const Icon = t.Icon;
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
            iconPlaceholder="图标名 / Iconify(fa:github) / 图片URL或路径 / SVG代码 / random:关键词"
            urlPlaceholder="https://github.com/yourname 或 mailto:xxx"
            dirtyChange={(val) => markDirty("social", val)}
            registerSaveRef={(fn) => registerSaveFn("social", fn)}
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
            iconPlaceholder="图标名 / Iconify(fa:github) / 图片URL或路径 / SVG代码 / random:关键词"
            urlPlaceholder="https://blog.example.com"
            dirtyChange={(val) => markDirty("site", val)}
            registerSaveRef={(fn) => registerSaveFn("site", fn)}
          />
        </div>
      )}
      {mountedSubs.has("friend") && (
        <div className={sub === "friend" ? "" : "hidden"}>
          <FriendLinksPanel
            dirtyChange={(val) => markDirty("friend", val)}
            registerSaveRef={(fn) => registerSaveFn("friend", fn)}
          />
        </div>
      )}
    </div>
  );
}

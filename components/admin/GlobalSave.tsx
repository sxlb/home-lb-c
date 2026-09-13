"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { loadProfile, setCachedProfile, type ProfileShape } from "./profileShared";

/**
 * 后台「全局保存」注册中心。
 *
 * 背景：各面板原本各自保存，切到别的 tab 后未保存的改动就丢了；且站点信息 / 主题 / 音乐
 * 三个面板都是「PUT 完整 profile」，逐个保存会互相覆盖。
 *
 * 因此这里统一注册各面板的保存能力：
 * - profile 类面板（站点信息/主题/音乐）提供 profilePatch()，全局保存时**合并成一次 PUT**，
 *   彻底避免互相覆盖；patch 只包含该面板真正改动过的字段。
 * - 自带 API 的面板（链接/技能/作品/随笔/公告）提供 save()，全局保存时串行执行。
 */
export interface SaveEntry {
  /** 面板唯一标识 */
  id: string;
  /** 面板名称（用于提示） */
  label: string;
  /** 是否有未保存改动 */
  dirty: boolean;
  /** 本面板改动过的 profile 字段（仅含改过的键） */
  profilePatch?: () => Record<string, unknown> | null;
  /** 自带 API 的保存逻辑，返回是否成功 */
  save?: () => Promise<boolean>;
  /** 保存成功后清除脏标记 */
  markClean?: () => void;
  /** 保存前本地校验；返回文案表示阻止保存 */
  validate?: () => string | null;
}

interface GlobalSaveContextValue {
  register: (entry: SaveEntry) => void;
  unregister: (id: string) => void;
  saveAll: () => Promise<void>;
  saving: boolean;
  dirtyCount: number;
  dirtyLabels: string[];
}

const GlobalSaveContext = createContext<GlobalSaveContextValue | null>(null);

export function GlobalSaveProvider({ children }: { children: ReactNode }) {
  const entriesRef = useRef(new Map<string, SaveEntry>());
  const [, forceRender] = useState(0);
  const [saving, setSaving] = useState(false);

  const register = useCallback((entry: SaveEntry) => {
    const prev = entriesRef.current.get(entry.id);
    entriesRef.current.set(entry.id, entry);
    // 只在「脏状态 / 名称」变化时刷新，避免任意字段输入都触发全局重渲染
    if (!prev || prev.dirty !== entry.dirty || prev.label !== entry.label) {
      forceRender((v) => v + 1);
    }
  }, []);

  const unregister = useCallback((id: string) => {
    if (entriesRef.current.delete(id)) forceRender((v) => v + 1);
  }, []);

  const saveAll = useCallback(async () => {
    const entries = Array.from(entriesRef.current.values()).filter((e) => e.dirty);
    if (entries.length === 0) {
      toast.info("没有需要保存的修改");
      return;
    }

    // 1) 先做本地校验，任一不通过就整体中止，避免出现「保存了一半」
    for (const entry of entries) {
      const message = entry.validate?.();
      if (message) {
        toast.error(`${entry.label}：${message}`);
        return;
      }
    }

    setSaving(true);
    try {
      // 2) profile 类面板：合并补丁后一次性提交
      const profileEntries = entries.filter((e) => e.profilePatch);
      const merged: Record<string, unknown> = {};
      for (const entry of profileEntries) {
        const patch = entry.profilePatch?.();
        if (patch) Object.assign(merged, patch);
      }
      if (profileEntries.length > 0) {
        const base = await loadProfile(true);
        if (!base) {
          toast.error("读取站点配置失败，请刷新后重试");
          return;
        }
        const payload = { ...base, ...merged } as ProfileShape;
        const res = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          toast.error(data?.error || "站点配置保存失败");
          return;
        }
        setCachedProfile(payload);
        profileEntries.forEach((entry) => entry.markClean?.());
      }

      // 3) 自带 API 的面板：串行保存（SQLite 单写，顺序执行更稳）
      const failed: string[] = [];
      for (const entry of entries) {
        if (!entry.save) continue;
        try {
          const ok = await entry.save();
          if (ok) entry.markClean?.();
          else failed.push(entry.label);
        } catch {
          failed.push(entry.label);
        }
      }

      if (failed.length > 0) {
        toast.error(`以下面板保存失败：${failed.join("、")}`);
      } else {
        toast.success("全部修改已保存");
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const entries = Array.from(entriesRef.current.values());
  const dirtyEntries = entries.filter((e) => e.dirty);

  return (
    <GlobalSaveContext.Provider
      value={{
        register,
        unregister,
        saveAll,
        saving,
        dirtyCount: dirtyEntries.length,
        dirtyLabels: dirtyEntries.map((e) => e.label),
      }}
    >
      {children}
    </GlobalSaveContext.Provider>
  );
}

/** 面板注册自身保存能力的 Hook（同一 id 重复注册会覆盖） */
export function useRegisterSave(entry: SaveEntry) {
  const ctx = useContext(GlobalSaveContext);
  const latest = useRef(entry);
  latest.current = entry;

  const { id, label, dirty } = entry;
  const register = ctx?.register;
  const unregister = ctx?.unregister;

  useEffect(() => {
    if (!register || !unregister) return;
    register({
      id,
      label,
      dirty,
      profilePatch: () => latest.current.profilePatch?.() ?? null,
      save: () => latest.current.save?.() ?? Promise.resolve(true),
      markClean: () => latest.current.markClean?.(),
      validate: () => latest.current.validate?.() ?? null,
    });
    return () => unregister(id);
  }, [id, label, dirty, register, unregister]);
}

/** 全局保存状态（供面板按钮禁用等场景读取） */
export function useGlobalSaveState() {
  const ctx = useContext(GlobalSaveContext);
  return {
    saving: ctx?.saving ?? false,
    dirtyCount: ctx?.dirtyCount ?? 0,
    dirtyLabels: ctx?.dirtyLabels ?? [],
    saveAll: ctx?.saveAll ?? (async () => {}),
  };
}

/**
 * 全局保存悬浮按钮：任一页面有未保存改动时出现，一键保存全部面板改动。
 * 挂在后台外壳上，因此切换 tab 也不会丢失入口。
 */
export function GlobalSaveFab() {
  const { saving, dirtyCount, dirtyLabels, saveAll } = useGlobalSaveState();

  if (dirtyCount === 0 && !saving) return null;

  return (
    <button
      type="button"
      onClick={() => void saveAll()}
      disabled={saving}
      title={`待保存：${dirtyLabels.join("、") || "无"}`}
      aria-label={`保存全部修改（${dirtyCount} 个面板）`}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {saving ? "保存中…" : "保存全部修改"}
      {dirtyCount > 0 && (
        <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground/20 px-1.5 text-xs tabular-nums">
          {dirtyCount}
        </span>
      )}
    </button>
  );
}

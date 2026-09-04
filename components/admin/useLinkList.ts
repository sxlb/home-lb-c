"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/** 后台链接项公共结构（社交链接 / 网站链接 / 友情链接） */
interface LinkItem {
  id?: number;
  /** 前端本地唯一标识：新增行在保存前使用（后端 zod 会 strip 未知字段，不会持久化） */
  clientId?: number;
  name: string;
  icon: string;
  url: string;
  sort: number;
  tip?: string;
  description?: string;
}

/** 新增行本地唯一 id 计数器（模块级，页面内单调递增） */
let clientIdCounter = 0;
function nextClientId(): number {
  return ++clientIdCounter;
}

/** 链接列表 URL 协议白名单（社交/网站链接：http(s)/mailto/tel/music） */
const DEFAULT_URL_PATTERN = /^(https?:\/\/|mailto:|tel:|music:)/;

interface UseLinkListOptions {
  /** URL 协议白名单（客户端预校验，与后端 zod 对齐） */
  urlPattern?: RegExp;
  /** 图标是否必填（社交/网站链接必填，友情链接可空） */
  requireIcon?: boolean;
}

/**
 * 后台链接列表面板公共逻辑（社交链接 / 网站链接 / 友情链接共用）：
 * - 加载列表（GET）
 * - 增 / 删 / 改单行（新增行分配 clientId，保证列表 key 稳定）
 * - 批量保存（PUT，过滤空名称行）
 * - 保存前本地逐行校验（url 协议 / 图标必填），定位到具体行报错
 * - 保存成功后重新拉取服务端数据作为最终真相，避免旧快照覆盖保存期间的编辑（竞态）
 * - 统一 loading / saving 状态与 toast 提示
 */
export function useLinkList<T extends LinkItem>(
  apiPath: string,
  emptyItem: T,
  successMessage: string,
  { urlPattern = DEFAULT_URL_PATTERN, requireIcon = false }: UseLinkListOptions = {}
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 是否存在未保存的修改：驱动「● 有未保存的更改」提示（统一三个链接面板）
  const [dirty, setDirty] = useState(false);

  /** 拉取服务端列表；失败返回 null（内部已 toast） */
  const fetchList = useCallback(async (): Promise<T[] | null> => {
    try {
      const res = await fetch(apiPath);
      if (res.ok) {
        return (await res.json()) as T[];
      }
      toast.error("加载失败");
    } catch {
      toast.error("网络错误");
    }
    return null;
  }, [apiPath]);

  // 初始加载（卸载后不再 setState）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchList();
      if (cancelled) return;
      if (data) setItems(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchList]);

  const addItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      { ...emptyItem, sort: prev.length, clientId: nextClientId() } as T,
    ]);
    setDirty(true);
  }, [emptyItem]);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }, []);

  const updateItem = useCallback(<K extends keyof T>(index: number, field: K, value: T[K]) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setDirty(true);
  }, []);

  // 批量保存：过滤名称为空的行 + 本地逐行预校验 + 保存后以服务端数据为准重新拉取
  const save = useCallback(async () => {
    // 本地预校验：定位到具体行，避免整单 400 后无从排查
    const errors: string[] = [];
    items.forEach((l, i) => {
      if (l.name.trim() === "") return; // 空名称行保存时被过滤，跳过校验
      const row = i + 1;
      if (requireIcon && !l.icon.trim()) errors.push(`第 ${row} 行：图标不能为空`);
      if (l.url.trim() && !urlPattern.test(l.url.trim())) {
        errors.push(`第 ${row} 行：链接格式不合法（请检查协议头）`);
      }
    });
    if (errors.length > 0) {
      toast.error(errors.join("；"));
      return;
    }

    setSaving(true);
    try {
      const valid = items.filter((l) => l.name.trim() !== "");
      const res = await fetch(apiPath, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });
      if (res.ok) {
        toast.success(successMessage);
        // 以服务端为最终真相重新拉取：既同步 id/sort，又避免旧快照
        // 覆盖用户在保存期间的新输入（响应返回时 items 已变化）
        const fresh = await fetchList();
        if (fresh) setItems(fresh);
        setDirty(false);
      } else {
        const data = await res.json();
        toast.error(data.error || "保存失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }, [items, apiPath, successMessage, urlPattern, requireIcon, fetchList]);

  return { items, loading, saving, dirty, addItem, removeItem, updateItem, save };
}

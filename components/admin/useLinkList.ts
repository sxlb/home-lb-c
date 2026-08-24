"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/** 后台链接项公共结构（社交链接 / 网站链接 / 友情链接） */
interface LinkItem {
  id?: number;
  name: string;
  icon: string;
  url: string;
  sort: number;
  tip?: string;
  description?: string;
}

/**
 * 后台链接列表面板公共逻辑（社交链接 / 网站链接共用）：
 * - 加载列表（GET）
 * - 增 / 删 / 改单行
 * - 批量保存（PUT，过滤空名称行）
 * - 统一 loading / saving 状态与 toast 提示
 */
export function useLinkList<T extends LinkItem>(
  apiPath: string,
  emptyItem: T,
  successMessage: string
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 加载列表
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(apiPath);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setItems(data as T[]);
        } else {
          toast.error("加载失败");
        }
      } catch {
        toast.error("网络错误");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [apiPath]);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, { ...emptyItem, sort: prev.length } as T]);
  }, [emptyItem]);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateItem = useCallback(<K extends keyof T>(index: number, field: K, value: T[K]) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  // 批量保存：过滤名称为空的行
  const save = useCallback(async () => {
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
        setItems(valid);
      } else {
        const data = await res.json();
        toast.error(data.error || "保存失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }, [items, apiPath, successMessage]);

  return { items, loading, saving, addItem, removeItem, updateItem, save };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { INITIAL_PROFILE, hasCachedProfile, loadProfile, setCachedProfile, type ProfileShape } from "./profileShared";

/**
 * 站点配置面板通用表单 Hook：
 * 加载 /api/profile（共享缓存）→ 合并默认值 → 修改标记 dirty → PUT 完整配置保存。
 * 站点信息、主题与壁纸、音乐设置三个面板共用，保证各面板保存时不会丢失其它面板负责的字段。
 */
export function useProfileForm() {
  const [profile, setProfile] = useState<ProfileShape>(INITIAL_PROFILE);
  const [loading, setLoading] = useState(!hasCachedProfile());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadProfile()
      .then((data) => {
        if (cancelled) return;
        if (data) setProfile(data);
        else toast.error("加载数据失败");
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const set = useCallback(<K extends keyof ProfileShape,>(key: K, value: ProfileShape[K]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setCachedProfile(profile);
        toast.success("保存成功");
        setDirty(false);
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "保存失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }

  return { profile, loading, saving, dirty, set, save, formRef };
}
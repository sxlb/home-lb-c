"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { INITIAL_PROFILE, hasCachedProfile, loadProfile, setCachedProfile, type ProfileShape } from "./profileShared";
import { useRegisterSave } from "./GlobalSave";

/**
 * 站点配置面板通用表单 Hook：
 * 加载 /api/profile（共享缓存）→ 合并默认值 → 修改标记 dirty → PUT 完整配置保存。
 * 站点信息、主题与壁纸、音乐设置三个面板共用，保证各面板保存时不会丢失其它面板负责的字段。
 *
 * 同时向「全局保存」注册本面板改动过的字段补丁：多个 profile 面板都 PUT 完整对象，
 * 逐个保存会互相覆盖，合并成一次提交才不会丢改动。
 */
export function useProfileForm(options: { id?: string; label?: string } = {}) {
  const { id = "profile", label = "站点配置" } = options;
  const [profile, setProfile] = useState<ProfileShape>(INITIAL_PROFILE);
  const [loading, setLoading] = useState(!hasCachedProfile());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  /** 载入时的基线快照：用于计算「本面板改动了哪些字段」 */
  const baselineRef = useRef<ProfileShape | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadProfile()
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setProfile(data);
          baselineRef.current = data;
        } else toast.error("加载数据失败");
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
        baselineRef.current = profile;
        toast.success("保存成功");
        setDirty(false);
        return true;
      }
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "保存失败");
      return false;
    } catch {
      toast.error("网络错误");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // 向全局保存注册：仅上报本面板改动过的字段
  useRegisterSave({
    id,
    label,
    dirty,
    profilePatch: () => {
      const baseline = baselineRef.current;
      if (!baseline) return null;
      const patch: Record<string, unknown> = {};
      for (const key of Object.keys(profile) as (keyof ProfileShape)[]) {
        if (profile[key] !== baseline[key]) patch[key] = profile[key];
      }
      return patch;
    },
    markClean: () => {
      baselineRef.current = profile;
      setDirty(false);
    },
  });

  return { profile, loading, saving, dirty, set, save, formRef };
}

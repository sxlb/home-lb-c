"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  INITIAL_PROFILE,
  hasCachedProfile,
  loadProfile,
  profileFieldPatch,
  setCachedProfile,
  type ProfileShape,
} from "./profileShared";
import { useRegisterSave } from "./GlobalSave";

/**
 * 站点配置面板通用表单 Hook：
 * 加载 /api/profile（共享缓存）→ 合并默认值 → 修改标记 dirty → 只提交本面板改动过的字段。
 * 站点信息、主题与壁纸、音乐设置三个面板共用，保证各面板保存时不会丢失其它面板负责的字段。
 *
 * 同时向「全局保存」注册本面板改动过的字段补丁：多个 profile 面板都读写同一份配置，
 * 逐个整份提交会互相覆盖，合并成一次提交才不会丢改动。
 *
 * @param options.id 面板唯一标识（全局保存用）
 * @param options.label 面板名称（全局保存提示用）
 * @param options.validate 保存前本地校验，返回文案表示阻止保存
 */
export function useProfileForm(
  options: { id?: string; label?: string; validate?: () => string | null } = {}
) {
  const { id = "profile", label = "站点配置", validate } = options;
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

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      // 以服务端最新配置为基线，只提交本面板改动过的字段：
      // 若直接 PUT 本地整份快照（面板挂载时的旧数据），会把其它面板已经保存的改动覆盖回去
      const base = await loadProfile(true);
      if (!base) {
        toast.error("读取站点配置失败，请刷新后重试");
        return false;
      }
      const payload = { ...base, ...profileFieldPatch(profile, baselineRef.current) } as ProfileShape;
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setCachedProfile(payload);
        // 本地状态同步为服务端最终值：既包含本面板改动，也吸收其它面板已保存的字段
        setProfile(payload);
        baselineRef.current = payload;
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
    profilePatch: () => profileFieldPatch(profile, baselineRef.current),
    markClean: () => {
      baselineRef.current = profile;
      setDirty(false);
    },
    validate: () => validate?.() ?? null,
  });

  return { profile, loading, saving, dirty, set, save, formRef };
}

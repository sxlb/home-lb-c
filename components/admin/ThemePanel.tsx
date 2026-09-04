"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { LoadingPlaceholder } from "./LinksPanel";
import { useProfileForm } from "./useProfileForm";
import UploadButton from "./UploadButton";
import ThemePreview from "./ThemePreview";
import { SectionBlock, SubTitle } from "./panel";
import {
  COVER_TYPES,
  SWITCH_INTERVALS,
  WALLPAPER_REFRESH,
  THEMES,
  AVATAR_SHAPES,
  selectClass,
  rangeClass,
} from "./profileShared";

/** 滑块组（含左侧标签 / 右侧当前值） */
function RangeField({
  id,
  label,
  hint,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-sm font-normal">{label}</Label>
        <span className="rounded-md bg-background px-2 py-0.5 text-xs font-medium tabular-nums text-foreground shadow-sm">
          {value}{suffix}
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className={rangeClass} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function ThemePanel() {
  const { profile, loading, saving, dirty, set, save, formRef } = useProfileForm();

  if (loading) {
    return <LoadingPlaceholder />;
  }

  return (
    <Card>
      {/* 页面级标题头由 admin/page.tsx 提供，卡内不再重复标题 */}
      <CardContent>
        {/* 主题实时预览：CSS 变量随表单实时值变化，保存后前台同源生效 */}
        <div className="mb-5">
          <ThemePreview
            accentColor={profile.accentColor}
            glassOpacity={profile.glassOpacity}
            glassBlur={profile.glassBlur}
          />
        </div>
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            // 颜色字段格式校验：非空须为合法 hex（与后端 zod 一致），避免保存非法值
            const badColor = [profile.accentColor, profile.avatarBorderColor].find(
              (c) => c.trim() !== "" && !/^#[0-9a-fA-F]{3,8}$/.test(c.trim())
            );
            if (badColor !== undefined) {
              toast.error(`颜色值不合法：${badColor}（应为 #RRGGBB 格式）`);
              return;
            }
            save();
          }}
          className="space-y-3 pb-16"
        >
          {/* ========== 壁纸与主题 ========== */}
          <SectionBlock
            open
            title="壁纸与主题"
            subtitle="背景来源 · 自动切换 · 主题模式"
            dotClass="bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
          >
            <div className="space-y-3.5">
              <SubTitle>壁纸与主题</SubTitle>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="coverType">壁纸种类</Label>
                  <select
                    id="coverType"
                    className={selectClass}
                    value={profile.coverType}
                    onChange={(e) => set("coverType", e.target.value)}
                  >
                    {COVER_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="autoBGSwitchInterval">壁纸自动切换</Label>
                  <select
                    id="autoBGSwitchInterval"
                    className={selectClass}
                    value={String(profile.autoBGSwitchInterval)}
                    onChange={(e) => set("autoBGSwitchInterval", Number(e.target.value))}
                  >
                    {SWITCH_INTERVALS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wallpaperRefresh">壁纸缓存刷新</Label>
                  <select
                    id="wallpaperRefresh"
                    className={selectClass}
                    value={String(profile.wallpaperRefresh)}
                    onChange={(e) => set("wallpaperRefresh", Number(e.target.value))}
                  >
                    {WALLPAPER_REFRESH.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">缓存到服务器（最多 100 张），到期自动换入新壁纸</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bgApi">自定义壁纸地址</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="bgApi"
                      value={profile.bgApi}
                      onChange={(e) => set("bgApi", e.target.value)}
                      placeholder="https://example.com/wallpaper.jpg"
                    />
                    <UploadButton onUploaded={(url) => set("bgApi", url)} label="上传" />
                  </div>
                  <p className="text-xs text-muted-foreground">填写后优先于壁纸种类使用（图片直链）</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="theme">主题模式</Label>
                <select
                  id="theme"
                  className={selectClass}
                  value={profile.theme}
                  onChange={(e) => set("theme", e.target.value)}
                >
                  {THEMES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">「跟随壁纸」模式会根据壁纸明暗自动切换深浅色</p>
              </div>
            </div>
          </SectionBlock>

          {/* ========== 视觉氛围 ========== */}
          <SectionBlock
            title="视觉氛围"
            subtitle="强调色 · 玻璃效果 · 头像样式"
            dotClass="bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]"
          >
            <div className="space-y-3.5">
              <SubTitle>视觉与氛围</SubTitle>

              <div className="space-y-2">
                <Label htmlFor="accentColor">主题强调色</Label>
                <div className="flex items-center gap-2 rounded-lg border border-input bg-background p-1.5 pr-3">
                  <input
                    id="accentColor"
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(profile.accentColor) ? profile.accentColor : "#7dd3fc"}
                    onChange={(e) => set("accentColor", e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded-md border-0 bg-transparent [color-scheme:light]"
                  />
                  <div className="h-6 w-px bg-border" />
                  <Input
                    value={profile.accentColor}
                    onChange={(e) => set("accentColor", e.target.value)}
                    placeholder="#7dd3fc"
                    className="border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
                <p className="text-xs text-muted-foreground">时钟 / 站名发光色，留空使用默认天蓝色</p>
              </div>

              {/* 滑块组：玻璃效果 */}
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <h5 className="text-xs font-medium text-muted-foreground">玻璃效果参数</h5>
                <RangeField
                  id="glassOpacity"
                  label="玻璃卡片不透明度"
                  hint="值越大卡片越深、壁纸越透不出来"
                  value={profile.glassOpacity}
                  min={0}
                  max={80}
                  suffix="%"
                  onChange={(v) => set("glassOpacity", v)}
                />
                <RangeField
                  id="glassBlur"
                  label="玻璃模糊强度"
                  value={profile.glassBlur}
                  min={0}
                  max={40}
                  suffix="px"
                  onChange={(v) => set("glassBlur", v)}
                />
              </div>

              {/* 滑块：背景遮罩 */}
              <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-4">
                <RangeField
                  id="bgOverlay"
                  label="背景遮罩暗化"
                  hint="壁纸过亮导致文字看不清时调高"
                  value={profile.bgOverlay}
                  min={0}
                  max={80}
                  suffix="%"
                  onChange={(v) => set("bgOverlay", v)}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="avatarShape">头像形状</Label>
                  <select
                    id="avatarShape"
                    className={selectClass}
                    value={profile.avatarShape}
                    onChange={(e) => set("avatarShape", e.target.value)}
                  >
                    {AVATAR_SHAPES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="avatarBorderColor">头像边框颜色</Label>
                  <div className="flex items-center gap-2 rounded-lg border border-input bg-background p-1.5 pr-3">
                    <input
                      id="avatarBorderColor"
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(profile.avatarBorderColor) ? profile.avatarBorderColor : "#ffffff"}
                      onChange={(e) => set("avatarBorderColor", e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded-md border-0 bg-transparent [color-scheme:light]"
                    />
                    <div className="h-6 w-px bg-border" />
                    <Input
                      value={profile.avatarBorderColor}
                      onChange={(e) => set("avatarBorderColor", e.target.value)}
                      placeholder="#ffffff"
                      className="border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>
              </div>
            </div>
          </SectionBlock>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "保存中..." : "保存主题设置"}
          </Button>
        </form>

        {/* 右下角悬浮保存 */}
        {dirty && (
          <button
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            disabled={saving}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-black/40 transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
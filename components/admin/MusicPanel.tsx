"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingPlaceholder } from "./LinksPanel";
import { useProfileForm } from "./useProfileForm";
import { SONG_SERVERS, SONG_API_PRESETS, selectClass } from "./profileShared";

export default function MusicPanel() {
  const { profile, loading, saving, dirty, set, save, formRef } = useProfileForm();

  if (loading) {
    return <LoadingPlaceholder />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>音乐设置</CardTitle>
        <CardDescription>配置音乐播放器的歌单来源与播放平台</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-3 pb-16">
          <div className="space-y-5 rounded-lg border border-border bg-card px-5 py-5 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="songApiPreset">选择 API 源</Label>
              <select
                id="songApiPreset"
                className={selectClass}
                value={
                  SONG_API_PRESETS.find((p) => p.value === profile.songApi)?.value ?? "__custom__"
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__custom__") return;
                  set("songApi", val);
                }}
              >
                {SONG_API_PRESETS.map((o) => (
                  <option key={o.value || "custom"} value={o.value}>
                    {o.label}
                  </option>
                ))}
                {!SONG_API_PRESETS.some((p) => p.value === profile.songApi) && profile.songApi && (
                  <option value="__custom__" disabled>
                    — 自定义地址 —
                  </option>
                )}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="songApi">歌单 API 地址</Label>
              <Input
                id="songApi"
                value={profile.songApi}
                onChange={(e) => set("songApi", e.target.value)}
                placeholder="https://music.example.com"
              />
              <p className="text-xs text-muted-foreground">
                支持三种数据源：① NeteaseCloudMusicApi 基地址（推荐自建，支持本机/内网）；
                ② meting 类歌单接口；③ home 项目同格式 API。留空则播放器无歌单。
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="songServer">主源平台</Label>
                <select
                  id="songServer"
                  className={selectClass}
                  value={profile.songServer}
                  onChange={(e) => set("songServer", e.target.value)}
                >
                  {SONG_SERVERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="songId">歌单 ID</Label>
                <Input
                  id="songId"
                  value={profile.songId}
                  onChange={(e) => set("songId", e.target.value)}
                  placeholder="网易云歌单 ID"
                />
              </div>
            </div>

            {/* 快速配置：预设歌单 */}
            <div className="space-y-2">
              <Label>快捷歌单</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "3778678", name: "热歌榜" },
                  { id: "2884035", name: "网易原创榜" },
                  { id: "3779629", name: "新歌榜" },
                  { id: "991319590", name: "华语金曲榜" },
                ].map((pl) => (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => set("songId", pl.id)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      profile.songId === pl.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    }`}
                  >
                    {pl.name}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">点击快速填入常用网易云歌单 ID</p>
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "保存中..." : "保存音乐设置"}
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
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { DEFAULT_WELCOME_MESSAGES } from "@/lib/validation";
import { LoadingPlaceholder } from "./LinksPanel";
import { loadProfile, setCachedProfile, hasCachedProfile } from "./profileShared";

interface Profile {
  avatar: string;
  siteIcon: string;
  nickname: string;
  bio: string;
  github: string;
  email: string;
  bgApi: string;
  coverType: string;
  autoBGSwitchInterval: number;
  wallpaperRefresh: number;
  theme: string;
  songApi: string;
  songServer: string;
  songId: string;
  siteUrl: string;
  siteIcp: string;
  siteMps: string;
  siteStart: string;
  siteLinksTitle: string;
  siteLinksIcon: string;
  friendLinksTitle: string;
  iconfontUrl: string;
  logoArtFont: boolean;
  logoFont: string;
  loadingScreen: boolean;
  clickEffect: boolean;
  consoleEgg: boolean;
  showStats: boolean;
  dynamicTitle: boolean;
  topProgressBar: boolean;
  useRandomAvatar: boolean;
  welcomeEnabled: boolean;
  welcomeIndex: number;
  welcomeMessages: string;
  // 高级配置
  siteTitle: string;
  siteDescription: string;
  siteKeywords: string;
  accentColor: string;
  glassOpacity: number;
  glassBlur: number;
  analyticsScript: string;
  headScript: string;
  timeFormat: string;
  showSeconds: boolean;
  dateFormat: string;
  hitokotoType: string;
  bgOverlay: number;
  avatarShape: string;
  avatarBorderColor: string;
  // 天气配置（与 /api/weather-setting 共用同一份 Profile 记录，保存时原样回传）
  weatherProvider: string;
  amapKey: string;
  amapSecretKey: string;
  txWeatherKey: string;
  txWeatherSk: string;
  weatherCity: string;
}

const INITIAL: Profile = {
  avatar: "",
  siteIcon: "",
  nickname: "",
  bio: "",
  github: "",
  email: "",
  bgApi: "",
  coverType: "bing",
  autoBGSwitchInterval: 0,
  wallpaperRefresh: 0,
  theme: "system",
  songApi: "https://api.injahow.cn/meting",
  songServer: "netease",
  songId: "3778678",
  siteUrl: "",
  siteIcp: "",
  siteMps: "",
  siteStart: "",
  siteLinksTitle: "我的网站",
  siteLinksIcon: "link",
  friendLinksTitle: "友情链接",
  iconfontUrl: "",
  logoArtFont: true,
  logoFont: "zcool-kuail",
  loadingScreen: true,
  clickEffect: true,
  consoleEgg: true,
  showStats: true,
  dynamicTitle: true,
  topProgressBar: true,
  useRandomAvatar: false,
  welcomeEnabled: true,
  welcomeIndex: 0,
  welcomeMessages: JSON.stringify(DEFAULT_WELCOME_MESSAGES),
  // 高级配置
  siteTitle: "",
  siteDescription: "",
  siteKeywords: "",
  accentColor: "",
  glassOpacity: 28,
  glassBlur: 16,
  analyticsScript: "",
  headScript: "",
  timeFormat: "24",
  showSeconds: true,
  dateFormat: "YYYY年M月D日 dddd",
  hitokotoType: "",
  bgOverlay: 0,
  avatarShape: "circle",
  avatarBorderColor: "",
  // 天气配置（与 profileShared INITIAL_PROFILE 保持一致）
  weatherProvider: "tencent",
  amapKey: "",
  amapSecretKey: "",
  txWeatherKey: "",
  txWeatherSk: "",
  weatherCity: "",
};

const TIME_FORMATS = [
  { value: "24", label: "24 小时制" },
  { value: "12", label: "12 小时制" },
];

// 一言类型（与 v1.hitokoto.cn 的 c 参数对应）
const HITOKOTO_TYPES = [
  { value: "", label: "随机（不限制类型）" },
  { value: "a", label: "动画" },
  { value: "b", label: "漫画" },
  { value: "c", label: "游戏" },
  { value: "d", label: "文学" },
  { value: "e", label: "原创" },
  { value: "f", label: "来自网络" },
  { value: "g", label: "其他" },
  { value: "h", label: "影视" },
  { value: "i", label: "诗词" },
  { value: "j", label: "网易云音乐" },
  { value: "k", label: "哲学" },
  { value: "l", label: "抖机灵" },
];

const DATE_FORMAT_PRESETS = [
  { value: "YYYY年M月D日 dddd", label: "2026年8月22日 周六" },
  { value: "YYYY年MM月DD日 dddd", label: "2026年08月22日 周六" },
  { value: "YYYY-MM-DD dddd", label: "2026-08-22 周六" },
  { value: "MM月DD日 dddd", label: "08月22日 周六" },
  { value: "YYYY/M/D dddd", label: "2026/8/22 周六" },
];

// 昵称艺术字体候选（共 18 种，全部中英双语；与 layout.tsx 引入的字体一一对应）
const LOGO_FONTS = [
  { value: "ma-shan-zheng", label: "马善政毛笔楷书（中英）" },
  { value: "zcool-kuail", label: "站酷快乐体（中英）" },
  { value: "long-cang", label: "龙藏手写体（中英）" },
  { value: "zcool-xiaowei", label: "站酷小薇（中英）" },
  { value: "zcool-qingke", label: "站酷庆科黄油体（中英）" },
  { value: "liu-jian-mao-cao", label: "柳建毛草（中英）" },
  { value: "zhi-mang-xing", label: "智莽星行草（中英）" },
  { value: "noto-serif-sc", label: "思源宋体（中英）" },
  { value: "smiley-sans", label: "得意黑（中英）" },
  { value: "maoken-sans", label: "猫啃什锦黑（中英）" },
  { value: "yozai", label: "悠哉字体（中英）" },
  { value: "lxgw-wen-kai", label: "霞鹜文楷（中英）" },
  { value: "alimama-daka", label: "阿里妈妈东方大楷（中英）" },
  { value: "dingtalk-jinbuti", label: "钉钉进步体（中英）" },
  { value: "hongleixingshu", label: "鸿雷行书（中英）" },
  { value: "xiaolai", label: "小赖手写体（中英）" },
  { value: "slidefu", label: "演示春风楷（中英）" },
  { value: "slideqiuhong", label: "演示秋鸿（中英）" },
];

// 原生 select 的统一样式
const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 admin-select";

export default function ProfilePanel() {
  const [profile, setProfile] = useState<Profile>(INITIAL);
  const [loading, setLoading] = useState(!hasCachedProfile());
  const [saving, setSaving] = useState(false);
  // 是否存在未保存的修改：控制右下角悬浮保存按钮的显隐
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

  // 欢迎语数组：JSON 字符串 <-> 数组双向维护（Hook 须在条件 return 前调用）
  const welcomeList = useMemo(() => {
    try {
      const arr = JSON.parse(profile.welcomeMessages);
      return Array.isArray(arr) && arr.length ? arr : DEFAULT_WELCOME_MESSAGES.slice();
    } catch {
      return DEFAULT_WELCOME_MESSAGES.slice();
    }
  }, [profile.welcomeMessages]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      } else toast.error("保存失败");
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingPlaceholder />;
  }

  // TSX 中泛型箭头函数需加尾逗号，避免被解析为 JSX；
  // 任何字段变更都标记 dirty，驱动右下角悬浮保存按钮浮现
  const set = <K extends keyof Profile,>(key: K, value: Profile[K]) => {
    setProfile({ ...profile, [key]: value });
    setDirty(true);
  };

  function setWelcomeItem(idx: number, value: string) {
    const next = welcomeList.slice();
    next[idx] = value;
    set("welcomeMessages", JSON.stringify(next));
  }

  function addWelcomeItem() {
    if (welcomeList.length >= 20) return;
    set("welcomeMessages", JSON.stringify([...welcomeList, ""]));
  }

  function removeWelcomeItem(idx: number) {
    if (welcomeList.length <= 1) return;
    const next = welcomeList.filter((_, i) => i !== idx);
    set("welcomeMessages", JSON.stringify(next));
    // 删除当前选中项前的句子时，选中下标前移保持指向不变
    if (profile.welcomeIndex > idx) set("welcomeIndex", profile.welcomeIndex - 1);
    else if (profile.welcomeIndex >= next.length) set("welcomeIndex", next.length - 1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>站点信息</CardTitle>
        <CardDescription>修改主页显示的信息与进阶配置</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-3 pb-16">
          {/* ========== 基础信息 ========== */}
          <details open className="group overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3.5 font-medium transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden list-none">
              <span className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                <span>基础信息</span>
                <span className="text-xs font-normal text-muted-foreground">基本信息 · 欢迎通知 · SEO 配置</span>
              </span>
              <svg className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </summary>
            <div className="space-y-5 border-t px-5 py-5">
              {/* ---- 基本信息 ---- */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border/60" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">基本信息</h4>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="avatar">头像 URL</Label>
                    <Input
                      id="avatar"
                      value={profile.avatar}
                      onChange={(e) => set("avatar", e.target.value)}
                      placeholder="https://example.com/avatar.png"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="siteIcon">网站图标 URL</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="siteIcon"
                        value={profile.siteIcon}
                        onChange={(e) => set("siteIcon", e.target.value)}
                        placeholder="留空使用默认图标"
                      />
                      {profile.siteIcon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profile.siteIcon}
                          alt="网站图标预览"
                          className="h-8 w-8 shrink-0 rounded object-contain ring-1 ring-border"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.opacity = "0.3";
                          }}
                        />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      浏览器标签页 / 收藏夹图标（支持 png / svg / ico）
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nickname">昵称</Label>
                  <Input
                    id="nickname"
                    value={profile.nickname}
                    onChange={(e) => set("nickname", e.target.value)}
                    placeholder="你的昵称"
                  />
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <label className="flex cursor-pointer items-center justify-between rounded-lg border border-input bg-background/50 px-3 py-2.5 transition-colors hover:bg-muted/30" htmlFor="logoArtFont">
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">艺术字体显示</span>
                      <span className="text-xs text-muted-foreground">昵称使用手写艺术字体</span>
                    </span>
                    <input
                      id="logoArtFont"
                      type="checkbox"
                      name="logoArtFont"
                      checked={profile.logoArtFont}
                      onChange={(e) => set("logoArtFont", e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between rounded-lg border border-input bg-background/50 px-3 py-2.5 transition-colors hover:bg-muted/30" htmlFor="loadingScreen">
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">全屏加载动画</span>
                      <span className="text-xs text-muted-foreground">首页三环旋转加载</span>
                    </span>
                    <input
                      id="loadingScreen"
                      type="checkbox"
                      name="loadingScreen"
                      checked={profile.loadingScreen}
                      onChange={(e) => set("loadingScreen", e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logoFont">艺术字体样式</Label>
                  <select
                    id="logoFont"
                    className={selectClass}
                    value={profile.logoFont}
                    disabled={!profile.logoArtFont}
                    onChange={(e) => set("logoFont", e.target.value)}
                  >
                    {LOGO_FONTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    18 款艺术字体全部支持中英文字符，可任意选择
                  </p>
                </div>

                {/* 特效与功能开关组（2 列紧凑排列） */}
                <div className="grid gap-2 md:grid-cols-2">
                  {(
                    [
                      {
                        key: "clickEffect" as const,
                        title: "点击粒子特效",
                        desc: "点击页面绽放彩色粒子",
                      },
                      {
                        key: "consoleEgg" as const,
                        title: "控制台彩蛋",
                        desc: "DevTools 显示 ASCII 艺术字",
                      },
                      {
                        key: "showStats" as const,
                        title: "站点访问统计",
                        desc: "页脚显示浏览与访客数",
                      },
                      {
                        key: "dynamicTitle" as const,
                        title: "动态页面标题",
                        desc: "标签页显示问候语与歌名",
                      },
                      {
                        key: "topProgressBar" as const,
                        title: "顶部音乐进度条",
                        desc: "页面顶部可拖拽播放进度",
                      },
                      {
                        key: "useRandomAvatar" as const,
                        title: "随机头像",
                        desc: "每次刷新使用随机头像",
                      },
                    ] as { key: keyof Profile; title: string; desc: string }[]
                  ).map((item) => (
                    <label
                      key={item.key}
                      htmlFor={item.key}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-input bg-background/50 px-3 py-2.5 transition-colors hover:bg-muted/30"
                    >
                      <span className="flex flex-col">
                        <span className="text-sm font-medium">{item.title}</span>
                        <span className="text-xs text-muted-foreground">{item.desc}</span>
                      </span>
                      <input
                        id={item.key}
                        type="checkbox"
                        name={item.key}
                        checked={profile[item.key] as boolean}
                        onChange={(e) => set(item.key, e.target.checked as Profile[typeof item.key])}
                        className="h-4 w-4 accent-primary"
                      />
                    </label>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">个性签名</Label>
                  <Textarea
                    id="bio"
                    value={profile.bio}
                    onChange={(e) => set("bio", e.target.value)}
                    placeholder="一句话介绍自己"
                    rows={2}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="github">GitHub 链接</Label>
                    <Input
                      id="github"
                      value={profile.github}
                      onChange={(e) => set("github", e.target.value)}
                      placeholder="https://github.com/yourname"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">邮箱</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={profile.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
              </div>

              {/* ---- 欢迎通知 ---- */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border/60" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">欢迎通知</h4>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-input bg-background/50 px-3 py-2.5 transition-colors hover:bg-muted/30" htmlFor="welcomeEnabled">
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">顶部居中欢迎消息</span>
                    <span className="text-xs text-muted-foreground">
                      页面加载后顶部展示欢迎语（同一会话仅显示一次）
                    </span>
                  </span>
                  <input
                    id="welcomeEnabled"
                    type="checkbox"
                    name="welcomeEnabled"
                    checked={profile.welcomeEnabled}
                    onChange={(e) => set("welcomeEnabled", e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                </label>

                <div className="space-y-2">
                  <Label>欢迎语列表</Label>
                  <div className="space-y-2">
                    {welcomeList.map((msg, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <label
                          htmlFor={`welcome-radio-${idx}`}
                          className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
                          title="选择页面展示这句"
                        >
                          <input
                            id={`welcome-radio-${idx}`}
                            type="radio"
                            name="welcomeIndex"
                            value={idx}
                            checked={profile.welcomeIndex === idx}
                            onChange={() => set("welcomeIndex", idx)}
                            className="h-4 w-4 accent-primary"
                          />
                          第 {idx + 1} 句
                        </label>
                        <Input
                          id={`welcome-message-${idx}`}
                          name={`welcome-message-${idx}`}
                          value={msg}
                          onChange={(e) => setWelcomeItem(idx, e.target.value)}
                          placeholder="输入欢迎语，支持 {siteName} 占位符"
                        />
                        <button
                          type="button"
                          onClick={() => removeWelcomeItem(idx)}
                          disabled={welcomeList.length <= 1}
                          className="shrink-0 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addWelcomeItem}
                    disabled={welcomeList.length >= 20}
                  >
                    + 添加欢迎语
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    勾选第 N 句即表示页面展示该句；{`{siteName}`} 占位符会替换为站点昵称
                  </p>
                </div>
              </div>

              {/* ---- SEO 配置 ---- */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border/60" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SEO 配置</h4>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <p className="text-xs text-muted-foreground">
                  后台配置后立即替换标签页标题与搜索引擎描述，无需重新构建
                </p>

                <div className="space-y-2">
                  <Label htmlFor="siteTitle">站点标题</Label>
                  <Input
                    id="siteTitle"
                    value={profile.siteTitle}
                    onChange={(e) => set("siteTitle", e.target.value)}
                    placeholder="留空使用默认「个人主页」"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="siteDescription">站点描述</Label>
                  <Textarea
                    id="siteDescription"
                    value={profile.siteDescription}
                    onChange={(e) => set("siteDescription", e.target.value)}
                    placeholder="一句话描述站点，展示在搜索结果摘要"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="siteKeywords">站点关键词</Label>
                  <Input
                    id="siteKeywords"
                    value={profile.siteKeywords}
                    onChange={(e) => set("siteKeywords", e.target.value)}
                    placeholder="个人主页, 博客, 导航（逗号分隔）"
                  />
                </div>
              </div>
            </div>
          </details>

          {/* ========== 内容展示 ========== */}
          <details className="group overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3.5 font-medium transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden list-none">
              <span className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span>内容展示</span>
                <span className="text-xs font-normal text-muted-foreground">时钟 · 一言</span>
              </span>
              <svg className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </summary>
            <div className="space-y-5 border-t px-5 py-5">
              {/* ---- 时钟与一言 ---- */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border/60" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">时钟与一言</h4>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="timeFormat">时钟格式</Label>
                    <select
                      id="timeFormat"
                      className={selectClass}
                      value={profile.timeFormat}
                      onChange={(e) => set("timeFormat", e.target.value)}
                    >
                      {TIME_FORMATS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex cursor-pointer items-center justify-between rounded-lg border border-input bg-background/50 px-3 py-2.5 transition-colors hover:bg-muted/30" htmlFor="showSeconds">
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">显示秒数</span>
                      <span className="text-xs text-muted-foreground">时钟是否显示秒</span>
                    </span>
                    <input
                      id="showSeconds"
                      type="checkbox"
                      name="showSeconds"
                      checked={profile.showSeconds}
                      onChange={(e) => set("showSeconds", e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dateFormat">日期格式</Label>
                  <select
                    id="dateFormat"
                    className={selectClass}
                    value={profile.dateFormat}
                    onChange={(e) => set("dateFormat", e.target.value)}
                  >
                    {DATE_FORMAT_PRESETS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                    {!DATE_FORMAT_PRESETS.some((o) => o.value === profile.dateFormat) && (
                      <option value={profile.dateFormat}>自定义：{profile.dateFormat}</option>
                    )}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    支持占位符：YYYY 年 / YY 两位年 / MM / M / DD / D / dddd 中文星期
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hitokotoType">一言类型</Label>
                  <select
                    id="hitokotoType"
                    className={selectClass}
                    value={profile.hitokotoType}
                    onChange={(e) => set("hitokotoType", e.target.value)}
                  >
                    {HITOKOTO_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    指定类型后优先从 hitokoto.cn 获取对应分类句子
                  </p>
                </div>
              </div>
            </div>
          </details>

          {/* ========== 网站链接区 ========== */}
          <details className="group overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3.5 font-medium transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden list-none">
              <span className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.5)]" />
                <span>网站链接区</span>
                <span className="text-xs font-normal text-muted-foreground">区域标题 · 图标库地址</span>
              </span>
              <svg className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </summary>
            <div className="space-y-5 border-t px-5 py-5">
              {/* ---- 网站链接区 ---- */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border/60" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">网站链接区</h4>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="siteLinksTitle">网站标签标题</Label>
                    <Input
                      id="siteLinksTitle"
                      value={profile.siteLinksTitle}
                      onChange={(e) => set("siteLinksTitle", e.target.value)}
                      placeholder="我的网站"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="friendLinksTitle">友情标签标题</Label>
                    <Input
                      id="friendLinksTitle"
                      value={profile.friendLinksTitle}
                      onChange={(e) => set("friendLinksTitle", e.target.value)}
                      placeholder="友情链接"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  两个标题合并为区域大标题展示，如「我的网站 / 友情链接」；仅某类有数据时只显示对应的标题
                </p>

                <div className="space-y-2">
                  <Label htmlFor="siteLinksIcon">标题图标</Label>
                  <Input
                    id="siteLinksIcon"
                    value={profile.siteLinksIcon}
                    onChange={(e) => set("siteLinksIcon", e.target.value)}
                    placeholder="link"
                  />
                  <p className="text-xs text-muted-foreground">
                    lucide 图标名 或 iconfont symbol 名
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="iconfontUrl">图标库地址（阿里云矢量图标库）</Label>
                  <Input
                    id="iconfontUrl"
                    value={profile.iconfontUrl}
                    onChange={(e) => set("iconfontUrl", e.target.value)}
                    placeholder="https://at.alicdn.com/t/c/font_xxxx_xxxx.js"
                  />
                  <p className="text-xs text-muted-foreground">
                    在 iconfont.cn 创建项目 → 添加图标 → 选择「Symbol」模式 → 复制生成的 JS 链接填入。
                    配置后，社交链接与网站链接的图标输入框旁会出现「从图标库选择」按钮，可挑选图标。
                    留空则仅使用内置 lucide 图标。
                  </p>
                </div>
              </div>
            </div>
          </details>

          {/* ========== 页脚与脚本 ========== */}
          <details className="group overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3.5 font-medium transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden list-none">
              <span className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                <span>页脚与脚本</span>
                <span className="text-xs font-normal text-muted-foreground">页脚信息 · 统计与脚本</span>
              </span>
              <svg className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </summary>
            <div className="space-y-5 border-t px-5 py-5">
              {/* ---- 页脚 ---- */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border/60" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">页脚</h4>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="siteUrl">站点地址</Label>
                  <Input
                    id="siteUrl"
                    value={profile.siteUrl}
                    onChange={(e) => set("siteUrl", e.target.value)}
                    placeholder="https://your-domain.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    页脚版权信息中作者名跳转的链接
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="siteIcp">ICP 备案号</Label>
                    <Input
                      id="siteIcp"
                      value={profile.siteIcp}
                      onChange={(e) => set("siteIcp", e.target.value)}
                      placeholder="京ICP备XXXXXXXX号"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="siteMps">公安备案号</Label>
                    <Input
                      id="siteMps"
                      value={profile.siteMps}
                      onChange={(e) => set("siteMps", e.target.value)}
                      placeholder="苏公网安备XXXXXXXX号"
                    />
                    <p className="text-xs text-muted-foreground">
                      填写后显示带盾牌图标的公安备案链接
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="siteStart">建站日期</Label>
                  <Input
                    id="siteStart"
                    type="date"
                    value={profile.siteStart}
                    onChange={(e) => set("siteStart", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    用于计算页脚「已运行 N 天」
                  </p>
                </div>
              </div>

              {/* ---- 统计与脚本 ---- */}
              <div className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border/60" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">统计与脚本</h4>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="analyticsScript">统计代码</Label>
                  <Textarea
                    id="analyticsScript"
                    value={profile.analyticsScript}
                    onChange={(e) => set("analyticsScript", e.target.value)}
                    placeholder={"<script>\n// 百度统计 / Umami / 51LA 统计代码\n</script>"}
                    rows={5}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    粘贴统计服务提供的完整代码片段（可含 script 标签），保存后立即生效
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="headScript">自定义 head 脚本</Label>
                  <Textarea
                    id="headScript"
                    value={profile.headScript}
                    onChange={(e) => set("headScript", e.target.value)}
                    placeholder={"<meta name=\"baidu-site-verification\" content=\"...\" />\n<script>...</script>"}
                    rows={5}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    站长验证、第三方插件等任意 head 内容（script 与 meta 均可）
                  </p>
                </div>
              </div>
            </div>
          </details>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "保存中..." : "保存站点信息"}
          </Button>
        </form>

        {/* 右下角悬浮保存：修改任意配置后浮现，免去滚动到底部（保存成功后自动隐藏） */}
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

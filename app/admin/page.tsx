"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  User,
  Settings,
  ScrollText,
  CloudSun,
  LogOut,
  Menu,
  X,
  Activity,
  LayoutDashboard,
  ShieldCheck,
  Wrench,
  Palette,
  Music,
  Database,
  BarChart3,
  Megaphone,
  ExternalLink,
  Copy,
  Images,
  Link2,
  Rocket,
} from "lucide-react";
import ProfilePanel from "@/components/admin/ProfilePanel";
import LinksManager from "@/components/admin/LinksManager";
import AccountPanel from "@/components/admin/AccountPanel";
import OperationLogPanel from "@/components/admin/OperationLogPanel";
import MediaPanel from "@/components/admin/MediaPanel";
import WeatherPanel from "@/components/admin/WeatherPanel";
import HealthPanel from "@/components/admin/HealthPanel";
import ThemePanel from "@/components/admin/ThemePanel";
import MusicPanel from "@/components/admin/MusicPanel";
import DataPanel from "@/components/admin/DataPanel";
import StatsPanel from "@/components/admin/StatsPanel";
import AnnouncementPanel from "@/components/admin/AnnouncementPanel";
import UpdatePanel from "@/components/admin/UpdatePanel";

type TabId =
  | "profile"
  | "theme"
  | "music"
  | "links"
  | "weather"
  | "announcements"
  | "account"
  | "logs"
  | "health"
  | "data"
  | "stats"
  | "media"
  | "update";

interface TabItem {
  id: TabId;
  label: string;
  icon: typeof User;
  description: string;
}

interface NavGroup {
  label: string;
  icon: typeof LayoutDashboard;
  items: TabItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "站点内容",
    icon: LayoutDashboard,
    items: [
      { id: "profile", label: "站点信息", icon: User, description: "设置个人主页的基本资料与展示信息" },
      { id: "announcements", label: "站点公告", icon: Megaphone, description: "发布/编辑公告，前台上方展示" },
      { id: "links", label: "链接管理", icon: Link2, description: "集中管理社交、网站与友情链接" },
    ],
  },
  {
    label: "外观与功能",
    icon: Palette,
    items: [
      { id: "theme", label: "主题与壁纸", icon: Palette, description: "配置背景壁纸、主题模式与整体视觉氛围" },
      { id: "music", label: "音乐设置", icon: Music, description: "配置音乐播放器的歌单来源与播放平台" },
      { id: "weather", label: "天气设置", icon: CloudSun, description: "配置天气组件的城市与展示样式" },
    ],
  },
  {
    label: "系统设置",
    icon: ShieldCheck,
    items: [
      { id: "account", label: "账号与安全", icon: Settings, description: "修改登录密码与账号安全选项" },
    ],
  },
  {
    label: "运维与统计",
    icon: Wrench,
    items: [
      { id: "stats", label: "访问统计", icon: BarChart3, description: "查看访问数据与趋势" },
      { id: "logs", label: "操作日志", icon: ScrollText, description: "查看系统操作记录与审计日志" },
      { id: "health", label: "服务状态", icon: Activity, description: "监控服务运行状态与健康指标" },
      { id: "data", label: "数据管理", icon: Database, description: "备份与恢复站点数据" },
      { id: "media", label: "媒体库", icon: Images, description: "集中管理上传的图片资源" },
      { id: "update", label: "系统更新", icon: Rocket, description: "检测并更新站点版本、查看日志与回滚" },
    ],
  },
];

// 扁平化 TABS 用于兼容现有逻辑
const TABS: TabItem[] = NAV_GROUPS.flatMap((g) => g.items);

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  // 移动端抽屉侧边栏开关
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // 默认账号改密提示（本次会话内可关闭）
  const [hideDefaultWarning, setHideDefaultWarning] = useState(false);
  // 站点首页地址（用于「打开主页 / 复制主页地址」，来源为站点信息配置，缺省回退到当前源）
  const [siteUrl, setSiteUrl] = useState("");

  // 切换分类：桌面端直接切换；移动端切换后关闭抽屉
  function selectTab(id: TabId) {
    setActiveTab(id);
    setMobileNavOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.siteUrl) setSiteUrl(d.siteUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const homepageUrl = siteUrl || (typeof window !== "undefined" ? window.location.origin : "");
  async function copyHomepage() {
    try {
      await navigator.clipboard.writeText(homepageUrl);
      toast.success("主页地址已复制");
    } catch {
      toast.error("复制失败，请重试");
    }
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/admin/login");
    }
  }, [status, router]);

  useEffect(() => {
    document.title = "后台管理 · 个人主页";
  }, []);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  const username = session?.user?.name || "管理员";
  const currentTab = TABS.find((t) => t.id === activeTab);

  // 侧边栏导航项组件（桌面端 + 移动端共用样式逻辑）
  const NavItem = ({ tab }: { tab: TabItem }) => {
    const Icon = tab.icon;
    const active = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => selectTab(tab.id)}
        className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ease-out ${
          active
            ? "bg-primary/10 text-primary font-semibold"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        }`}
      >
        {/* 激活态左侧竖线指示器 */}
        <span
          className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200 ${
            active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
          }`}
        />
        <Icon
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
            active ? "scale-110" : "group-hover:scale-105"
          }`}
        />
        <span className="truncate">{tab.label}</span>
      </button>
    );
  };

  // 侧边栏品牌区组件
  const BrandHeader = ({ compact = false }: { compact?: boolean }) => (
    <div className="relative overflow-hidden">
      {/* 顶部渐变装饰条 */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-violet-500 to-fuchsia-500" />
      <div
        className={`relative flex items-center gap-3 border-b px-5 ${
          compact ? "py-4" : "px-6 py-5"
        }`}
      >
        {/* 品牌 Logo */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-600 text-white shadow-md shadow-primary/20">
          <LayoutDashboard className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            个人主页后台
          </h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {username}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <main className="admin min-h-screen bg-background">
      {/* 移动端纵向排列（顶栏在上），桌面端横向排列（侧边栏在左） */}
      <div className="flex min-h-screen flex-col md:flex-row">
        {/* ===== 桌面端：左侧固定侧边导航 ===== */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card/70 backdrop-blur-sm md:flex">
          <BrandHeader />

          <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
            {NAV_GROUPS.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.label} className="space-y-1">
                  {/* 分组标题 */}
                  <div className="flex items-center gap-2 px-3 pb-1.5">
                    <GroupIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                      {group.label}
                    </span>
                  </div>
                  {/* 分组下的导航项 */}
                  <div className="space-y-0.5">
                    {group.items.map((tab) => (
                      <NavItem key={tab.id} tab={tab} />
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="space-y-2 border-t p-3">
            <a
              href={homepageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              打开主页
            </a>
            <Button
              variant="outline"
              size="sm"
              className="w-full transition-all duration-200 hover:border-error/40 hover:bg-error/10 hover:text-error"
              onClick={() => signOut({ callbackUrl: "/admin/login" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </Button>
          </div>
        </aside>

        {/* ===== 移动端：顶栏 + 抽屉侧边导航 ===== */}
        {/* 顶部栏 */}
        <header className="sticky top-0 z-30 flex w-full shrink-0 items-center justify-between border-b bg-background/90 px-3 py-2.5 backdrop-blur-md md:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="打开菜单"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-600 text-white shadow-sm">
              <LayoutDashboard className="h-3.5 w-3.5" />
            </div>
            <h1 className="text-sm font-semibold tracking-tight">个人主页后台</h1>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            aria-label="退出登录"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        {/* 抽屉遮罩 */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* 抽屉侧边栏 */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 transform shadow-2xl transition-transform duration-300 ease-out md:hidden ${
            mobileNavOpen
              ? "translate-x-0 pointer-events-auto"
              : "-translate-x-full pointer-events-none"
          }`}
        >
          <div className="flex h-full flex-col border-r bg-card">
            <div className="flex items-center justify-between">
              <BrandHeader compact />
              <button
                onClick={() => setMobileNavOpen(false)}
                aria-label="关闭菜单"
                className="mr-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
              {NAV_GROUPS.map((group) => {
                const GroupIcon = group.icon;
                return (
                  <div key={group.label} className="space-y-1">
                    <div className="flex items-center gap-2 px-3 pb-1.5">
                      <GroupIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                        {group.label}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {group.items.map((tab) => (
                        <NavItem key={tab.id} tab={tab} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>

            <div className="space-y-2 border-t p-3">
              <a
                href={homepageUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileNavOpen(false)}
                className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
                打开主页
              </a>
              <Button
                variant="outline"
                size="sm"
                className="w-full transition-all duration-200 hover:border-error/40 hover:bg-error/10 hover:text-error"
                onClick={() => {
                  setMobileNavOpen(false);
                  signOut({ callbackUrl: "/admin/login" });
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                退出登录
              </Button>
            </div>
          </div>
        </aside>

        {/* ===== 内容区 ===== */}
        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-4xl px-4 py-6 pb-16 md:px-8 md:py-8">
            {/* 强制改密提示：mustChangePassword 为 true 时显示；改密成功后（后端置 false）自动消失 */}
            {session?.user?.mustChangePassword && !hideDefaultWarning && (
              <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3.5 text-sm text-warning shadow-sm backdrop-blur">
                <p className="leading-relaxed">
                  当前登录账号 <strong className="font-semibold">{username}</strong> 仍在使用默认密码，存在被暴力破解的风险，请尽快前往「账号设置」修改密码。
                </p>
                <button
                  type="button"
                  onClick={() => setHideDefaultWarning(true)}
                  className="shrink-0 font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
                  aria-label="关闭提示"
                >
                  知道了
                </button>
              </div>
            )}

            {/* 页面标题头 */}
            {currentTab && (
              <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {(() => {
                      const Icon = currentTab.icon;
                      return <Icon className="h-5 w-5" />;
                    })()}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-foreground">
                      {currentTab.label}
                    </h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {currentTab.description}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyHomepage}
                  className="gap-1.5 text-muted-foreground"
                >
                  <Copy className="h-4 w-4" />
                  复制主页地址
                </Button>
              </div>
            )}

            {/* 内容面板 */}
            <div className="transition-opacity duration-300">
              {activeTab === "profile" && <ProfilePanel />}
              {activeTab === "theme" && <ThemePanel />}
              {activeTab === "music" && <MusicPanel />}
              {activeTab === "links" && <LinksManager />}
              {activeTab === "weather" && <WeatherPanel />}
              {activeTab === "announcements" && <AnnouncementPanel />}
              {activeTab === "account" && <AccountPanel />}
              {activeTab === "logs" && <OperationLogPanel />}
              {activeTab === "health" && <HealthPanel />}
              {activeTab === "data" && <DataPanel />}
              {activeTab === "stats" && <StatsPanel />}
              {activeTab === "media" && <MediaPanel />}
              {activeTab === "update" && <UpdatePanel />}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

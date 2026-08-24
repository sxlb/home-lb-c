import { prisma } from "@/lib/db";
import { cache } from "react";
import { Quote } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import Background from "@/components/Background";
import ClockWeatherCapsule from "@/components/ClockWeatherCapsule";
import SocialLinks from "@/components/SocialLinks";
import LinkTabs from "@/components/LinkTabs";
import ThemeProvider from "@/components/ThemeProvider";
import AuthorCheck from "@/components/AuthorCheck";
import LogoFontLoader from "@/components/LogoFontLoader";
import FaviconUpdater from "@/components/FaviconUpdater";
import ScriptInjector from "@/components/ScriptInjector";
import { IconfontScript } from "@/components/Iconfont";
import { MusicProviderLazy, MusicCardLazy } from "@/components/MusicProviderLazy";
import dynamic from "next/dynamic";

const Effects = dynamic(() => import("@/components/Effects"));
const SeasonalEffect = dynamic(() => import("@/components/SeasonalEffect"));
// 页脚懒加载：桌面端页脚在视口外，延迟加载减小首屏 JS
const FooterLazy = dynamic(() => import("@/components/Footer"), {
  ssr: true,
  loading: () => <div className="h-12" />,
});

export const revalidate = 60;

/** 从数据库加载站点信息（React cache：同一请求内 generateMetadata 与组件渲染共享一次查询） */
const getProfile = cache(async () => {
  try {
    return await prisma.profile.findFirst({ orderBy: { id: "asc" } });
  } catch {
    return null;
  }
});

/** 动态 SEO 元信息：后台配置的标题/描述/关键词（ISR 60s 缓存） */
export async function generateMetadata(): Promise<import("next").Metadata> {
  const profile = await getProfile();
  const siteTitle = profile?.siteTitle?.trim();
  const siteDescription = profile?.siteDescription?.trim();
  const siteKeywords = profile?.siteKeywords?.trim();
  return {
    title: siteTitle || "个人主页",
    description: siteDescription || "极简个人主页",
    ...(siteKeywords ? { keywords: siteKeywords.split(/[,，]/).map((s) => s.trim()).filter(Boolean) } : {}),
  };
}

// ── 数据准备：默认值、头像解析、字体映射等逻辑已抽取到 hooks.ts ──
import { getHomeData } from "./hooks";

export default async function Home() {
  const profile = await getProfile();
  const d = await getHomeData(profile);

  return (
    <ThemeProvider theme={d.theme} accentColor={d.accentColor} glassOpacity={d.glassOpacity} glassBlur={d.glassBlur}>
      {/* 音乐播放器 Provider：包住全站内容，提供播放状态与列表弹窗；控制面板内嵌于功能卡组（MusicCard） */}
      <MusicProviderLazy
        songApi={d.songApi}
        songServer={d.songServer}
        songId={d.songId}
      >
        {/* 桌面端 main 固定一屏高（md:h-dvh）：section flex-1 填满剩余空间并居中内容，
            页脚落在视口底部无需滚动；移动端 main 自然高度，页脚在内容后滚动出现 */}
        <main className="relative flex min-h-dvh w-full flex-col text-white md:h-dvh">
        <AuthorCheck />
        <FaviconUpdater icon={d.siteIcon} />
        <ScriptInjector scripts={[d.analyticsScript, d.headScript]} />

        <Effects
          loadingScreen={d.loadingScreen}
          clickEffect={d.clickEffect}
          consoleEgg={d.consoleEgg}
          dynamicTitle={d.dynamicTitle}
          topProgressBar={d.topProgressBar}
          welcomeEnabled={d.welcomeEnabled}
          siteName={d.nickname}
          welcomeMessages={d.welcomeMessages}
          welcomeIndex={d.welcomeIndex}
        />

        {/* SSR 阶段已解析壁纸直链：浏览器在 HTML 解析时即开始下载背景图（与 JS 并行），消除首屏等待 */}
        {d.wallpaperUrl && <link rel="preload" as="image" href={d.wallpaperUrl} fetchPriority="high" />}

        {/* 阿里云矢量图标库：配置后注入 symbol 脚本，供社交/网站链接图标使用 */}
        <IconfontScript url={d.iconfontUrl} />

        <Background bgApi={d.bgApi} coverType={d.coverType} autoSwitchInterval={d.autoBGSwitchInterval} bgOverlay={d.bgOverlay} wallpaperRefresh={d.wallpaperRefresh} initialUrl={d.wallpaperUrl} />
        <SeasonalEffect type={d.effectType} enabled />

        <section className="relative z-10 flex w-full flex-1 flex-col items-center">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 px-5 pt-16 pb-20 md:my-auto md:items-start md:px-4 md:pt-0 md:pb-0">
            {/* 左右栏等高（md:items-stretch），左栏内容在其区域内垂直居中，与右栏（功能卡+网站链接）形成平衡构图 */}
            <div className="flex w-full flex-col items-center gap-5 md:flex-row md:items-stretch">
              {/* 左侧区域：头像 + 简介 + 社交（垂直居中于等高左栏，左下方不留大片空白） */}
              <div className="flex w-full flex-col items-center md:w-1/2 md:items-start md:justify-center">
                <div className="flex items-center gap-4 sm:gap-6 md:gap-7 lg:gap-8 xl:gap-10">
                  <Avatar
                    className={`h-[88px] w-[88px] shadow-card-md sm:h-[100px] sm:w-[100px] md:h-[120px] md:w-[120px] lg:h-[130px] lg:w-[130px] xl:h-[140px] xl:w-[140px] ${d.avatarShapeClass} ${
                      d.avatarBorderColor ? "" : "ring-2 ring-white/30"
                    }`}
                    style={d.avatarStyle}
                  >
                    {d.finalAvatar ? <AvatarImage src={d.finalAvatar} alt={d.nickname} /> : null}
                    <AvatarFallback className="bg-white/10 text-xl uppercase text-white md:text-3xl">
                      {d.nickname.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <h1 className={`${d.logoFontClass} text-glow-accent leading-none tracking-tight truncate logo-title`}>
                    <span className="text-[28px] leading-none sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl">
                      <LogoFontLoader text={d.nickname} fontClass={d.logoFontClass} />
                    </span>
                  </h1>
                </div>

                {/* 简介卡片 */}
                <div className="card-glass card-info mt-5 flex max-w-[480px] w-full items-start justify-between gap-3 p-4">
                  <Quote className="mt-0.5 h-[18px] w-[18px] shrink-0 rotate-180 text-white/50" />
                  <p className="min-w-0 flex-1 break-words text-base leading-relaxed text-white/90">{d.bio}</p>
                  <Quote className="mt-0.5 h-[18px] w-[18px] shrink-0 text-white/50" />
                </div>

                {/* 社交链接 */}
                <SocialLinks initialLinks={d.socialLinks} />
              </div>

              {/* 右侧区域：功能区 + 链接 */}
              <div className="flex w-full flex-col gap-4 md:w-1/2 md:max-w-[480px]">
                {/* 功能卡片组：一言 + 时钟天气（lg 起才并排，避免 md 下时钟卡过窄导致时间溢出） */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* 一言 / 音乐控制面板（hover 或"打开音乐"按钮切换，对齐 home） */}
                  <div>
                    <MusicCardLazy hitokotoType={d.hitokotoType} />
                  </div>

                  {/* 时钟+天气：clock-card-container 启用容器查询（container-type: inline-size），
                      时间字号按卡片宽度自适应（cqw）；min-h 保证最低高度 */}
                  <div className="clock-card-container min-h-[150px] lg:min-h-[160px] xl:min-h-[170px]">
                    <div className="card-glass card-func flex h-full w-full flex-col justify-end p-4">
                      <ClockWeatherCapsule
                        timeFormat={d.timeFormat}
                        showSeconds={d.showSeconds}
                        dateFormat={d.dateFormat}
                      />
                    </div>
                  </div>
                </div>

                {/* 导航链接：网站 + 友情，tab 切换，统一网站卡样式 */}
                {(d.siteLinks.length > 0 || d.friendLinks.length > 0) && (
                  <div className="card-glass card-list w-full rounded-2xl p-4">
                    <LinkTabs
                      siteLinks={d.siteLinks.map((l) => ({ ...l, icon: l.icon ?? "" }))}
                      friendLinks={d.friendLinks}
                      siteTitle={d.siteLinksTitle}
                      siteIcon={d.siteLinksIcon}
                      friendTitle={d.friendLinksTitle}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 页脚：版权信息 */}
        <FooterLazy siteName={d.nickname} siteUrl={d.siteUrl} siteIcp={d.siteIcp} siteMps={d.siteMps} siteStart={d.siteStart} showStats={d.showStats} />
        </main>
      </MusicProviderLazy>
    </ThemeProvider>
  );
}

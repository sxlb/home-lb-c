"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, X } from "lucide-react";

/**
 * ===== 页面装饰/工具类效果组件合集 =====
 *
 * 说明：以下 6 个组件均为"enabled 开关 + 返回 null/占位"的客户端效果组件，
 * 功能独立但形态高度一致（均为非核心装饰，由后台开关控制），合并为单文件：
 * - 各子组件仍以具名导出暴露，便于单测与按需引用
 * - 默认导出 Effects 组合组件，供首页一处挂载全部效果
 * 合并后减小文件数目，且这些组件本来就在页面加载后同时生效，
 * 不会因合并带来额外的按需加载负担。
 */

/* ==================== 全屏加载动画 ==================== */

interface LoadingScreenProps {
  /** 是否启用加载动画（后台可配置） */
  enabled?: boolean;
  /** 站点昵称，显示在加载动画中央 */
  siteName?: string;
}

/**
 * 全屏加载动画
 * - 三环旋转动画 + 站点名 + Loading 文字
 * - 条件全部满足后分屏收起，随后移除遮罩：
 *   1. 最短展示 800ms（避免闪屏）
 *   2. 页面 window load 完成
 *   3. 背景壁纸就绪（Background 组件广播 background-ready 事件）
 * - 安全兜底：最长 5s 强制收起，防止背景源异常导致加载动画卡死
 */
export function LoadingScreen({ enabled = true, siteName = "" }: LoadingScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [bgReady, setBgReady] = useState(false);

  // 监听背景就绪事件；若背景先于本组件挂载完成（window.__bgReady），直接视为就绪
  useEffect(() => {
    if (!enabled) return;
    if ((window as unknown as { __bgReady?: boolean }).__bgReady) {
      setBgReady(true);
      return;
    }
    const onReady = () => setBgReady(true);
    window.addEventListener("background-ready", onReady);
    return () => window.removeEventListener("background-ready", onReady);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || removed) return;

    let mounted = true;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const hide = () => {
      if (!mounted || hideTimer) return;
      // 先加 loaded 状态触发分屏收起动画
      setLoaded(true);
      // 等动画全部完成再移除节点：分屏收起 0.3s 延迟 + 0.5s，整体上移 1s 延迟 + 0.3s，共 1.3s
      hideTimer = setTimeout(() => {
        if (mounted) setRemoved(true);
        // 广播"加载动画已完全移除"，供欢迎通知等组件在动画结束后再展示
        window.dispatchEvent(new Event("loading-screen-removed"));
      }, 1400);
    };

    const tryHide = () => {
      if (document.readyState === "complete" && bgReady) hide();
    };

    // 最短展示时间（800ms）+ 条件判断
    const minTimer = setTimeout(() => {
      if (document.readyState === "complete" && bgReady) {
        hide();
      } else {
        window.addEventListener("load", tryHide, { once: true });
      }
    }, 800);

    // 背景就绪（bgReady 变化触发本 effect 重跑）后立即复查
    if (bgReady && document.readyState === "complete") hide();

    // 安全兜底：最长 5s 无论背景是否就绪都收起
    const safety = setTimeout(hide, 5000);

    return () => {
      mounted = false;
      if (minTimer) clearTimeout(minTimer);
      if (safety) clearTimeout(safety);
      if (hideTimer) clearTimeout(hideTimer);
      window.removeEventListener("load", tryHide);
    };
  }, [enabled, bgReady, removed]);

  if (!enabled || removed) return null;

  return (
    <div
      id="loader-wrapper"
      className={`fixed inset-0 z-[999] overflow-hidden bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#1a1a2e] ${
        loaded ? "loader-loaded" : ""
      }`}
      aria-hidden
    >
      {/* 中心加载内容 */}
      <div className="loader">
        <div className="loader-circle" />
        <div className="loader-text">
          <span className="loader-name">{siteName || "个人主页"}</span>
          <span className="loader-tip">Loading...</span>
        </div>
      </div>
      {/* 左右分屏遮罩（使用与背景一致的渐变色） */}
      <div className="loader-section loader-section-left" style={{ background: "linear-gradient(90deg, #1a1a2e 0%, #16213e 100%)" }} />
      <div className="loader-section loader-section-right" style={{ background: "linear-gradient(270deg, #1a1a2e 0%, #16213e 100%)" }} />
    </div>
  );
}

/* ==================== 点击粒子特效 ==================== */

interface ClickEffectProps {
  /** 是否启用（后台可配置） */
  enabled?: boolean;
}

interface Particle {
  el: HTMLSpanElement;
  x: number;
  y: number;
}

// 莫兰迪色系（低饱和度、高级感）
const CLICK_COLORS = [
  "#d4a0a0", // 灰玫瑰粉
  "#c9c0a3", // 砂岩米黄
  "#94b5a0", // 薄荷灰绿
  "#8fa8c9", // 雾霭蓝灰
  "#c4a882", // 驼金棕
  "#b5a0be", // 薰衣草灰紫
];

/**
 * 点击粒子特效：点击页面任意位置，在鼠标处绽放彩色粒子（圆点 + 爱心交替）
 * 粒子从中心向四周扩散并淡出，动画结束后自动移除 DOM，性能友好
 */
export function ClickEffect({ enabled = true }: ClickEffectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const spawn = (e: PointerEvent) => {
      // 忽略非鼠标/触摸主键
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const count = 8;
      for (let i = 0; i < count; i++) {
        const el = document.createElement("span");
        const heart = i % 3 === 0; // 每三个出一个爱心
        const size = heart ? 12 + Math.random() * 8 : 6 + Math.random() * 6;
        const color = CLICK_COLORS[Math.floor(Math.random() * CLICK_COLORS.length)];
        el.className = "pointer-events-none absolute";
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.backgroundColor = heart ? "transparent" : color;
        el.style.borderRadius = heart ? "0" : "50%";
        if (heart) {
          // CSS 爱心：旋转 45° 方块 + 两个伪元素圆
          el.style.transform = "rotate(45deg)";
          el.style.background = color;
          const before = document.createElement("i");
          const after = document.createElement("i");
          before.style.cssText = `content:'';position:absolute;width:100%;height:100%;border-radius:50%;background:${color};left:0;top:-50%;`;
          after.style.cssText = `content:'';position:absolute;width:100%;height:100%;border-radius:50%;background:${color};left:-50%;top:0;`;
          el.appendChild(before);
          el.appendChild(after);
        }
        container.appendChild(el);

        const x = e.clientX + (Math.random() - 0.5) * 60;
        const y = e.clientY + (Math.random() - 0.5) * 60;
        el.style.left = `${e.clientX}px`;
        el.style.top = `${e.clientY}px`;

        const particle: Particle = { el, x, y };
        particlesRef.current.push(particle);

        // 用 rAF 触发过渡动画
        requestAnimationFrame(() => {
          el.style.transition =
            "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s ease";
          el.style.transform = `translate(${x - e.clientX}px, ${y - e.clientY}px) rotate(${Math.random() * 180}deg)`;
          el.style.opacity = "0";
        });

        // 动画结束移除
        setTimeout(() => {
          el.remove();
          const idx = particlesRef.current.indexOf(particle);
          if (idx !== -1) particlesRef.current.splice(idx, 1);
        }, 650);
      }
    };

    window.addEventListener("pointerdown", spawn);
    return () => {
      window.removeEventListener("pointerdown", spawn);
      particlesRef.current.forEach((p) => p.el.remove());
      particlesRef.current = [];
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0 z-[80] overflow-hidden"
      aria-hidden
    />
  );
}

/* ==================== 控制台彩蛋 ==================== */

interface DevConsoleProps {
  /** 是否启用（后台可配置） */
  enabled?: boolean;
  /** 站点名 */
  siteName?: string;
}

/**
 * 控制台彩蛋：打开浏览器 DevTools 时输出 ASCII 艺术字 + 版权信息
 * 彩色输出使用 6 种颜色分别对应 ASCII 字的 6 行，模拟彩虹渐变效果
 */
export function DevConsole({ enabled = true, siteName = "" }: DevConsoleProps) {
  useEffect(() => {
    if (!enabled) return;
    const name = siteName || "个人主页";
    const art = String.raw`
 ██████╗ ██████╗ ██╗   ██╗███████╗██╗  ██║
██╔════╝ ██╔══██╗██║   ██║██╔════╝██║  ██║
██║  ███╗██████╔╝██║   ██║█████╗  ███████║
██║   ██║██╔══██╗██║   ██║██╔══╝  ██╔══██║
╚██████╔╝██████╔╝╚██████╔╝███████╗██║  ██║
 ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝
`;
    const lines = art.split("\n");
    // 6 种柔和颜色对应 ASCII 字的 6 行（从上到下）
    const colors = [
      "#c4898e", // 灰玫瑰红
      "#c9b990", // 暖沙色
      "#8aad93", // 橄榄绿
      "#7a9bb5", // 雾霾蓝
      "#9d8bb1", // 淡紫灰
      "#b89f6a", // 暗金色
    ];
    console.log(
      `%c${lines[0]}%c${lines[1]}%c${lines[2]}%c${lines[3]}%c${lines[4]}%c${lines[5]}`,
      ...colors.flatMap((c) => [`color: ${c}; font-weight: bold;`])
    );
    console.log(
      `%c ${name} %c 欢迎访问！`,
      "background:#4d96ff;color:#fff;font-weight:bold;padding:4px 10px;border-radius:4px 0 0 4px;",
      "background:#333;color:#fff;padding:4px 10px;border-radius:0 4px 4px 0;"
    );
    console.log(
      "%c本页面为个人主页项目，未经授权请勿整站抄袭，保留作者信息。",
      "color:#999;font-size:12px;"
    );
  }, [enabled, siteName]);

  return null;
}

/* ==================== 动态页面标题 ==================== */

interface DynamicTitleProps {
  /** 是否启用（后台可配置） */
  enabled?: boolean;
  /** 站点名 */
  siteName?: string;
}

interface TrackDetail {
  name: string;
  artist: string;
}

/**
 * 动态页面标题：
 * - 无音乐播放时：按时间段显示问候语（早上好/下午好/晚上好）+ 站点名
 * - 播放音乐时：显示「♪ 歌名 - 歌手 - 站点名」
 * - 由 MusicPlayer 广播 music-track-change 事件联动
 */
export function DynamicTitle({ enabled = true, siteName = "" }: DynamicTitleProps) {
  useEffect(() => {
    if (!enabled) return;
    const name = siteName || "个人主页";

    const greeting = () => {
      const h = new Date().getHours();
      if (h >= 5 && h < 9) return "早上好";
      if (h >= 9 && h < 12) return "上午好";
      if (h >= 12 && h < 18) return "下午好";
      if (h >= 18 && h < 23) return "晚上好";
      return "夜深了";
    };

    let track: TrackDetail | null = null;
    const applyTitle = () => {
      if (track) {
        document.title = `${track.name} - ${track.artist} - ${name}`;
      } else {
        document.title = `${greeting()}，欢迎访问 ${name}`;
      }
    };

    const onTrack = (e: Event) => {
      const detail = (e as CustomEvent<TrackDetail>).detail;
      if (detail?.name) track = detail;
      else track = null;
      applyTitle();
    };
    const onReset = () => {
      track = null;
      applyTitle();
    };

    applyTitle();
    window.addEventListener("music-track-change", onTrack);
    window.addEventListener("music-player-close", onReset);
    const tick = window.setInterval(applyTitle, 60_000); // 每分钟刷新问候语
    return () => {
      window.removeEventListener("music-track-change", onTrack);
      window.removeEventListener("music-player-close", onReset);
      window.clearInterval(tick);
      document.title = name;
    };
  }, [enabled, siteName]);

  return null;
}

/* ==================== 顶部音乐进度条 ==================== */

interface TopProgressBarProps {
  /** 是否启用（后台可配置） */
  enabled?: boolean;
}

interface ProgressDetail {
  currentTime: number;
  duration: number;
  playing: boolean;
}

/**
 * 顶部音乐进度条（对应 home 项目的 ProgressBar.vue）：
 * - 顶部 2px 细条，按播放进度填充紫色
 * - 鼠标移入底部页脚区域时显示可拖拽手柄，拖动跳转播放进度
 * - 由 MusicPlayer 广播 music-progress 事件联动
 */
export function TopProgressBar({ enabled = true }: TopProgressBarProps) {
  const [pct, setPct] = useState(0);
  const [duration, setDuration] = useState(0);
  const [visible, setVisible] = useState(false);
  const draggingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 监听播放进度事件；音频元素在进度事件中惰性获取（首次触发后缓存，之后复用）
  useEffect(() => {
    if (!enabled) return;
    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent<ProgressDetail>).detail;
      if (!detail) return;
      setDuration(detail.duration || 0);
      if (!draggingRef.current) {
        setPct(detail.duration ? (detail.currentTime / detail.duration) * 100 : 0);
      }
      // 惰性获取：首次收到进度事件时获取 <audio> 引用，后续直接使用缓存
      if (!audioRef.current) {
        audioRef.current = document.getElementById("music-audio") as HTMLAudioElement | null;
      }
    };
    window.addEventListener("music-progress", onProgress);
    return () => window.removeEventListener("music-progress", onProgress);
  }, [enabled]);

  const seekTo = (clientX: number, barRect: DOMRect) => {
    if (!duration) return;
    const ratio = Math.min(1, Math.max(0, (clientX - barRect.left) / barRect.width));
    const time = ratio * duration;
    setPct(ratio * 100);
    if (audioRef.current) audioRef.current.currentTime = time;
    // 广播进度，让播放器同步
    window.dispatchEvent(new CustomEvent("music-seek", { detail: { currentTime: time } }));
  };

  if (!enabled) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[70] h-1 cursor-pointer group" title="音乐播放进度">
      {/* 底层轨道 */}
      <div className="absolute inset-0 bg-white/10" />
      {/* 进度填充 */}
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500"
        style={{ width: `${pct}%` }}
      />
      {/* 进度条区域：鼠标悬停显示手柄，可拖动跳转 */}
      <div
        className="progress-interactive absolute inset-0 group-hover:bg-transparent"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onMouseDown={(e) => {
          draggingRef.current = true;
          const rect = e.currentTarget.getBoundingClientRect();
          seekTo(e.clientX, rect);
        }}
        onMouseMove={(e) => {
          if (draggingRef.current) {
            const rect = e.currentTarget.getBoundingClientRect();
            seekTo(e.clientX, rect);
          }
        }}
        onMouseUp={() => {
          draggingRef.current = false;
        }}
      >
        {visible && duration > 0 && (
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-purple-500 shadow"
            style={{ left: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

/* ==================== 右上角欢迎消息 ==================== */

interface WelcomeNoticeProps {
  /** 是否启用欢迎通知（后台可配置） */
  enabled?: boolean;
  /** 站点昵称，用于替换欢迎语中的 {siteName} 占位符 */
  siteName?: string;
  /** 欢迎语列表（JSON 字符串数组） */
  messages?: string;
  /** 当前生效欢迎语的下标 */
  index?: number;
}

/** 解析浏览器名称（navigator.userAgent，本地获取，参考 home 实现） */
function getBrowserName(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (ua.includes("MicroMessenger")) return "微信内置浏览器";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("QQBrowser")) return "QQ 浏览器";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Safari/")) return "Safari";
  return "";
}

/** 获取访客 IP 归属地（v4.yinghualuo.cn 返回 location，5s 超时，失败静默返回空） */
async function fetchVisitorLocation(): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch("https://v4.yinghualuo.cn/bejson?format=json", {
        signal: controller.signal,
      });
      if (!res.ok) return "";
      const data = (await res.json()) as { location?: string };
      return data.location || "";
    } finally {
      clearTimeout(timer);
    }
  } catch {
    console.warn("[Effects] 访客位置获取失败，无法自动定位天气");
    return "";
  }
}

/**
 * 页面顶部居中欢迎消息通知
 * - 全端统一：固定定位在页面顶部中央（fixed + z-index 高于普通元素）
 * - 宽度自适应内容，最大不超过 80% 视窗宽度，页面滚动时位置保持不变
 * - 每次刷新页面都会展示（点击页面任意位置关闭，也可点 × 关闭，无自动隐藏）
 * - 欢迎语支持 {siteName} 占位符替换为站点昵称
 * - 通知显示时异步补充访客信息：浏览器 + IP 归属地（参考 home 欢迎通知，失败静默降级）
 */
export function WelcomeNotice({
  enabled = true,
  siteName = "",
  messages = "[]",
  index = 0,
}: WelcomeNoticeProps) {
  const [visible, setVisible] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [visitorInfo, setVisitorInfo] = useState("");

  useEffect(() => {
    if (!enabled) return;

    let list: string[] = [];
    try {
      const parsed = JSON.parse(messages);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
    if (list.length === 0) return;

    // 欢迎语越界时回退到最后一句
    const raw = list[Math.min(Math.max(index, 0), list.length - 1)]?.trim();
    if (!raw) return;

    // 等待全屏加载动画完全移除后再显示：
    // 监听 LoadingScreen 广播的 loading-screen-removed 事件（分屏收起动画结束、节点移除后才触发），
    // 避免通知与加载动画重叠；最少等待 600ms，另设 3s 保底防止信号丢失导致通知不显示
    let cancelled = false;
    // 注意：必须用箭头函数包装 tryShow 延迟求值，直接传引用会因 tryShow 仍在 TDZ 抛 ReferenceError
    const minTimer: ReturnType<typeof setTimeout> = setTimeout(() => tryShow(), 600);
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    const show = () => {
      if (cancelled) return;
      setVisible(true);
    };

    const onRemoved = () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      show();
    };

    const tryShow = () => {
      // 加载动画已完全移除（或本未启用）：直接展示
      if (!document.getElementById("loader-wrapper")) {
        show();
        return;
      }
      // 否则等待全屏加载动画完全移除后再展示，避免与分屏收起动画重叠
      window.addEventListener("loading-screen-removed", onRemoved, { once: true });
      fallbackTimer = setTimeout(() => {
        window.removeEventListener("loading-screen-removed", onRemoved);
        show();
      }, 3000);
    };

    return () => {
      cancelled = true;
      if (minTimer) clearTimeout(minTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      window.removeEventListener("loading-screen-removed", onRemoved);
    };
  }, [enabled, messages, index, siteName]);

  // 通知显示后：点击页面任意内容即关闭（不再定时自动隐藏）
  useEffect(() => {
    if (!visible) return;
    const handleClick = () => setVisible(false);
    // 捕获阶段监听，确保页面任意位置的点击都触发关闭
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [visible]);

  // 通知真正显示后再异步补充访客信息（不显示则不发请求）
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const browser = getBrowserName();
      const location = await fetchVisitorLocation();
      if (cancelled) return;
      const parts = [browser, location].filter(Boolean);
      setVisitorInfo(parts.length > 0 ? `来自 ${parts.join(" · ")}` : "");
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!enabled || removed || !visible) return null;

  let text = "";
  try {
    const list = JSON.parse(messages) as string[];
    const raw = list[Math.min(Math.max(index, 0), list.length - 1)] ?? "";
    text = raw.replaceAll("{siteName}", siteName || "本站");
  } catch {
    return null;
  }

  return (
    // fixed 固定定位（滚动不位移）；inset-x-0 + mx-auto + w-fit 水平居中且宽度自适应内容；
    // max-w-[75vw] 限制最大宽度；top-6 避免被浏览器 UI 遮挡；z-[100] 高于普通页面元素
    <div
      className="fixed inset-x-0 top-6 z-[100] mx-auto w-fit max-w-[75vw]"
      role="status"
      aria-live="polite"
    >
      {/* 动画独立一层：避免与上方定位用的 translate 冲突 */}
      <div className="animate-notice-center">
        <div className="relative overflow-hidden rounded-xl border border-white/20 bg-gradient-to-br from-white/20 via-white/12 to-white/8 p-4 shadow-2xl backdrop-blur-xl">
          {/* 遮罩层：半透明黑色底色 + 毛玻璃模糊 */}
          <div className="absolute inset-0 rounded-xl bg-black/25 backdrop-blur-[2px]" />
          {/* 顶部强调色渐变条（颜色随后台强调色，更宽的光晕） */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--accent-color, #7dd3fc) 80%, transparent) 50%, transparent 100%)",
            }}
          />
          <div className="relative flex items-start gap-3">
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{
                backgroundColor: "color-mix(in srgb, var(--accent-color, #7dd3fc) 20%, transparent)",
                color: "var(--accent-color, #7dd3fc)",
              }}
            >
              <BellRing className="h-[18px] w-[18px]" />
            </span>
            <p className="min-w-0 flex-1 break-words text-sm leading-relaxed text-white/90">
              {text}
              {visitorInfo && (
                <span className="mt-1.5 block text-xs text-white/45">
                  {visitorInfo}
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => setRemoved(true)}
              className="-mr-0.5 -mt-0.5 shrink-0 rounded-lg p-1.5 text-white/40 transition-all hover:bg-white/10 hover:text-white/80 active:scale-95"
              aria-label="关闭欢迎消息"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================== Effects 组合组件 ==================== */

interface EffectsProps {
  /** 全屏加载动画开关 */
  loadingScreen?: boolean;
  /** 点击粒子特效开关 */
  clickEffect?: boolean;
  /** 控制台彩蛋开关 */
  consoleEgg?: boolean;
  /** 动态页面标题开关 */
  dynamicTitle?: boolean;
  /** 顶部音乐进度条开关 */
  topProgressBar?: boolean;
  /** 右上角欢迎消息开关 */
  welcomeEnabled?: boolean;
  /** 站点昵称 */
  siteName?: string;
  /** 欢迎语列表（JSON 字符串数组） */
  welcomeMessages?: string;
  /** 当前生效欢迎语下标 */
  welcomeIndex?: number;
}

/**
 * 首页装饰效果集合：一处挂载全部开关控制的页面效果组件。
 * 保持与原先分散挂载一致的渲染顺序。
 */
export default function Effects({
  loadingScreen = true,
  clickEffect = true,
  consoleEgg = true,
  dynamicTitle = true,
  topProgressBar = true,
  welcomeEnabled = true,
  siteName = "",
  welcomeMessages = "[]",
  welcomeIndex = 0,
}: EffectsProps) {
  return (
    <>
      <LoadingScreen enabled={loadingScreen} siteName={siteName} />
      <ClickEffect enabled={clickEffect} />
      <DevConsole enabled={consoleEgg} siteName={siteName} />
      <DynamicTitle enabled={dynamicTitle} siteName={siteName} />
      <TopProgressBar enabled={topProgressBar} />
      <WelcomeNotice
        enabled={welcomeEnabled}
        siteName={siteName}
        messages={welcomeMessages}
        index={welcomeIndex}
      />
    </>
  );
}

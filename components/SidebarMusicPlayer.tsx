"use client";

/**
 * 侧边栏音乐播放器 — 右側浮动面板样式。
 * - 默认收起：右下角圆角控制条（播放/上一曲/下一曲 + 当前歌曲名）
 * - 展开态：右侧全屏高度面板，内联现有 MusicModal 的全部逻辑
 *   （封面、进度条、LRC 歌词、歌单列表、模式切换等）
 *
 * 复用 useMusic Context，与现有 MusicPanel/MusicModal 共享状态。
 */
import { useEffect, useRef, useCallback, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ChevronDown, ChevronUp, Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { type PlayMode } from "@/components/useAudioPlayer";
import { useMusic } from "@/components/MusicPlayer";

export default function SidebarMusicPlayer() {
  const [expanded, setExpanded] = useState(false);
  const [volVisible, setVolVisible] = useState(false);
  const volTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lrcWrapRef = useRef<HTMLDivElement>(null);
  const prevTrackNameRef = useRef("");
  const progressBarRef = useRef<HTMLDivElement>(null);

  /* ─── 解构 useMusic Context（对齐实际返回结构）─── */
  const m = useMusic();
  const {
    isPlaying: playing,
    togglePlay,
    currentTrack,
    playlist: tracks,
    playMode,
    cyclePlayMode,
    volume,
    changeVolume: setVolume,
    muted,
    toggleMuted,
    duration,
    loading,
    selectTrack: changeToTrack,
  } = m;

  /* ─── next/prev 代理（通过当前曲目下标 → selectTrack 实现）─── */
  const changeToNext = useCallback(() => {
    if (tracks.length === 0 || !currentTrack) return;
    const idx = tracks.indexOf(currentTrack);
    const nextTrack = tracks[(idx + 1) % tracks.length];
    changeToTrack(nextTrack);
  }, [tracks, currentTrack, changeToTrack]);

  const changeToPrev = useCallback(() => {
    if (tracks.length === 0 || !currentTrack) return;
    const idx = tracks.indexOf(currentTrack);
    const prevTrack = tracks[idx <= 0 ? tracks.length - 1 : idx - 1];
    changeToTrack(prevTrack);
  }, [tracks, currentTrack, changeToTrack]);

  /* ─── 音量 hover 显隐 ─── */
  const showVolumeControl = useCallback(() => {
    clearTimeout(volTimerRef.current ?? undefined);
    setVolVisible(true);
  }, []);
  const hideVolumeControl = useCallback(() => {
    volTimerRef.current = setTimeout(() => setVolVisible(false), 400);
  }, []);

  /* ─── 键盘事件 ─── */
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.key === "Escape" || e.key === "Esc") && expanded) {
        e.preventDefault();
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [expanded]);

  /* ─── Muting when paused ─── */
  useEffect(() => {
    if (!muted && !playing) (toggleMuted as () => void)();
  }, [playing, muted, toggleMuted]);

  /* ─── LRC 自动居中滚动（复用现有逻辑，使用 Track.lrc）─── */
  const highlightLyric = useCallback((lrc: string): number[] => {
    if (!lrc) return [];
    const lines = lrc.split("\n").map((l) => l.trim());
    const result: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^\[(\d{2,}):(\d{2})(?:\.(\d{2,}))?\]/);
      if (match) {
        const sec = parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + (parseInt(match[3] ?? "", 10) / 1000);
        if (Math.abs(sec - getCurrentTime()) < 0.45) {
          result.push(i);
        }
      }
    }
    return result;
  }, []);

  /** 从 audioEl 实时读取 currentTime（useAudioPlayer 不暴露此值） */
  const getCurrentTime = () => {
    try {
      const el = document.getElementById("music-audio") as HTMLAudioElement | null;
      return el ? el.currentTime : 0;
    } catch {
      return 0;
    }
  };

  // 用 rAF 轮询同步当前播放时间
  const [currentTime, setCurrentTime] = useState(0);
  const frameRef = useRef<number | null>(null);
  useEffect(() => {
    const tick = () => {
      if (playing) setCurrentTime(getCurrentTime());
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [playing]);

  useEffect(() => {
    const highlighted = highlightLyric(currentTrack?.lrc || "");
    if (highlighted.length === 0) return;

    const wrapEl = lrcWrapRef.current;
    if (!wrapEl) return;

    const child = wrapEl.children[highlighted[0]] as HTMLElement | undefined;
    const lineHeight = child?.offsetHeight ?? 44;
    const scrollTop = wrapEl.scrollTop ?? 0;
    const wrappedH = wrapEl.clientHeight ?? 440;
    const targetPos = highlighted[0] * lineHeight;

    if (prevTrackNameRef.current !== currentTrack?.name) {
      wrapEl.scrollTo({ top: targetPos, behavior: "smooth" });
      prevTrackNameRef.current = currentTrack?.name || "";
    } else if (scrollTop > targetPos + lineHeight - wrappedH + 120 || scrollTop < targetPos - 80) {
      wrapEl.scrollTo({ top: targetPos - (wrappedH - lineHeight) / 2, behavior: "auto" });
    }
  }, [currentTime, currentTrack?.name, currentTrack?.lrc, highlightLyric]);

  /* ─── 进度条 mouse/touch 交互 ─── */
  useEffect(() => {
    if (!tracks.length || !progressBarRef.current) return;

    let isDragging = false;
    const bar = progressBarRef.current;

    const updateTime = (clientX: number) => {
      if (!isDragging) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      // 直接设置 audio element currentTime
      try {
        const el = document.getElementById("music-audio") as HTMLAudioElement | null;
        if (el && duration > 0) el.currentTime = pct * duration;
      } catch {}
    };

    const onPointerMove = (e: PointerEvent) => updateTime(e.clientX);
    const onPointerUp = () => {
      isDragging = false;
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };

    bar.addEventListener("pointerdown", (e) => {
      isDragging = true;
      updateTime(e.clientX);
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    });

    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [tracks.length, duration]);

  /* ─── 渲染 ---------- */

  /** 底部悬浮控制条（收起态） */
  function FloatingBar() {
    const visible = tracks.length > 0;
    if (!visible) return null;

    return (
      <div className="fixed inset-x-auto bottom-6 right-6 z-40 md:hidden">
        <button
          onClick={() => setExpanded(true)}
          className={cn(
            "flex items-center gap-3 rounded-2xl border border-white/10 px-3 py-2 text-xs transition-all shadow-lg backdrop-blur-md",
            playing ? "bg-black/80 text-white" : "bg-gray-500/80 text-white/70 hover:bg-gray-500/90"
          )}
          aria-label="打开音乐播放器"
        >
          {loading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
          ) : playing ? (
            <Music className="h-4 w-4 animate-pulse text-emerald-400" />
          ) : (
            <Music className="h-4 w-4" />
          )}
          <span className="hidden sm:inline truncate max-w-[140px]">{currentTrack?.name}</span>
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  /** 桌面端固定控制条（底部中央） */
  function DesktopBar() {
    const visible = tracks.length > 0;
    if (!visible || typeof window === "undefined" || window.innerWidth < 768) return null;

    return (
      <div className="fixed inset-x-auto bottom-8 left-1/2 z-40 -translate-x-1/2 hidden md:flex">
        <div className={cn(
          "group flex items-center gap-4 rounded-2xl border border-white/10 px-5 py-3 text-xs transition-all shadow-lg backdrop-blur-md",
          playing ? "bg-black/80 text-white" : "bg-gray-500/80 text-white/70 hover:bg-gray-500/90"
        )}>
          <button onClick={changeToPrev} disabled={!tracks.length} className="text-white/70 hover:text-white disabled:opacity-30">
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            onClick={togglePlay}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
              playing ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-400" : "border-white/30 bg-white/10 text-white/80 hover:text-white"
            )}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button onClick={changeToNext} disabled={!tracks.length} className="text-white/70 hover:text-white disabled:opacity-30">
            <SkipForward className="h-4 w-4" />
          </button>
          <span className="max-w-[200px] truncate font-medium">{currentTrack?.name}</span>
          <button onClick={() => setExpanded(true)} className="ml-2 text-white/50 hover:text-white">
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  /** 展开态：右侧全屏面板 */
  function ExpandedPanel() {
    if (!expanded || !currentTrack) return null;

    return (
      <div className="pointer-events-none fixed inset-0 z-50 flex justify-end">
        {/* 遮罩层 */}
        <div className="pointer-events-auto absolute inset-0 bg-black/30" onClick={() => setExpanded(false)} />

        <div className="pointer-events-auto relative flex w-full max-w-md shrink-0 flex-col border-l bg-card/95 shadow-2xl backdrop-blur-xl sm:rounded-l-3xl">
          {/* ── 顶部栏 ── */}
          <div className="relative z-10 flex shrink-0 items-center justify-between border-b px-5 py-3.5">
            <div>
              <h3 className="font-semibold tracking-tight">正在播放</h3>
              <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-[220px]">{currentTrack.name}</p>
            </div>
            <button className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setExpanded(false)}>
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>

          {/* ── 主内容区 ── */}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* 专辑封面 + 控件 */}
            <div className="flex flex-col items-center justify-center gap-6 overflow-y-auto px-6 pb-4 pt-6">
              <div className="relative h-48 w-48 shrink-0 overflow-hidden rounded-2xl bg-muted shadow-lg shadow-black/20">
                <img src={currentTrack.cover || "/images/default-cover.png"} alt={currentTrack.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                {playing && (
                  <div className="absolute inset-0 flex items-end justify-center pb-4">
                    <div className="flex gap-1">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-4 w-1 animate-pulse rounded-full bg-white/60" style={{ animationDelay: `${i * 200}ms`, height: `${12 + Math.random() * 8}px` }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-6">
                <button onClick={changeToPrev} disabled={!tracks.length} className="rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30">
                  <SkipBack className="h-5 w-5" />
                </button>
                <button onClick={togglePlay} className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95",
                  playing ? "bg-primary text-primary-foreground" : "bg-primary/80 text-primary-foreground/80 hover:bg-primary"
                )}>
                  {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
                </button>
                <button onClick={changeToNext} disabled={!tracks.length} className="rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30">
                  <SkipForward className="h-5 w-5" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">{getPlayModeName(playMode)}</span>
                <button onClick={() => cyclePlayMode()} className="rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary" title="切换播放模式">
                  <Play className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* 进度条 */}
            <div className="px-6 py-4">
              <div className="space-y-1">
                <div className="relative h-1.5 cursor-pointer rounded-full bg-muted" ref={progressBarRef}>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }} />
                </div>
                <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
                  <span>{formatDuration(currentTime)}</span>
                  <span>{formatDuration(duration)}</span>
                </div>
              </div>
            </div>

            {/* LRC 歌词 */}
            <div className="flex-1 overflow-hidden">
              <div className="overflow-y-auto px-6 pb-8 pt-2" ref={lrcWrapRef} style={{ maxHeight: "calc(50vh - 180px)" }}>
                <div className="space-y-2">
                  {(currentTrack.lrc || "").split("\n").map((line: string, idx: number) => {
                    const timeMatch = line.match(/^\[(\d{2,}):(\d{2})(?:\.(\d{2,}))?\]/);
                    if (!timeMatch) {
                      const hl = highlightLyric(line);
                      return (
                        <p key={idx} className={`py-1 text-sm transition-colors ${hl.length > 0 ? "text-foreground font-medium" : "text-muted-foreground/60"}`}>
                          {line.trim()}
                        </p>
                      );
                    }
                    const sec = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10) + (parseInt(timeMatch[3] ?? "", 10) / 1000);
                    if (duration > 0 && sec > duration) return null;
                    return <p key={idx} className="invisible" />;
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── 底部栏 ── */}
          <div className="relative z-10 shrink-0 border-t px-5 py-3.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">🎵 {tracks.length} 首歌曲</span>
              <div className="flex items-center gap-2" onMouseEnter={showVolumeControl} onMouseLeave={hideVolumeControl}>
                <button onClick={() => toggleMuted()} className="text-muted-foreground hover:text-foreground">
                  {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                {volVisible && (
                  <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="h-1.5 w-20 accent-primary" aria-label="音量" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <FloatingBar />
      <DesktopBar />
      <ExpandedPanel />
    </>
  );
}

/* ─── 工具函数 ---------- */
const formatDuration = (sec: number): string => {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const getPlayModeName = (mode: PlayMode): string => {
  const map: Record<PlayMode, string> = { order: "顺序播放", loop: "列表循环", single: "单曲循环", shuffle: "随机播放" };
  return map[mode];
};

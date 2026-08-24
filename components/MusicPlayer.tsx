"use client";

import { memo, useCallback, createContext, useContext, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Music2,
  X,
  Repeat,
  Repeat1,
  Shuffle,
  ListMusic,
  type LucideIcon,
} from "lucide-react";
import {
  useAudioPlayer,
  formatTime,
  type Track,
  type UseAudioPlayerProps,
  type PlayMode,
} from "@/components/useAudioPlayer";
import Hitokoto from "@/components/Hitokoto";

// 播放模式元信息（图标 + 提示文案）
const PLAY_MODE_META: Record<PlayMode, { label: string; Icon: LucideIcon }> = {
  loop: { label: "列表循环", Icon: Repeat },
  single: { label: "单曲循环", Icon: Repeat1 },
  shuffle: { label: "随机播放", Icon: Shuffle },
  order: { label: "顺序播放", Icon: ListMusic },
};

/* ==================== 播放器上下文 ==================== */

interface MusicContextValue {
  // 播放核心（来自 useAudioPlayer）
  isPlaying: boolean;
  togglePlay: () => void;
  currentTrack: Track | null;
  playlist: Track[];
  playMode: PlayMode;
  cyclePlayMode: () => void;
  volume: number;
  changeVolume: (v: number) => void;
  muted: boolean;
  toggleMuted: () => void;
  duration: number;
  loading: boolean;
  error: string;
  playNext: () => void;
  playPrev: () => void;
  selectTrack: (t: Track) => void;
  audioEl: HTMLAudioElement | null;
  // UI 状态（对齐 home：musicOpenState 控制面板 / musicBoxOpenState 列表弹窗）
  panelOpen: boolean;
  setPanelOpen: (b: boolean) => void;
  boxOpen: boolean;
  setBoxOpen: (b: boolean) => void;
}

const MusicContext = createContext<MusicContextValue | null>(null);

export function useMusic(): MusicContextValue {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useMusic 必须在 MusicProvider 内使用");
  return ctx;
}

/* ===== 播放进度条（独立监听 audio，不随父组件高频重渲染） ===== */
function ProgressBar({
  audioEl,
  duration,
  loading,
}: {
  audioEl: HTMLAudioElement | null;
  duration: number;
  loading: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    const audio = audioEl;
    if (!audio) return;
    const update = () => {
      if (!draggingRef.current) setProgress(audio.currentTime);
    };
    const reset = () => setProgress(0);
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("loadedmetadata", reset);
    return () => {
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("loadedmetadata", reset);
    };
  }, [audioEl]);

  const pct = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0;
  const fill = `linear-gradient(to right, #a855f7 0%, #ec4899 ${pct}%, rgba(255,255,255,0.15) ${pct}%, rgba(255,255,255,0.15) 100%)`;

  return (
    <div className="flex flex-1 items-center gap-2">
      <span className="min-w-[36px] text-sm text-white/80 md:min-w-[40px] md:text-base">
        {formatTime(progress)}
      </span>
      <input
        type="range"
        id="music-progress"
        min={0}
        max={duration || 0}
        step={0.1}
        value={progress}
        disabled={!duration}
        onPointerDown={() => {
          draggingRef.current = true;
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onInput={(e) => {
          const v = Number(e.currentTarget.value);
          setProgress(v);
          if (audioEl) audioEl.currentTime = v;
        }}
        style={{ background: fill }}
        className="music-range h-1 flex-1 cursor-pointer rounded-full"
        aria-label="播放进度"
      />
      <span className="min-w-[36px] text-sm text-white/80 md:min-w-[40px] md:text-base">
        {formatTime(duration)}
      </span>
      {loading && <span className="text-sm text-white/70 md:text-base">加载中...</span>}
    </div>
  );
}

/* ===== 音量控制（桌面显示滑条） ===== */
function VolumeControl({
  volume,
  muted,
  onChange,
  onToggleMuted,
}: {
  volume: number;
  muted: boolean;
  onChange: (v: number) => void;
  onToggleMuted: () => void;
}) {
  const pct = muted ? 0 : volume * 100;
  const fill = `linear-gradient(to right, #a855f7 0%, #ec4899 ${pct}%, rgba(255,255,255,0.15) ${pct}%, rgba(255,255,255,0.15) 100%)`;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onToggleMuted}
        className="p-1.5 text-white/70 hover:text-white md:p-2"
        title={muted ? "取消静音" : "静音"}
        aria-label={muted ? "取消静音" : "静音"}
      >
        {muted || volume === 0 ? (
          <VolumeX className="h-4 w-4 md:h-5 md:w-5" />
        ) : (
          <Volume2 className="h-4 w-4 md:h-5 md:w-5" />
        )}
      </button>
      <input
        type="range"
        id="music-volume"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: fill }}
        className="music-range hidden h-1 w-20 cursor-pointer rounded-full md:block"
        aria-label="音量"
      />
    </div>
  );
}

/* ===== 播放列表（memo：仅当歌单或当前曲目变化时重渲染） ===== */
const Playlist = memo(function Playlist({
  playlist,
  currentId,
  onSelect,
}: {
  playlist: Track[];
  currentId: string | undefined;
  onSelect: (t: Track) => void;
}) {
  return (
    <div className="music-scrollbar mx-auto mt-4 max-h-44 w-full overflow-y-auto">
      <div className="space-y-1">
        {playlist.map((track, index) => {
          const active = currentId === track.id;
          return (
            <button
              key={track.id}
              onClick={() => onSelect(track)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/15 ${
                active ? "bg-gradient-to-r from-purple-500/25 to-pink-500/20" : ""
              }`}
            >
              <span className="flex w-6 shrink-0 items-center justify-center text-sm text-white/60">
                {active ? <Music2 className="h-4 w-4 animate-pulse text-pink-400" /> : index + 1}
              </span>
              <span className={`min-w-0 flex-1 truncate text-base font-medium ${active ? "text-white" : "text-white/90"}`}>{track.name}</span>
              <span className={`max-w-[140px] truncate text-sm ${active ? "text-pink-200/90" : "text-white/70"}`}>{track.artist}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

/* ===== 歌词面板（参考 home 逐行歌词：当前行高亮并自动居中） ===== */
interface LyricLine {
  time: number;
  text: string;
}

/** 解析 LRC 歌词文本 → 带时间戳的行数组 */
function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const timeRegex = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const line of lrc.split(/\r?\n/)) {
    const tags = line.match(timeRegex);
    if (!tags) continue;
    const text = line.replace(timeRegex, "").trim();
    for (const tag of tags) {
      const parts = tag.slice(1, -1).split(":");
      const minutes = parseInt(parts[0], 10);
      const seconds = parseFloat(parts[1]);
      if (!Number.isNaN(minutes) && !Number.isNaN(seconds)) {
        lines.push({ time: minutes * 60 + seconds, text: text || "♪" });
      }
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

/**
 * 歌词：lrc 可为纯文本（含 [mm:ss] 标签）或歌词文件 URL；
 * 监听 audio 播放进度，高亮当前行并自动滚动居中（无歌词时不渲染）。
 */
function Lyrics({ audioEl, lrc }: { audioEl: HTMLAudioElement | null; lrc?: string }) {
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [current, setCurrent] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // 加载 / 解析歌词（URL 则先 fetch，支持取消防止内存泄漏）
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const raw = lrc || "";
    if (!raw) {
      setLines([]);
      return;
    }
    (async () => {
      try {
        let lrcText = raw;
        if (/^https?:\/\//i.test(raw)) {
          const text = await (await fetch(raw, { signal: controller.signal })).text();
          // NeteaseCloudMusicApi /lyric 返回 {lrc:{lyric:"..."}} JSON；纯 LRC 接口返回文本
          try {
            const json = JSON.parse(text) as { lrc?: { lyric?: string } };
            lrcText = typeof json?.lrc?.lyric === "string" ? json.lrc.lyric : text;
          } catch {
            lrcText = text;
          }
        }
        if (!cancelled) setLines(parseLrc(lrcText));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (!cancelled) setLines([]);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [lrc]);

  // 按播放进度更新当前行
  useEffect(() => {
    const audio = audioEl;
    if (!audio || lines.length === 0) return;
    const update = () => {
      const t = audio.currentTime;
      let idx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (t >= lines[i].time) idx = i;
        else break;
      }
      setCurrent(idx);
    };
    audio.addEventListener("timeupdate", update);
    return () => audio.removeEventListener("timeupdate", update);
  }, [audioEl, lines]);

  // 当前行自动居中滚动（仅滚动歌词容器本身，避免 scrollIntoView 带动整个页面滚动）
  useEffect(() => {
    const container = listRef.current;
    const active = container?.querySelector<HTMLElement>("[data-active='true']");
    if (!container || !active) return;
    const top = active.offsetTop - container.clientHeight / 2 + active.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [current]);

  if (lines.length === 0) return null;

  return (
    <div className="mx-auto mt-3 w-full">
      <div ref={listRef} className="music-scrollbar max-h-36 overflow-y-auto text-center">
        {lines.map((line, i) => (
          <div
            key={i}
            data-active={i === current}
            className={`px-2 py-1 text-sm leading-relaxed transition-all duration-300 ${
              i === current
                ? "scale-105 font-semibold text-white drop-shadow-[0_0_8px_rgba(236,72,153,0.6)]"
                : i < current
                  ? "text-white/45"
                  : "text-white/65"
            }`}
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================== 控制面板（对齐 home Music.vue） ==================== */
/**
 * 内嵌卡片控制面板：
 * - 顶部：音乐列表（开列表弹窗）/ 回到一言
 * - 中部：上一曲 / 播放暂停 / 下一曲
 * - 底部：歌名-歌手，鼠标悬停切换为音量滑杆
 */
function MusicPanel() {
  const m = useMusic();
  const [volumeShow, setVolumeShow] = useState(false);

  return (
    <div
      className="card-glass card-func flex h-full w-full flex-col justify-between p-4"
      onMouseEnter={() => setVolumeShow(true)}
      onMouseLeave={() => setVolumeShow(false)}
    >
      {/* 顶部：音乐列表 / 回到一言 */}
      <div className="flex items-center justify-between text-xs">
        <button
          onClick={() => m.setBoxOpen(true)}
          className="rounded-md bg-white/10 px-2.5 py-1 text-white/80 transition-colors hover:bg-white/20"
        >
          音乐列表
        </button>
        <button
          onClick={() => m.setPanelOpen(false)}
          className="rounded-md bg-white/10 px-2.5 py-1 text-white/80 transition-colors hover:bg-white/20"
        >
          回到一言
        </button>
      </div>

      {/* 中部：控制按钮 */}
      <div className="flex items-center justify-evenly">
        <button
          onClick={m.playPrev}
          disabled={!m.playlist.length}
          className="p-2 text-white/70 transition-colors hover:text-white disabled:opacity-40"
          title="上一首"
          aria-label="上一首"
        >
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          onClick={m.togglePlay}
          disabled={!m.playlist.length}
          className="rounded-full bg-white/20 p-3 transition-colors hover:bg-white/30 disabled:opacity-40"
          title={m.isPlaying ? "暂停" : "播放"}
          aria-label={m.isPlaying ? "暂停" : "播放"}
        >
          {m.isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
        </button>
        <button
          onClick={m.playNext}
          disabled={!m.playlist.length}
          className="p-2 text-white/70 transition-colors hover:text-white disabled:opacity-40"
          title="下一首"
          aria-label="下一首"
        >
          <SkipForward className="h-5 w-5" />
        </button>
      </div>

      {/* 底部：歌名 / 音量（hover 切换） */}
      {volumeShow ? (
        <div className="flex items-center justify-center">
          <VolumeControl volume={m.volume} muted={m.muted} onChange={m.changeVolume} onToggleMuted={m.toggleMuted} />
        </div>
      ) : (
        <div className="truncate text-center text-sm text-white/90 font-medium">
          {m.currentTrack ? `${m.currentTrack.name} - ${m.currentTrack.artist}` : "选择一首歌曲"}
        </div>
      )}
    </div>
  );
}

/* ==================== 全屏播放列表弹窗（对齐 home .music-list） ==================== */
/** 居中弹窗：封面 + 控制 + 进度 + 音量 + 歌词 + 播放列表 */
function MusicModal() {
  const m = useMusic();
  const close = () => {
    m.setBoxOpen(false);
    // 未播放时广播关闭事件，让动态标题复位
    if (!m.isPlaying) window.dispatchEvent(new Event("music-player-close"));
  };
  const ModeIcon = PLAY_MODE_META[m.playMode].Icon;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="音乐列表"
    >
      <div
        className="music-scrollbar relative flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-y-auto rounded-xl border border-white/15 bg-[#0f0f1a] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭 */}
        <button
          onClick={close}
          aria-label="关闭音乐列表"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {/* 错误提示 */}
        {m.error && (
          <div className="mb-3 rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-300">{m.error}</div>
        )}

        {/* 封面 + 当前歌曲 */}
        <div className="flex items-center gap-3 pr-10">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/15">
            {m.currentTrack?.cover ? (
              <Image
                src={m.currentTrack.cover}
                alt={m.currentTrack.name}
                width={48}
                height={48}
                unoptimized
                className="h-full w-full object-cover"
              />
            ) : (
              <Music2 className="h-6 w-6 text-white/60" />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-white">{m.currentTrack?.name || "选择一首歌曲"}</div>
            <div className="truncate text-sm text-white/75">{m.currentTrack?.artist || "—"}</div>
          </div>
        </div>

        {/* 播放控制 + 播放模式 + 音量 */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={m.playPrev}
              disabled={!m.playlist.length}
              className="p-1.5 text-white/70 transition-colors hover:text-white disabled:opacity-40"
              title="上一首"
              aria-label="上一首"
            >
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              onClick={m.togglePlay}
              disabled={!m.playlist.length}
              className="rounded-full bg-white/20 p-2.5 transition-colors hover:bg-white/30 disabled:opacity-40"
              title={m.isPlaying ? "暂停" : "播放"}
              aria-label={m.isPlaying ? "暂停" : "播放"}
            >
              {m.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <button
              onClick={m.playNext}
              disabled={!m.playlist.length}
              className="p-1.5 text-white/70 transition-colors hover:text-white disabled:opacity-40"
              title="下一首"
              aria-label="下一首"
            >
              <SkipForward className="h-5 w-5" />
            </button>
            <button
              onClick={m.cyclePlayMode}
              className="p-1.5 text-white/70 transition-colors hover:text-white"
              title={`当前：${PLAY_MODE_META[m.playMode].label}（点击切换）`}
              aria-label={`播放模式：${PLAY_MODE_META[m.playMode].label}`}
            >
              <ModeIcon className="h-5 w-5" />
            </button>
          </div>
          <VolumeControl volume={m.volume} muted={m.muted} onChange={m.changeVolume} onToggleMuted={m.toggleMuted} />
        </div>

        {/* 进度条 */}
        <div className="mt-3">
          <ProgressBar audioEl={m.audioEl} duration={m.duration} loading={m.loading} />
        </div>

        {/* 歌词 */}
        <Lyrics audioEl={m.audioEl} lrc={m.currentTrack?.lrc} />

        {/* 播放列表 */}
        {m.playlist.length > 0 && (
          <Playlist playlist={m.playlist} currentId={m.currentTrack?.id} onSelect={m.selectTrack} />
        )}
      </div>
    </div>
  );
}

/* ==================== 功能卡：音乐控制面板 / 一言 切换（对齐 home） ==================== */
/** 挂载于右侧功能卡组左格：控制面板开启时显示 MusicPanel，否则显示一言（hover 可打开音乐） */
export function MusicCard({ hitokotoType = "" }: { hitokotoType?: string }) {
  const m = useMusic();
  return m.panelOpen ? (
    <MusicPanel />
  ) : (
    <Hitokoto type={hitokotoType} onOpenMusic={() => m.setPanelOpen(true)} />
  );
}

/* ==================== Provider（页面根部挂载，包住全站内容） ==================== */
export default function MusicProvider({
  children,
  ...props
}: UseAudioPlayerProps & { children: React.ReactNode }) {
  const {
    isPlaying,
    setIsPlaying,
    togglePlay,
    currentTrack,
    playlist,
    playMode,
    cyclePlayMode,
    volume,
    changeVolume,
    muted,
    toggleMuted,
    duration,
    loading,
    error,
    playNext,
    playPrev,
    selectTrack,
    audioEl,
    setAudioEl,
  } = useAudioPlayer(props);

  const [panelOpen, setPanelOpen] = useState(false);
  const [boxOpen, setBoxOpen] = useState(false);

  // 音频元素 ref 回调（稳定引用，避免每次渲染重绑）
  const audioRefCallback = useCallback((el: HTMLAudioElement | null) => setAudioEl(el), [setAudioEl]);

  // 键盘快捷键（对齐 home：Space 播放暂停 / PageUp 上一曲 / PageDown 下一曲）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      switch (e.code) {
        case "Space":
          e.preventDefault(); // 阻止页面默认滚动
          if (playlist.length) togglePlay();
          break;
        case "PageUp":
          e.preventDefault();
          playPrev();
          break;
        case "PageDown":
          e.preventDefault();
          playNext();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playlist.length, togglePlay, playPrev, playNext]);

  // 外部「音乐」链接（SiteLinks）触发：打开列表弹窗（对齐 home Links.vue）
  useEffect(() => {
    const handleToggle = () => setBoxOpen(true);
    window.addEventListener("toggle-music-player", handleToggle);
    return () => window.removeEventListener("toggle-music-player", handleToggle);
  }, []);

  // Media Session：更新系统媒体元数据（锁屏/系统 UI 显示歌名与封面）
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrack) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.name,
      artist: currentTrack.artist,
      artwork: currentTrack.cover ? [{ src: currentTrack.cover, sizes: "512x512", type: "image/jpeg" }] : undefined,
    });
  }, [currentTrack]);

  // Media Session：系统媒体控制（耳机/锁屏按键）
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", togglePlay);
    ms.setActionHandler("pause", togglePlay);
    ms.setActionHandler("nexttrack", playNext);
    ms.setActionHandler("previoustrack", playPrev);
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("nexttrack", null);
      ms.setActionHandler("previoustrack", null);
    };
  }, [togglePlay, playNext, playPrev]);

  const value: MusicContextValue = {
    isPlaying,
    togglePlay,
    currentTrack,
    playlist,
    playMode,
    cyclePlayMode,
    volume,
    changeVolume,
    muted,
    toggleMuted,
    duration,
    loading,
    error,
    playNext,
    playPrev,
    selectTrack,
    audioEl,
    panelOpen,
    setPanelOpen,
    boxOpen,
    setBoxOpen,
  };

  return (
    <MusicContext.Provider value={value}>
      {/* 音频元素常驻挂载：收起面板/弹窗时音乐不中断 */}
      <audio
        id="music-audio"
        ref={audioRefCallback}
        src={currentTrack?.url}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      {boxOpen && <MusicModal />}
      {children}
    </MusicContext.Provider>
  );
}

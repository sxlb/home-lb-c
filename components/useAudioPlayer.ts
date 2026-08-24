import { useCallback, useEffect, useRef, useState } from "react";

/* ==================== 播放模式与下一首计算 ==================== */

/** 播放模式：order 顺序（播完停止）/ loop 列表循环 / single 单曲循环 / shuffle 随机 */
export type PlayMode = "order" | "loop" | "single" | "shuffle";

/**
 * 根据播放模式计算下一首曲目的下标（纯函数，便于单元测试）
 * @param mode 播放模式
 * @param playlistLength 歌单长度（≤0 视为无歌单）
 * @param currentIndex 当前曲目下标（-1 表示未播放或找不到）
 * @returns 下一首下标；-1 表示播放结束（仅顺序模式最后一首）
 */
export function getNextTrackIndex(
  mode: PlayMode,
  playlistLength: number,
  currentIndex: number
): number {
  if (playlistLength <= 0) return -1;
  // 未播放或下标越界：从第一首开始
  if (currentIndex < 0 || currentIndex >= playlistLength) return 0;

  switch (mode) {
    case "single":
      // 单曲循环：停留在当前曲目
      return currentIndex;
    case "shuffle": {
      // 随机选一首，歌单多于一首时避免与当前重复
      if (playlistLength === 1) return currentIndex;
      let next = currentIndex;
      while (next === currentIndex) {
        next = Math.floor(Math.random() * playlistLength);
      }
      return next;
    }
    case "loop":
      // 列表循环：顺序播放，最后一首回到第一首
      return (currentIndex + 1) % playlistLength;
    case "order":
    default:
      // 顺序播放：最后一首播放结束
      return currentIndex + 1 >= playlistLength ? -1 : currentIndex + 1;
  }
}

/* ==================== 音频播放器核心逻辑 ==================== */

export interface Track {
  id: string;
  name: string;
  artist: string;
  url: string;
  cover?: string;
  /** 歌词：纯文本（含 [mm:ss] 时间标签）或歌词文件 URL */
  lrc?: string;
}

// 第三方歌单原始字段（name/title、artist/author、url、cover/pic、lrc）
interface RawTrack {
  id?: number | string;
  name?: string;
  title?: string;
  artist?: string;
  author?: string;
  url?: string;
  cover?: string;
  pic?: string;
  lrc?: string;
}

// 音量 / 静音本地持久化键
const VOLUME_KEY = "music-player-volume";
const MUTED_KEY = "music-player-muted";

/** 播放模式循环顺序 */
export const PLAY_MODES: PlayMode[] = ["loop", "single", "shuffle", "order"];

/** 归一化第三方歌单字段为播放器 Track */
export function normalizeTracks(raw: RawTrack[], offset: number): Track[] {
  return raw.map((v, i) => ({
    id: String(v.id ?? offset + i),
    name: v.name || v.title || "未知歌曲",
    artist: v.artist || v.author || "未知歌手",
    url: v.url || "",
    cover: v.cover || v.pic || "",
    lrc: v.lrc || "",
  }));
}

/** 格式化播放时长：秒 → m:ss */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export interface UseAudioPlayerProps {
  /** 歌单 API 地址（三种方案任选其一）：
   *  1. NeteaseMiniPlayer v3 / NeteaseCloudMusicApi 基地址（自动走 track/all + song/url/v1）
   *  2. meting 类歌单接口（如 api.injahow.cn/meting，返回数组）
   *  3. home 项目 api（同 meting 格式的歌单接口）
   */
  songApi?: string;
  /** 歌单平台（netease / tencent，随歌单接口参数传递） */
  songServer?: string;
  /** 歌单 ID */
  songId?: string;
}

/**
 * 音频播放器核心逻辑（状态机）
 * - 播放列表加载：歌单数据源三种方案（NeteaseMiniPlayer v3 / meting / home 项目 api），
 *   songApi 填对应地址，经 /api/music 拉取后归一化为播放列表
 * - 播放模式：顺序 / 列表循环 / 单曲循环 / 随机
 * - 错误处理：音频加载失败自动切歌，连续失败超过阈值后停止并提示
 * - 音量 / 静音本地持久化
 * - 事件契约：广播 music-progress / music-track-change / music-player-close，
 *   监听 toggle-music-player
 */
export function useAudioPlayer({
  songApi = "",
  songServer = "netease",
  songId = "",
}: UseAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [playMode, setPlayMode] = useState<PlayMode>("loop");
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 音频元素挂载状态（由 UI 中的 <audio> ref 回调同步）
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  audioElRef.current = audioEl;

  // 连续加载失败计数（自动切歌防死循环）
  const errorCountRef = useRef(0);

  // 保持最新 state 的 ref：音频事件只绑定一次，回调内读取最新值
  const stateRef = useRef({ playlist, currentTrack, playMode });
  stateRef.current = { playlist, currentTrack, playMode };

  // ===== 播放列表加载 =====
  const loadPlaylistRef = useRef<AbortController | null>(null);

  const loadPlaylist = useCallback(async () => {
    // 歌单数据源（songApi 填对应地址，三种方案）：
    //  1. NeteaseMiniPlayer v3 / NeteaseCloudMusicApi 基地址
    //  2. meting 类歌单接口（返回数组）
    //  3. home 项目 api（同 meting 格式）
    // 未配置歌单参数：空列表（无内置示例兜底）
    if (!songApi.trim() || !songId.trim()) {
      setPlaylist([]);
      return;
    }
    // 取消上一次未完成的请求，防止竞态
    loadPlaylistRef.current?.abort();
    const controller = new AbortController();
    loadPlaylistRef.current = controller;
    try {
      const res = await fetch(
        `/api/music?api=${encodeURIComponent(songApi.trim())}&server=${songServer}&type=playlist&id=${encodeURIComponent(songId)}`,
        { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) }
      );
      if (res.ok) {
        const data: unknown = await res.json();
        // /api/music 返回归一化后的 Track[]；meting/home 源返回原始数组，再做一次字段归一化
        if (Array.isArray(data)) {
          setPlaylist(normalizeTracks(data as RawTrack[], 0));
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // 请求被取消，正常忽略
      if (process.env.NODE_ENV === "development") console.error("[MusicPlayer] 加载播放列表失败:", e);
    }
  }, [songApi, songServer, songId]);

  useEffect(() => {
    loadPlaylist();
    return () => loadPlaylistRef.current?.abort();
  }, [loadPlaylist]);

  // ===== 音量 / 静音持久化 =====
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(VOLUME_KEY));
      if (Number.isFinite(v) && v >= 0 && v <= 1) setVolume(v);
      setMuted(localStorage.getItem(MUTED_KEY) === "1");
    } catch {
      /* 隐私模式等场景忽略 */
    }
  }, []);

  const changeVolume = useCallback((v: number) => {
    setVolume(v);
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      /* 忽略 */
    }
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      try {
        localStorage.setItem(MUTED_KEY, prev ? "0" : "1");
      } catch {
        /* 忽略 */
      }
      return !prev;
    });
  }, []);

  // ===== 音频事件处理（事件只绑定一次，逻辑通过 stateRef 读取最新值） =====
  const handlersRef = useRef({
    onEnded: () => {},
    onError: () => {},
  });

  handlersRef.current.onEnded = () => {
    const { playlist: list, currentTrack: track, playMode: mode } = stateRef.current;
    const idx = list.findIndex((t) => t.id === track?.id);
    const next = getNextTrackIndex(mode, list.length, idx);
    errorCountRef.current = 0;
    if (next === -1) {
      // 顺序模式播完最后一首：停止
      setIsPlaying(false);
      return;
    }
    if (next === idx) {
      // 单曲循环：从头重播
      const audio = audioElRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }
    setCurrentTrack(list[next]);
  };

  handlersRef.current.onError = () => {
    const { playlist: list, currentTrack: track } = stateRef.current;
    errorCountRef.current += 1;
    // 同一首歌连续失败超过阈值（最多 3 次或歌单长度）则停止，避免死循环
    const maxTries = Math.max(1, Math.min(3, list.length));
    if (list.length === 0 || errorCountRef.current >= maxTries) {
      setIsPlaying(false);
      setLoading(false);
      setError("音频加载失败，已停止播放");
      errorCountRef.current = 0;
      return;
    }
    setError("音频加载失败，自动切换下一首");
    const idx = list.findIndex((t) => t.id === track?.id);
    const next = getNextTrackIndex("order", list.length, idx);
    if (next === -1) {
      setIsPlaying(false);
      setLoading(false);
    } else {
      setCurrentTrack(list[next]);
    }
  };

  useEffect(() => {
    const audio = audioEl;
    if (!audio) return;

    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setLoading(false);
    };
    const onEnded = () => handlersRef.current.onEnded();
    const onWaiting = () => setLoading(true);
    const onPlaying = () => {
      setLoading(false);
      errorCountRef.current = 0;
    };
    const onError = () => handlersRef.current.onError();

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("error", onError);
    };
  }, [audioEl]);

  // ===== 播放 / 暂停 / 切歌 =====
  useEffect(() => {
    const audio = audioEl;
    if (!audio || !currentTrack) return;
    if (isPlaying) {
      audio.play().catch(() => {
        // 自动播放可能被浏览器阻止（如切歌时）
        if (process.env.NODE_ENV === "development") console.warn("[MusicPlayer] 自动播放被阻止");
      });
    } else {
      audio.pause();
    }
  }, [audioEl, isPlaying, currentTrack]);

  // 切换曲目：src 变化后浏览器自动开始加载，无需显式 load()
  // （显式 load() 会中断播放 effect 中已发起的 play()，导致切歌/首次播放无声）
  // 这里仅复位时长/错误状态
  useEffect(() => {
    if (!audioEl || !currentTrack) return;
    setDuration(0);
    setLoading(true);
    setError("");
    errorCountRef.current = 0;
  }, [audioEl, currentTrack]);

  // 音量应用
  useEffect(() => {
    const audio = audioEl;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [audioEl, volume, muted]);

  // ===== 播放列表 / 曲目操作 =====
  const playNext = useCallback(() => {
    const { playlist: list, currentTrack: track } = stateRef.current;
    if (!list.length) return;
    const idx = list.findIndex((t) => t.id === track?.id);
    const next = idx === -1 ? 0 : (idx + 1) % list.length;
    errorCountRef.current = 0;
    setCurrentTrack(list[next]);
  }, []);

  const playPrev = useCallback(() => {
    const { playlist: list, currentTrack: track } = stateRef.current;
    if (!list.length) return;
    const idx = list.findIndex((t) => t.id === track?.id);
    const prev = idx === -1 ? 0 : (idx - 1 + list.length) % list.length;
    errorCountRef.current = 0;
    setCurrentTrack(list[prev]);
  }, []);

  const togglePlay = useCallback(() => {
    const { playlist: list, currentTrack: track } = stateRef.current;
    if (!track && list.length > 0) {
      // 首次播放：设置当前歌曲，由播放 effect 触发
      setCurrentTrack(list[0]);
      setIsPlaying(true);
      return;
    }
    const audio = audioElRef.current;
    if (audio) {
      if (isPlaying) audio.pause();
      else audio.play().catch(() => {});
    }
  }, [isPlaying]);

  const selectTrack = useCallback((track: Track) => {
    errorCountRef.current = 0;
    setCurrentTrack(track);
    setIsPlaying(true);
  }, []);

  // ===== 播放模式 =====
  const cyclePlayMode = useCallback(() => {
    setPlayMode((prev) => {
      const idx = PLAY_MODES.indexOf(prev);
      return PLAY_MODES[(idx + 1) % PLAY_MODES.length];
    });
  }, []);

  // ===== 事件契约 =====
  // 面板/弹窗开关已上移到组件层（MusicProvider），这里仅保留：
  // - 播放进度广播（供顶部进度条联动）
  // - 曲目变化广播（供动态标题联动）
  // - 播放停止时广播 music-player-close（让动态标题复位）

  // 广播播放进度（节流 500ms，供顶部进度条联动；收起播放器后仍持续广播）
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      const audio = audioElRef.current;
      if (!audio) return;
      window.dispatchEvent(
        new CustomEvent("music-progress", {
          detail: { currentTime: audio.currentTime, duration, playing: true },
        })
      );
    }, 500);
    return () => window.clearInterval(timer);
  }, [isPlaying, duration]);

  // 广播曲目变化（供动态标题联动）
  useEffect(() => {
    if (!currentTrack) return;
    window.dispatchEvent(
      new CustomEvent("music-track-change", {
        detail: { name: currentTrack.name, artist: currentTrack.artist },
      })
    );
  }, [currentTrack]);

  // 错误提示自动消失
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 3500);
    return () => window.clearTimeout(timer);
  }, [error]);

  return {
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
  };
}

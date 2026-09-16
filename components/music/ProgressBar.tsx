"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/components/useAudioPlayer";

export function ProgressBar({ audioEl, duration, loading }: {
  audioEl: HTMLAudioElement | null;
  duration: number;
  loading: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!audioEl) return;
    const update = () => { if (!dragging) setProgress(audioEl.currentTime); };
    const reset = () => setProgress(0);
    audioEl.addEventListener("timeupdate", update);
    audioEl.addEventListener("loadedmetadata", reset);
    return () => {
      audioEl.removeEventListener("timeupdate", update);
      audioEl.removeEventListener("loadedmetadata", reset);
    };
  }, [audioEl, dragging]);

  const value = duration > 0 ? Math.min(duration, Math.max(0, progress)) : 0;
  const percent = duration > 0 ? (value / duration) * 100 : 0;
  return (
    <div className="music-progress flex flex-1 items-center gap-2">
      <span className="music-time">{formatTime(value)}</span>
      <input
        type="range" min={0} max={duration || 0} step={0.1} value={value} disabled={!duration}
        onPointerDown={() => setDragging(true)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          setProgress(next);
          if (audioEl) audioEl.currentTime = next;
        }}
        style={{ background: `linear-gradient(to right, var(--nc-red) 0%, var(--nc-red-soft-strong) ${percent}%, var(--nc-track) ${percent}%, var(--nc-track) 100%)` }}
        className="music-range h-1 flex-1 cursor-pointer rounded-full"
        aria-label="播放进度"
      />
      <span className="music-time">{formatTime(duration)}</span>
      {loading && <span className="text-xs text-white/60">加载中...</span>}
    </div>
  );
}

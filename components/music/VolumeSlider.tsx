"use client";

import { Volume2, VolumeX } from "lucide-react";

/**
 * 音量滑杆：
 * - 轨道：半透明底色 + 红色填充（用 inline style 动态更新 linear-gradient 百分比）
 * - Tooltip：固定在轨道**下方**（避免 MusicPanel 容器 overflow-hidden 截断），hover 时显示
 * - 静音按钮：当前 `muted` 或 `volume === 0` 时显示 VolumeX
 */
export function VolumeSlider({ volume, muted, onChange, onToggleMuted }: {
  volume: number;
  muted: boolean;
  onChange: (value: number) => void;
  onToggleMuted: () => void;
}) {
  const value = muted ? 0 : volume;
  const percent = Math.round(value * 100);
  return (
    <div className="music-volume flex items-center gap-2">
      <button
        onClick={onToggleMuted}
        className="flex h-6 w-6 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        aria-label={muted ? "取消静音" : "静音"}
      >
        {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <div className="relative flex items-center">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="music-volume-range w-24"
          style={{
            background: `linear-gradient(to right, var(--nc-red) ${percent}%, var(--nc-track) ${percent}%)`,
          }}
          aria-label={`音量 ${percent}%`}
        />
        <span className="music-volume-tooltip">{percent}%</span>
      </div>
    </div>
  );
}

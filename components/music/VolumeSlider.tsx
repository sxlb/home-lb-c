"use client";

import { Volume2, VolumeX } from "lucide-react";

export function VolumeSlider({ volume, muted, onChange, onToggleMuted }: {
  volume: number;
  muted: boolean;
  onChange: (value: number) => void;
  onToggleMuted: () => void;
}) {
  const value = muted ? 0 : volume;
  return (
    <div className="music-volume flex items-center gap-2">
      <button onClick={onToggleMuted} className="p-1.5 text-white/70 hover:text-white" aria-label={muted ? "取消静音" : "静音"}>
        {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <div className="relative flex items-center">
        <input
          type="range" min={0} max={1} step={0.01} value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="music-volume-range w-20"
          aria-label={`音量 ${Math.round(value * 100)}%`}
        />
        <span className="music-volume-tooltip">{Math.round(value * 100)}%</span>
      </div>
    </div>
  );
}

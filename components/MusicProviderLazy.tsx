"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// 音乐播放器动态导入：首屏不必加载完整播放器代码，客户端渲染时才加载。
const MusicProvider = dynamic(
  () => import("./MusicPlayer").then((m) => m.default),
  { loading: () => null }
);

const MusicCard = dynamic(
  () => import("./MusicPlayer").then((m) => m.MusicCard),
  {
    ssr: false,
    loading: () => (
      <div className="card-glass card-func h-[150px] w-full animate-pulse" />
    ),
  }
);

interface MusicProviderWrapperProps {
  songApi: string;
  songServer: string;
  songId: string;
  children: ReactNode;
}

/** 获取后端配置的播放器样式（默认内嵌卡片） */
function getMusicPlayerMode(profile?: Record<string, unknown>): string {
  return (profile?.musicPlayerMode as string) || "card";
}

// 客户端包装器：允许在 Server Component 中使用 ssr: false 的动态导入
export function MusicProviderLazy({ songApi, songServer, songId, profile, children }: MusicProviderWrapperProps & { profile?: Record<string, unknown> }) {
  const musicPlayerMode = getMusicPlayerMode(profile);
  return (
    <MusicProvider songApi={songApi} songServer={songServer} songId={songId} musicPlayerMode={musicPlayerMode}>
      {children}
    </MusicProvider>
  );
}

export { MusicCard as MusicCardLazy };

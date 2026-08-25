"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// 音乐播放器动态导入：首屏不必加载完整播放器代码，客户端渲染时才加载。
// 注意：此处不能设 ssr:false —— MusicProvider 包裹整个 <main> 页面主体，
// 一旦 ssr:false，服务端渲染时整个页面内容都会被排除（仅剩 BAILOUT 标记），
// 导致 SEO 空内容、无 JS 白屏、壁纸 preload 失效。useAudioPlayer 无渲染期浏览器
// API 访问（window/localStorage 均在 effect 内），服务端渲染是安全的。
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

// 客户端包装器：允许在 Server Component 中使用 ssr: false 的动态导入
export function MusicProviderLazy({ songApi, songServer, songId, children }: MusicProviderWrapperProps) {
  return (
    <MusicProvider songApi={songApi} songServer={songServer} songId={songId}>
      {children}
    </MusicProvider>
  );
}

export { MusicCard as MusicCardLazy };

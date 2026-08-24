"use client";

import { useEffect } from "react";

/**
 * 后台配置的网站图标（favicon / Logo）动态注入浏览器标签页。
 * siteIcon 为空时不覆盖默认图标（app/favicon.ico）。
 * 同时更新 apple-touch-icon，保证 iOS 添加到主屏时使用同一图标。
 */
export default function FaviconUpdater({ icon }: { icon?: string }) {
  useEffect(() => {
    if (!icon) return;

    // 常规标签页图标（含 legacy shortcut icon）
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = icon;

    // iOS 主屏图标
    let apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!apple) {
      apple = document.createElement("link");
      apple.rel = "apple-touch-icon";
      document.head.appendChild(apple);
    }
    apple.href = icon;
  }, [icon]);

  return null;
}

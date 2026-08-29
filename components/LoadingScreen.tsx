"use client";

import { useEffect, useState } from "react";

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
 *   2. 页面 window load 完成 或 宽松就绪（800ms + 2s 等待，弱网下壁纸未就绪也收口）
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

    // 宽松就绪兜底：最短展示 800ms + 2s 等待（2800ms 时点）后，壁纸未就绪也收起
    // 避免弱网下背景源慢导致加载动画长时间遮挡首屏（LCP 优化）
    const relaxedTimer = setTimeout(() => {
      if (!mounted || hideTimer) return;
      if (document.readyState === "complete" && !bgReady) hide();
    }, 2800);

    // 背景就绪（bgReady 变化触发本 effect 重跑）后立即复查
    if (bgReady && document.readyState === "complete") hide();

    // 安全兜底：最长 5s 无论背景是否就绪都收起
    const safety = setTimeout(hide, 5000);

    return () => {
      mounted = false;
      if (minTimer) clearTimeout(minTimer);
      if (relaxedTimer) clearTimeout(relaxedTimer);
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

"use client";

import { useEffect } from "react";

/** 昵称艺术字体样式表（8 个分片字体，按需加载字形） */
const ART_FONT_STYLES = [
  "/fonts/cn-fontsource-yozai-medium/font.css",
  "/fonts/cn-fontsource-lxgw-wen-kai-screen/font.css",
  "/fonts/cn-fontsource-alimama-dong-fang-da-kai-regular/font.css",
  "/fonts/cn-fontsource-ding-talk-jin-bu-ti-regular/font.css",
  "/fonts/cn-fontsource-hongleixingshu-regular/font.css",
  "/fonts/cn-fontsource-xiaolai-sc-regular/font.css",
  "/fonts/cn-fontsource-slidefu-regular/font.css",
  "/fonts/cn-fontsource-slideqiuhong-regular/font.css",
];

/**
 * 延迟加载分片艺术字体样式表。
 * 这些 font.css 体积大（每条含数百条 @font-face 规则），若在 <head> 中同步引入会阻塞首屏渲染；
 * 改为页面挂载后异步注入，让首帧（加载动画 + 页面骨架）立即显示，字体在动画期间后台就绪。
 * 注入的样式表参与 window.load 等待，加载动画收起时字体已可用，避免回退字体闪烁。
 */
export default function ArtFontsLoader() {
  useEffect(() => {
    let mounted = true;
    // 串行注入，避免一次性占用过多连接导致首屏其他资源排队
    let index = 0;

    const injectNext = () => {
      if (!mounted || index >= ART_FONT_STYLES.length) return;
      const href = ART_FONT_STYLES[index++];
      const id = `art-font-${index}`;
      if (document.getElementById(id)) {
        injectNext();
        return;
      }
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = href;
      link.onload = injectNext;
      link.onerror = injectNext;
      document.head.appendChild(link);
    };

    injectNext();

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";

interface Props {
  enabled: boolean;
  family: string;
  scope: string;
}

/**
 * 自定义字体应用组件（范围=全站时生效）。
 * 直接注入 body 的 font-family，缺失字形自动回退思源黑体；
 * 范围=昵称时无需本组件，由页面昵称元素的 logoFontFamily 内联样式处理。
 */
export default function CustomFont({ enabled, family, scope }: Props) {
  useEffect(() => {
    const clean = family.trim();
    if (!enabled || !clean || scope !== "all") return;
    document.body.style.fontFamily = `"${clean}", var(--font-noto-sc), var(--font-inter), sans-serif`;
  }, [enabled, family, scope]);

  return null;
}

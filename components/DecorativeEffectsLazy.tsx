"use client";

import dynamic from "next/dynamic";

// 装饰特效动态导入：非首屏必需（LoadingScreen 收起后才生效），ssr:false 使其首屏不下载，
// 后台全部关闭时此 chunk 零加载。放在客户端包装器中：Server Component 内不允许直接使用 ssr:false。
const Effects = dynamic(() => import("./DecorativeEffects"), {
  ssr: false,
  loading: () => null,
});

interface EffectsProps {
  clickEffect?: boolean;
  consoleEgg?: boolean;
  dynamicTitle?: boolean;
  topProgressBar?: boolean;
  welcomeEnabled?: boolean;
  siteName?: string;
  welcomeMessages?: string;
  welcomeIndex?: number;
}

/** 客户端包装器：允许在 Server Component 中引用 ssr:false 的装饰特效动态导入 */
export default function DecorativeEffectsLazy(props: EffectsProps) {
  return <Effects {...props} />;
}

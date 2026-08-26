import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";

import { Toaster } from "@/components/ui/sonner";
import ArtFontsLoader from "@/components/ArtFontsLoader";

// 全站字体：中文思源黑体 + 西文 Inter 兜底
const notoSc = localFont({ src: [{ path: "../public/fonts/google-local/font-noto-sc.woff2", weight: "400", style: "normal" }], variable: "--font-noto-sc", display: "swap" });
const inter = localFont({ src: [{ path: "../public/fonts/google-local/font-inter.woff2", weight: "400", style: "normal" }], variable: "--font-inter", display: "swap" });
const techMono = localFont({ src: [{ path: "../public/fonts/google-local/font-tech-mono.woff2", weight: "400", style: "normal" }], variable: "--font-tech-mono", display: "swap" });

// ===== 昵称艺术字体（后台 logoFont 下拉选择，共 19 种，全部中英双语） =====
// 一、Google 中文字体（含英文）8 种
const maShanZheng = localFont({ src: [{ path: "../public/fonts/google-local/font-ma-shan.woff2", weight: "400", style: "normal" }], variable: "--font-ma-shan", display: "swap" });
const zcoolKuaiLe = localFont({ src: [{ path: "../public/fonts/google-local/font-zcool.woff2", weight: "400", style: "normal" }], variable: "--font-zcool", display: "swap" });
const longCang = localFont({ src: [{ path: "../public/fonts/google-local/font-long-cang.woff2", weight: "400", style: "normal" }], variable: "--font-long-cang", display: "swap" });
const zcoolXiaoWei = localFont({ src: [{ path: "../public/fonts/google-local/font-zcool-xw.woff2", weight: "400", style: "normal" }], variable: "--font-zcool-xw", display: "swap" });
const zcoolQingKe = localFont({ src: [{ path: "../public/fonts/google-local/font-zcool-qk.woff2", weight: "400", style: "normal" }], variable: "--font-zcool-qk", display: "swap" });
const liuJianMaoCao = localFont({ src: [{ path: "../public/fonts/google-local/font-liu-jian.woff2", weight: "400", style: "normal" }], variable: "--font-liu-jian", display: "swap" });
const zhiMangXing = localFont({ src: [{ path: "../public/fonts/google-local/font-zhi-mang.woff2", weight: "400", style: "normal" }], variable: "--font-zhi-mang", display: "swap" });
const notoSerifSc = localFont({ src: [{ path: "../public/fonts/google-local/font-noto-serif-sc.woff2", weight: "400", style: "normal" }], variable: "--font-noto-serif-sc", display: "swap" });

// ===== 可爱 + 字数多 + 中英：有爱圆体(中文) + Baloo 2(西文) =====
const nowarRounded = localFont({
  src: [
    { path: "../public/fonts/nowar-rounded/NowarRounded-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/nowar-rounded/NowarRounded-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-nowar",
  display: "swap",
});
const baloo2 = localFont({ src: [{ path: "../public/fonts/nowar-rounded/Baloo2-Variable.woff2", weight: "400", style: "normal" }], variable: "--font-baloo", display: "swap" });

export const metadata: Metadata = {
  title: "个人主页",
  description: "极简个人主页",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 十款本地中文字体（得意黑/猫啃什锦黑 + 八款分片字体），全部中英双语。
            得意黑/猫啃什锦黑由 globals.css 的 @font-face 定义（体积小）；
            八款分片字体由 ArtFontsLoader 挂载后异步注入，避免阻塞首屏渲染 */}
      </head>
      <body
        className={`${notoSc.variable} ${inter.variable} ${techMono.variable} ${maShanZheng.variable} ${zcoolKuaiLe.variable} ${longCang.variable} ${zcoolXiaoWei.variable} ${zcoolQingKe.variable} ${liuJianMaoCao.variable} ${zhiMangXing.variable} ${notoSerifSc.variable} ${baloo2.variable} ${nowarRounded.variable}`}
        style={{ fontFamily: "var(--font-noto-sc), var(--font-inter), system-ui, sans-serif" }}
      >
        {/* 主页不依赖 session，SessionProvider 仅在 /admin 布局中使用，避免多余请求 */}
        {children}
        {/* 异步加载分片艺术字体，不阻塞首屏渲染 */}
        <ArtFontsLoader />
        <Toaster />
      </body>
    </html>
  );
}
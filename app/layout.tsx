import type { Metadata } from "next";
import "./globals.css";
import {
  Inter,
  Noto_Sans_SC,
  Noto_Serif_SC,
  Share_Tech_Mono,
  Ma_Shan_Zheng,
  ZCOOL_KuaiLe,
  Long_Cang,
  ZCOOL_XiaoWei,
  ZCOOL_QingKe_HuangYou,
  Liu_Jian_Mao_Cao,
  Zhi_Mang_Xing,
} from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import ArtFontsLoader from "@/components/ArtFontsLoader";

// 全站字体：中文思源黑体 + 西文 Inter 兜底
const notoSc = Noto_Sans_SC({ subsets: ["latin"], variable: "--font-noto-sc", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const techMono = Share_Tech_Mono({ weight: "400", subsets: ["latin"], variable: "--font-tech-mono", display: "swap" });

// ===== 昵称艺术字体（后台 logoFont 下拉选择，共 18 种，全部中英双语） =====
// 一、Google 中文字体（含英文）8 种
const maShanZheng = Ma_Shan_Zheng({ weight: "400", subsets: ["latin"], variable: "--font-ma-shan", display: "swap" });
const zcoolKuaiLe = ZCOOL_KuaiLe({ weight: "400", subsets: ["latin"], variable: "--font-zcool", display: "swap" });
const longCang = Long_Cang({ weight: "400", subsets: ["latin"], variable: "--font-long-cang", display: "swap" });
const zcoolXiaoWei = ZCOOL_XiaoWei({ weight: "400", subsets: ["latin"], variable: "--font-zcool-xw", display: "swap" });
const zcoolQingKe = ZCOOL_QingKe_HuangYou({ weight: "400", subsets: ["latin"], variable: "--font-zcool-qk", display: "swap" });
const liuJianMaoCao = Liu_Jian_Mao_Cao({ weight: "400", subsets: ["latin"], variable: "--font-liu-jian", display: "swap" });
const zhiMangXing = Zhi_Mang_Xing({ weight: "400", subsets: ["latin"], variable: "--font-zhi-mang", display: "swap" });
const notoSerifSc = Noto_Serif_SC({ weight: "600", subsets: ["latin"], variable: "--font-noto-serif-sc", display: "swap" });

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
        className={`${inter.className} ${notoSc.variable} ${techMono.variable} ${maShanZheng.variable} ${zcoolKuaiLe.variable} ${longCang.variable} ${zcoolXiaoWei.variable} ${zcoolQingKe.variable} ${liuJianMaoCao.variable} ${zhiMangXing.variable} ${notoSerifSc.variable}`}
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

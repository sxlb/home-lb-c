"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Github,
  Mail,
  Twitter,
  Send,
  Globe,
  Youtube,
  MessageCircle,
  Link2,
  type LucideIcon,
} from "lucide-react";
import { useIconfontSymbols } from "./Iconfont";
import { resolveLucideIcon, isLucideIcon } from "./lucideIconResolver";

const ICON_MAP: Record<string, LucideIcon> = {
  github: Github,
  mail: Mail,
  email: Mail,
  twitter: Twitter,
  send: Send,
  telegram: Send,
  globe: Globe,
  website: Globe,
  youtube: Youtube,
  "message-circle": MessageCircle,
  qq: MessageCircle,
  bilibili: MessageCircle,
  link: Link2,
  default: Globe,
};

interface SocialLink {
  id: number;
  name: string;
  icon: string;
  url: string;
  tip: string;
  sort: number;
}

interface SocialLinksProps {
  initialLinks?: SocialLink[];
}

/** 图标查找函数 memo 化，避免每次 render 重新创建 */
const resolveIcon = (iconName: string): LucideIcon => {
  // 优先处理 lucide: 前缀的图标
  if (isLucideIcon(iconName)) {
    const LucideIconComp = resolveLucideIcon(iconName);
    if (LucideIconComp) return LucideIconComp;
  }
  const key = iconName.toLowerCase().replace(/[^a-z]/g, "");
  return ICON_MAP[key] || ICON_MAP[iconName] || ICON_MAP.default;
};

/**
 * 社交链接容器：纯图标横排（对齐 home .social 布局）
 * - 默认透明背景，hover 时显示毛玻璃效果
 * - 每个图标悬停放大 + title 提示（替代 tooltip）
 * - PC 端 hover 时右侧显示 tip 文字
 * - 高度固定 42px，border-radius 6px，响应式 ≤840px 居中
 */
export default function SocialLinks({ initialLinks }: SocialLinksProps) {
  const [links, setLinks] = useState<SocialLink[]>(initialLinks ?? []);
  const [tip, setTip] = useState("通过这里联系我吧");
  // 已注册的 iconfont symbol（阿里云矢量图标库），供图标优先渲染
  const iconfontSymbols = useIconfontSymbols();

  // 仅在未提供 SSR 初始数据时，客户端拉取
  useEffect(() => {
    if (initialLinks && initialLinks.length > 0) return;
    fetch("/api/social-links", { signal: AbortSignal.timeout(8000) })
      .then((r) => r.ok ? r.json() : [])
      .then(setLinks)
      .catch((e) => { if (process.env.NODE_ENV === "development") console.error("[SocialLinks]", e); });
  }, [initialLinks]);

  const sortedLinks = useMemo(
    () => [...links].sort((a, b) => a.sort - b.sort),
    [links],
  );

  if (sortedLinks.length === 0) return null;

  return (
    <div className="social-links-bar">
      <div className="social-link-row flex items-center">
        {sortedLinks.map((link) => {
          const IconComponent = resolveIcon(link.icon);
          // 图标渲染优先级：iconfont symbol → lucide
          const useIconfont = iconfontSymbols.includes(link.icon);
          return (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="social-icon"
              onMouseEnter={() => setTip(link.tip)}
              onMouseLeave={() => setTip("通过这里联系我吧")}
              title={link.tip || link.name}
              aria-label={link.tip || link.name}
            >
              {/* 24px 图标，margin 0 12px（对齐 home .icon margin） */}
              <span style={{ margin: "0 12px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {useIconfont ? (
                  <svg className="h-[24px] w-[24px]" aria-hidden="true" focusable="false">
                    <use href={`#${link.icon}`} />
                  </svg>
                ) : (
                  <IconComponent className="h-[24px] w-[24px]" />
                )}
              </span>
            </a>
          );
        })}
      </div>
      {/* tip 显示区域（PC hover 时显示） */}
      <span className="social-tip">{tip}</span>
    </div>
  );
}

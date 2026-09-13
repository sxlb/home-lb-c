"use client";

/**
 * 统一媒体选择器（后台用）
 * - 支持 iconfont 图标库选择
 * - 支持 lucide 图标库选择
 * - 支持手动输入网络图片 URL
 * - 支持关键词随机图（loremflickr，无需 API Key）
 * - 支持 Openverse API 搜索（Creative Commons 开放版权图片）
 * - 值格式：
 *   - iconfont 图标：纯名称（如 "github"）
 *   - lucide 图标："lucide:图标名"（如 "lucide:github"）
 *   - 网络图片：http(s)://... URL
 *   - 随机图："random:关键词"（如 "random:nature"；旧写法 "unsplash:关键词" 仍兼容识别）
 *
 * 注：本组件刻意使用原生 <img> 而非 next/image —— 预览对象是管理员即时输入/第三方搜索返回的
 * 任意外部 URL，走 next/image 需要远程域名白名单且会把不可信图片经优化器代理，故不使用。
 */
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Link, Sparkles, Search, Loader2 } from "lucide-react";
import IconfontPicker from "./IconfontPicker";
import LucideIconPicker, { LUCIDE_PREFIX, extractLucideIconName } from "./LucideIconPicker";
import { resolveLucideIcon } from "@/components/lucideIconResolver";
import { useIconfontSymbols } from "@/components/Iconfont";
import {
  RANDOM_PREFIX,
  extractRandomKeyword,
  getRandomImageUrl,
  isRandomImageValue,
} from "@/lib/iconValue";

interface Props {
  /** 当前值（图标名 / lucide:xxx / http(s) URL / random:关键词） */
  value: string;
  /** 值变更回调 */
  onChange: (value: string) => void;
  /** 占位提示 */
  placeholder?: string;
  /** 标签 */
  label?: string;
  /** 输入框 id（供 <Label htmlFor> 关联，提升可访问性） */
  id?: string;
}

/** Openverse API 返回的图片结果 */
interface OpenverseImage {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  creator?: string;
  license: string;
  license_version?: string;
}

/** 预览组件：根据值类型渲染对应图标/图片 */
function MediaPreview({ value, className = "h-10 w-10" }: { value: string; className?: string }) {
  const iconfontSymbols = useIconfontSymbols();

  if (!value) return null;

  // 随机图（random: / 旧 unsplash:）
  if (isRandomImageValue(value)) {
    const keyword = extractRandomKeyword(value);
    return (
      <img
        src={getRandomImageUrl(keyword, 80, 80)}
        alt={keyword}
        className={`${className} rounded object-cover`}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
    );
  }

  // 网络图片 URL
  if (/^https?:\/\//i.test(value)) {
    return (
      <img
        src={value}
        alt=""
        className={`${className} rounded object-cover`}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
    );
  }

  // lucide 图标
  if (value.startsWith(LUCIDE_PREFIX)) {
    const name = extractLucideIconName(value);
    const IconComp = resolveLucideIcon(name);
    if (IconComp) {
      return <IconComp className={`${className} text-muted-foreground`} />;
    }
    return null;
  }

  // iconfont 图标
  if (iconfontSymbols.includes(value)) {
    return (
      <svg className={`${className} text-muted-foreground`} aria-hidden="true" focusable="false">
        <use href={`#${value}`} />
      </svg>
    );
  }

  return null;
}

export default function MediaPicker({
  value,
  onChange,
  placeholder = "输入或选择图标/图片",
  label,
  id,
}: Props) {
  const [tab, setTab] = useState<"url" | "iconfont" | "lucide" | "random" | "openverse">(() => {
    if (isRandomImageValue(value)) return "random";
    if (/^https?:\/\//i.test(value)) return "url";
    if (value.startsWith(LUCIDE_PREFIX)) return "lucide";
    return "iconfont";
  });
  const [randomKeyword, setRandomKeyword] = useState(() => extractRandomKeyword(value));

  // Openverse 搜索状态
  const [openverseQuery, setOpenverseQuery] = useState("");
  const [openverseResults, setOpenverseResults] = useState<OpenverseImage[]>([]);
  const [openverseLoading, setOpenverseLoading] = useState(false);

  const handleRandomKeywordChange = (kw: string) => {
    setRandomKeyword(kw);
    if (kw.trim()) {
      onChange(`${RANDOM_PREFIX}${kw.trim()}`);
    }
  };

  /** 拉取 Openverse 结果（返回解析后的列表，失败返回空数组） */
  const fetchOpenverse = async (query: string, pageSize: number): Promise<OpenverseImage[]> => {
    const res = await fetch(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${pageSize}&filter_dead=true`
    );
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    return ((data.results || []) as Array<{
      id: string;
      title: string;
      url: string;
      thumbnail?: string;
      creator?: string;
      license: string;
      license_version?: string;
    }>).map((item) => ({
      id: item.id,
      title: item.title || "Untitled",
      url: item.url,
      thumbnail: item.thumbnail || item.url,
      creator: item.creator,
      license: item.license,
      license_version: item.license_version,
    }));
  };

  // Openverse 搜索（展示缩略图网格供挑选）
  const handleOpenverseSearch = async () => {
    const q = openverseQuery.trim();
    if (!q) return;
    setOpenverseLoading(true);
    try {
      setOpenverseResults(await fetchOpenverse(q, 12));
    } catch {
      setOpenverseResults([]);
    } finally {
      setOpenverseLoading(false);
    }
  };

  // 随机一张：取一批结果后任选其一，保存为稳定的图片直链（避免依赖会失效的随机图服务）
  const handleRandomPick = async () => {
    const q = openverseQuery.trim();
    if (!q) return;
    setOpenverseLoading(true);
    try {
      const results = await fetchOpenverse(q, 20);
      if (results.length > 0) {
        const picked = results[Math.floor(Math.random() * results.length)];
        onChange(picked.url);
        setOpenverseResults(results);
        setTab("url");
      } else {
        setOpenverseResults([]);
      }
    } catch {
      setOpenverseResults([]);
    } finally {
      setOpenverseLoading(false);
    }
  };

  return (
    <div className="min-w-0 space-y-2">
      {label && <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</label>}

      {/* 预览 + 手动输入（min-w-0 允许在窄列/移动端收缩，避免撑破父容器） */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/30">
          <MediaPreview value={value} />
        </div>
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (isRandomImageValue(e.target.value)) {
              setRandomKeyword(extractRandomKeyword(e.target.value));
            }
          }}
          placeholder={placeholder}
          className="h-9 min-w-0 flex-1 text-sm"
        />
      </div>

      {/* Tab 选择器：窄容器下自动换行（按钮 min-w-max 保证文字不被截断） */}
      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1">
        {(["url", "iconfont", "lucide", "random", "openverse"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex min-w-max flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-xs transition-colors ${
              tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "url" && <Link className="h-3 w-3 shrink-0" />}
            {t === "iconfont" && <Sparkles className="h-3 w-3 shrink-0" />}
            {t === "lucide" && <ImageIcon className="h-3 w-3 shrink-0" />}
            {t === "random" && <Sparkles className="h-3 w-3 shrink-0" />}
            {t === "openverse" && <Search className="h-3 w-3 shrink-0" />}
            {t === "url" ? "URL" : t === "iconfont" ? "图标库" : t === "lucide" ? "Lucide" : t === "random" ? "随机图" : "Openverse"}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="min-h-[60px] min-w-0">
        {tab === "url" && (
          <p className="text-xs text-muted-foreground">
            直接在上方输入框粘贴图片 URL（支持 http/https）
          </p>
        )}
        {tab === "iconfont" && (
          <IconfontPicker
            value={value.startsWith(LUCIDE_PREFIX) || /^https?:\/\//i.test(value) || isRandomImageValue(value) ? "" : value}
            onChange={(name) => {
              onChange(name);
              setTab("iconfont");
            }}
          />
        )}
        {tab === "lucide" && (
          <LucideIconPicker
            value={value.startsWith(LUCIDE_PREFIX) ? value : ""}
            onChange={(v: string) => {
              onChange(v);
              setTab("lucide");
            }}
          />
        )}
        {tab === "random" && (
          <div className="space-y-2">
            <Input
              value={randomKeyword}
              onChange={(e) => handleRandomKeywordChange(e.target.value)}
              placeholder="输入关键词（如 nature、city、tech）"
              className="h-8 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              按关键词从 Flickr 随机取图（loremflickr，无需 Key），每次打开页面可能显示不同图片。
              如需可控版权的图片，请改用「Openverse」搜索并保存直链。
            </p>
          </div>
        )}
        {tab === "openverse" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                value={openverseQuery}
                onChange={(e) => setOpenverseQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleOpenverseSearch()}
                placeholder="搜索开放版权图片（如 sunset、mountain）"
                className="h-8 min-w-0 flex-1 text-sm"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleOpenverseSearch}
                disabled={openverseLoading}
                className="h-8 shrink-0 gap-1"
              >
                {openverseLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                搜索
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRandomPick}
                disabled={openverseLoading}
                className="h-8 shrink-0 gap-1"
                title="按关键词随机挑一张开放版权图片"
              >
                {openverseLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                随机一张
              </Button>
            </div>
            {openverseResults.length > 0 && (
              <div className="grid max-h-[300px] grid-cols-3 gap-2 overflow-y-auto rounded-lg border bg-muted/20 p-2 sm:grid-cols-4">
                {openverseResults.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => {
                      onChange(img.url);
                      setOpenverseResults([]);
                      setTab("url");
                    }}
                    className="group relative aspect-square overflow-hidden rounded-md border bg-background transition-all hover:border-primary hover:shadow-sm"
                    title={`${img.title}\n作者: ${img.creator || "未知"}\n许可证: ${img.license}`}
                  >
                    <img
                      src={img.thumbnail}
                      alt={img.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <p className="truncate text-[10px] text-white">{img.license.toUpperCase()}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Creative Commons 旗下聚合，数据源含 Flickr、Wikimedia、博物馆等。点击选择后直接使用图片直链。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

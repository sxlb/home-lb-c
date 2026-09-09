"use client";

import { useEffect } from "react";

/** 阅读页加载时递增一次阅读量（不渲染任何可视内容，仅发计数请求） */
export function ArticleViewCounter({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/articles/${encodeURIComponent(slug)}/views`, { method: "POST" }).catch(() => {});
  }, [slug]);

  return null;
}
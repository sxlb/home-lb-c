"use client";

import { useEffect, useState } from "react";
import { Megaphone, Pin, X } from "lucide-react";

interface Announcement {
  id: number;
  title: string;
  content: string;
  pinned: boolean;
}

const DISMISS_KEY = "home-lb-announcement-dismissed";

/** 前台公告条：展示所有当前有效的公告（置顶优先），支持逐条关闭（记住已读） */
export default function AnnouncementBar() {
  const [items, setItems] = useState<Announcement[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcements/public", { cache: "no-store", signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Announcement[]) => {
        if (cancelled) return;
        let dismissed: number[] = [];
        try {
          dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]") as number[];
        } catch {
          dismissed = [];
        }
        setItems(list.filter((a) => !dismissed.includes(a.id)));
      })
      .catch(() => { /* 公告加载失败不影响页面 */ });
    return () => { cancelled = true; };
  }, []);

  if (items.length === 0) return null;

  function dismiss(id: number) {
    setItems((prev) => prev.filter((a) => a.id !== id));
    let dismissed: number[] = [];
    try {
      dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]") as number[];
    } catch {
      dismissed = [];
    }
    if (!dismissed.includes(id)) dismissed.push(id);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed));
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-2.5">
      {items.map((a) => (
        <div
          key={a.id}
          className="card-glass flex w-full items-start gap-3 rounded-2xl px-4 py-3"
        >
          <div className="mt-0.5 flex shrink-0 items-center justify-center">
            <Megaphone className="h-4 w-4 text-white/60" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-white/90">{a.title}</span>
              {a.pinned && <Pin className="h-3 w-3 shrink-0 text-amber-300/90" />}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/65">
              {a.content}
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭公告"
            onClick={() => dismiss(a.id)}
            className="shrink-0 rounded-full p-1 text-white/40 transition hover:bg-white/10 hover:text-white/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
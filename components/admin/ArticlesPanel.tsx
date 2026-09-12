"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Loader2, FileText, FilePen, Pin, Eye, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { PanelHeader, EmptyState } from "./panel";

interface ArticleItem {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  cover: string;
  tags: string;
  published: boolean;
  pinned: boolean;
  viewCount: number;
}

const EMPTY: Omit<ArticleItem, "id" | "viewCount"> = {
  title: "", slug: "", content: "", excerpt: "", cover: "", tags: "", published: false, pinned: false,
};

/** 文章管理：左列表 + 右选中编辑（单篇保存/删除），支持标 Markdown 正文 */
export default function ArticlesPanel() {
  const [list, setList] = useState<ArticleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // 当前编辑：true 为已有 id 的草稿，null 表示无选中，处于"新建"模式时用临时对象
  const [form, setForm] = useState<ArticleItem | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newMode, setNewMode] = useState(false);
  const disposed = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/articles");
      if (res.ok) {
        const data = (await res.json()) as ArticleItem[];
        setList(data);
      }
    } catch {
      toast.error("网络错误");
    } finally {
      if (!disposed.current) setLoading(false);
    }
  };

  useEffect(() => {
    disposed.current = false;
    load();
    return () => {
      disposed.current = true;
    };
  }, []);

  const set = <K extends keyof ArticleItem>(k: K, v: ArticleItem[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setDirty(true);
  };

  const startNew = () => {
    setNewMode(true);
    setSelectedId(null);
    setForm({ ...EMPTY, id: -1, viewCount: 0 } as ArticleItem);
    setDirty(false);
  };

  const openArticle = (a: ArticleItem) => {
    setNewMode(false);
    setSelectedId(a.id);
    setForm({ ...a });
    setDirty(false);
  };

  const save = async () => {
    if (!form) return;
    if (!form.title.trim()) return toast.error("标题不能为空");
    if (!form.slug.trim()) return toast.error(`请填写链接标识（小写字母/数字，如 my-first-post）`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
      return toast.error("链接标识须为小写字母/数字，用连字符分隔");
    }
    const body = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      content: form.content,
      excerpt: form.excerpt,
      cover: form.cover,
      tags: form.tags,
      published: form.published,
      pinned: form.pinned,
    };

    setSaving(true);
    try {
      const isEdit = !newMode;
      const res = await fetch(isEdit ? `/api/articles/${encodeURIComponent(form.slug)}` : "/api/articles", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(isEdit ? "文章已保存" : "文章已创建");
        await load();
        setDirty(false);
        setNewMode(false);
        setSelectedId(null);
        setForm(null);
      } else {
        const d = await res.json();
        toast.error(d.error || "保存失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  };

  const del = async (a: ArticleItem) => {
    if (!window.confirm(`确定删除文章「${a.title}」？该操作不可恢复。`)) return;
    try {
      const res = await fetch(`/api/articles/${encodeURIComponent(a.slug)}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("已删除");
        if (selectedId === a.id) { setForm(null); setSelectedId(null); setNewMode(false); }
        await load();
      } else {
        const d = await res.json();
        toast.error(d.error || "删除失败");
      }
    } catch {
      toast.error("网络错误");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <PanelHeader
          actions={
            <Button size="sm" onClick={startNew} className="gap-1.5">
              <Plus className="h-4 w-4" />新建文章
            </Button>
          }
        />

        {/* 列表 + 编辑器 */}
        <div className="grid gap-3 md:grid-cols-[300px_minmax(0,1fr)]">
          {/* 文章列表 */}
          <div className="flex flex-col gap-1.5 rounded-xl border bg-muted/20 p-2">
            {list.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">暂无文章，点击「新建文章」开始写作</div>
            )}
            {list.map((a) => (
              <button
                key={a.id}
                onClick={() => openArticle(a)}
                className={`flex flex-col gap-1 rounded-lg px-3 py-2 text-left transition-all ${selectedId === a.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {a.pinned && <Pin className="h-3 w-3 rotate-45" />}
                  <span className="truncate">{a.title || "(无标题)"}</span>
                </span>
                <span className={`flex items-center gap-2 text-[11px] ${selectedId === a.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  <span className={`rounded px-1 ${a.published ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>{a.published ? "已发布" : "草稿"}</span>
                  <span className="inline-flex items-center gap-0.5"><Eye className="h-3 w-3" />{a.viewCount}</span>
                  <span className="truncate">/{a.slug}</span>
                </span>
              </button>
            ))}
          </div>

          {/* 编辑器 */}
          {form ? (
            <div className="space-y-2.5 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <FilePen className="h-4 w-4" />{newMode ? "新建文章" : "编辑文章"}
                </span>
                {!newMode && form.id > 0 && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/articles/${form.slug}`} target="_blank" rel="noreferrer" className="gap-1">
                        <ExternalLink className="h-3.5 w-3.5" />前台预览
                      </a>
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => del(form)} className="gap-1">
                      <Trash2 className="h-3.5 w-3.5" />删除
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">标题</Label>
                  <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="文章标题" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">链接标识 (slug)</Label>
                  <Input value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="my-first-post（小写字母/数字/-）" className="h-8 text-sm font-mono" />
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">封面图</Label>
                  <Input value={form.cover} onChange={(e) => set("cover", e.target.value)} placeholder="https://… 或 /api/uploads/…（可选）" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">标签（逗号分隔）</Label>
                  <Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="随笔, 技术" className="h-8 text-sm" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">摘要（留空自动截取正文）</Label>
                <Input value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} placeholder="列表页与社交分享展示的简介" className="h-8 text-sm" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">正文（Markdown）</Label>
                  <div className="flex items-center gap-3 pb-1 text-xs text-muted-foreground">
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input type="checkbox" checked={form.pinned} onChange={(e) => set("pinned", e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                      <Pin className="h-3 w-3" />置顶
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input type="checkbox" checked={form.published} onChange={(e) => set("published", e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                      发布
                    </label>
                  </div>
                </div>
                <Textarea value={form.content} onChange={(e) => set("content", e.target.value)} rows={12} placeholder="支持 Markdown：# 标题、**加粗**、列表、表格等" className="font-mono text-sm" />
              </div>

              <Button onClick={save} disabled={saving} className={`w-full gap-1.5 ${dirty ? "ring-2 ring-primary/40" : ""}`}>
                {saving ? (<><Loader2 className="h-4 w-4 animate-spin" />保存中...</>) : dirty ? "● 有未保存的更改" : "保存文章"}
              </Button>
            </div>
          ) : (
            <EmptyState icon={<FileText className="h-5 w-5" />} title="从左侧选择一篇文章进行编辑" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
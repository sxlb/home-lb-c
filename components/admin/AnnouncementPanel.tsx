"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone, Pin, Trash2, Plus, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface Announcement {
  id: number;
  title: string;
  content: string;
  pinned: boolean;
  enabled: boolean;
  sort: number;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
}

interface FormState {
  id: number | null;
  title: string;
  content: string;
  pinned: boolean;
  enabled: boolean;
  sort: number;
  startAt: string;
  endAt: string;
}

const EMPTY_FORM: FormState = { id: null, title: "", content: "", pinned: false, enabled: true, sort: 0, startAt: "", endAt: "" };

/** datetime-local 输入 → ISO 字符串（空输入返回 null） */
function localToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function AnnouncementPanel() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const load = useCallback(() => {
    fetch("/api/announcements")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json) setItems(json); })
      .catch(() => toast.error("加载公告失败"));
  }, []);

  useEffect(() => { load(); setLoading(false); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title,
      content: form.content,
      pinned: form.pinned,
      enabled: form.enabled,
      sort: form.sort || 0,
      startAt: localToIso(form.startAt),
      endAt: localToIso(form.endAt),
    };
    try {
      const url = form.id === null ? "/api/announcements" : `/api/announcements/${form.id}`;
      const res = await fetch(url, {
        method: form.id === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || "保存失败");
        return;
      }
      toast.success(form.id === null ? "公告已发布" : "公告已更新");
      setForm(EMPTY_FORM);
      load();
    } catch {
      toast.error("保存失败");
    }
  }

  async function patch(id: number, data: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/announcements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || "更新失败");
        return;
      }
      load();
    } catch {
      toast.error("更新失败");
    }
  }

  async function remove(id: number) {
    if (!window.confirm("确定删除该公告？此操作不可恢复。")) return;
    try {
      const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || "删除失败");
        return;
      }
      toast.success("公告已删除");
      load();
    } catch {
      toast.error("删除失败");
    }
  }

  function startEdit(a: Announcement) {
    setForm({
      id: a.id,
      title: a.title,
      content: a.content,
      pinned: a.pinned,
      enabled: a.enabled,
      sort: a.sort,
      startAt: a.startAt ? a.startAt.slice(0, 16) : "",
      endAt: a.endAt ? a.endAt.slice(0, 16) : "",
    });
  }

  if (loading) {
    return (
      <Card><CardContent className="flex items-center justify-center py-16 text-muted-foreground">加载中...</CardContent></Card>
    );
  }

  const inputCls = "border-input bg-background text-sm focus-visible:ring-ring";
  const checkCls = "h-4 w-4 accent-primary";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">站点公告</CardTitle>
            <CardDescription>发布/编辑公告（支持置顶、上线开关与定时上下线），前台上方展示</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 编辑表单 */}
        <form onSubmit={save} className="space-y-4 rounded-xl border bg-card/60 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="an-title">标题</Label>
              <Input id="an-title" required maxLength={100} className={inputCls}
                value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="公告标题" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="an-content">内容</Label>
              <Textarea id="an-content" required maxLength={5000} rows={3} className={`min-h-20 ${inputCls}`}
                value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="公告内容，支持多行" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="an-start">定时上线（可空）</Label>
              <Input id="an-start" type="datetime-local" className={inputCls}
                value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="an-end">定时下线（可空）</Label>
              <Input id="an-end" type="datetime-local" className={inputCls}
                value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="an-sort">排序（0-9999，小者在前）</Label>
              <Input id="an-sort" type="number" min={0} max={9999} className={inputCls}
                value={form.sort} onChange={(e) => setForm({ ...form, sort: Number(e.target.value) || 0 })} />
            </div>
            <div className="flex items-end gap-6 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className={checkCls} checked={form.pinned}
                  onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> 置顶
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className={checkCls} checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> 上线
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm">
              {form.id === null ? <><Plus className="mr-1 h-4 w-4" />发布公告</> : <><Check className="mr-1 h-4 w-4" />保存修改</>}
            </Button>
            {form.id !== null && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setForm(EMPTY_FORM)}>
                <RotateCcw className="mr-1 h-4 w-4" />取消编辑
              </Button>
            )}
          </div>
        </form>

        {/* 列表 */}
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            暂无公告，使用上方表单发布第一条
          </div>
        ) : (
          <ul className="space-y-2.5">
            {items.map((a) => (
              <li key={a.id} className="rounded-xl border bg-card/60 p-3.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{a.title}</span>
                      {a.pinned && <Pin className="h-3.5 w-3.5 text-amber-500" />}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.enabled ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                        {a.enabled ? "上线中" : "已下线"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">排序 {a.sort}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{a.content}</p>
                    {(a.startAt || a.endAt) && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        时间窗：{a.startAt ? a.startAt.slice(0, 16).replace("T", " ") : "不限"} ~ {a.endAt ? a.endAt.slice(0, 16).replace("T", " ") : "不限"}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => patch(a.id, { pinned: !a.pinned })} title="置顶/取消置顶" className="h-8 px-2">
                      <Pin className={`h-4 w-4 ${a.pinned ? "text-amber-500" : "text-muted-foreground"}`} />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => patch(a.id, { enabled: !a.enabled })} title="上线/下线" className="h-8 px-2">
                      <Check className={`h-4 w-4 ${a.enabled ? "text-emerald-600" : "text-muted-foreground"}`} />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => startEdit(a)} className="h-8 px-2">编辑</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(a.id)} className="h-8 px-2 text-red-500 hover:bg-red-500/10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
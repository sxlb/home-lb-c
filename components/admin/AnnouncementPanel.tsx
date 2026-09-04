"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Pencil, ChevronUp, ChevronDown, Pin, Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { PanelHeader, EmptyState } from "./panel";

/** 公告：服务端字段 + 前端本地唯一标识（新增行在保存前使用，服务端不持久化） */
interface Announcement {
  id?: number;
  clientId?: number;
  title: string;
  content: string;
  pinned: boolean;
  enabled: boolean;
  sort: number;
  startAt: string | null;
  endAt: string | null;
}

/** 新增行本地唯一 id 计数器（模块级，页面内单调递增） */
let clientIdCounter = 0;
function nextClientId() {
  return ++clientIdCounter;
}

/** datetime-local 输入 → ISO 字符串（空输入返回 null） */
function localToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const inputCls = "h-8 border-input bg-background text-sm focus-visible:ring-ring";

export default function AnnouncementPanel() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // 同一时间只展开一行（-1 表示全部收起）
  const [expandedIndex, setExpandedIndex] = useState(-1);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchList = useCallback(async (): Promise<Announcement[] | null> => {
    const res = await fetch("/api/announcements");
    if (res.ok) {
      return (await res.json()) as Announcement[];
    }
    toast.error("加载公告失败");
    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchList();
      if (cancelled) return;
      if (data) setItems(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchList]);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { title: "", content: "", pinned: false, enabled: true, sort: prev.length, startAt: null, endAt: null, clientId: nextClientId() },
    ]);
    setExpandedIndex(items.length);
    setDirty(true);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setExpandedIndex(-1);
    setDirty(true);
  };

  const updateItem = (index: number, field: keyof Announcement, value: Announcement[keyof Announcement]) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setDirty(true);
  };

  // 上移/下移：交换相邻两行内容（id/clientId 跟随行位置，仅交换可编辑字段）
  const moveItem = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[index];
    const b = items[target];
    const fields: (keyof Announcement)[] = ["title", "content", "pinned", "enabled", "sort", "startAt", "endAt"];
    for (const f of fields) {
      updateItem(index, f, b[f]);
      updateItem(target, f, a[f]);
    }
    setDirty(true);
  };

  const save = async () => {
    // 本地预校验：空标题行过滤、有标题但内容为空定位到行
    const errors: string[] = [];
    items.forEach((it, i) => {
      if (it.title.trim() === "") return;
      if (!it.content.trim()) errors.push(`第 ${i + 1} 行：内容不能为空`);
      if (it.sort < 0 || it.sort > 9999) errors.push(`第 ${i + 1} 行：排序需在 0-9999`);
    });
    if (errors.length > 0) {
      toast.error(errors.join("；"));
      return;
    }

    setSaving(true);
    try {
      const valid = items
        .filter((it) => it.title.trim() !== "")
        .map((it) => ({
          id: it.id,
          title: it.title,
          content: it.content,
          pinned: it.pinned,
          enabled: it.enabled,
          sort: it.sort,
          startAt: localToIso(it.startAt ?? ""),
          endAt: localToIso(it.endAt ?? ""),
        }));
      const res = await fetch("/api/announcements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "保存失败");
        return;
      }
      toast.success("公告已保存");
      const data = await res.json();
      if (data && Array.isArray(data.list)) setItems(data.list);
      else fetchList().then((fresh) => fresh && setItems(fresh));
      setDirty(false);
      setExpandedIndex(-1);
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16 text-muted-foreground">加载中...</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        {/* 页面级标题/描述由 admin/page.tsx 提供，卡内仅保留右侧主操作区 */}
        <PanelHeader
          actions={
            <Button size="sm" onClick={addItem} className="gap-1.5">
              <Plus className="h-4 w-4" />
              新增公告
            </Button>
          }
        />
        {items.length === 0 && (
          <EmptyState icon={<Megaphone className="h-5 w-5" />} title="暂无公告" hint="点击右上角「新增公告」发布第一条" />
        )}
        {items.map((item, index) => (
          <AnnouncementRow
            key={item.id ?? item.clientId ?? index}
            item={item}
            index={index}
            total={items.length}
            expanded={expandedIndex === index}
            onToggle={() => setExpandedIndex(expandedIndex === index ? -1 : index)}
            onMove={(dir) => moveItem(index, dir)}
            onRemove={() => removeItem(index)}
            onUpdate={(field, value) => updateItem(index, field, value)}
          />
        ))}
        {items.length > 0 && (
          <div className="flex justify-end border-t pt-3">
            <Button
              onClick={save}
              disabled={saving}
              className={`w-full gap-1.5 sm:w-auto ${dirty ? "ring-2 ring-primary/40" : ""}`}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : dirty ? (
                "● 有未保存的更改"
              ) : (
                "保存公告"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RowProps {
  item: Announcement;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onUpdate: (field: keyof Announcement, value: Announcement[keyof Announcement]) => void;
}

/** 公告行：收起态为紧凑预览（标题 + 状态徽标 + 时间窗 + 操作），展开态为完整编辑表单 */
function AnnouncementRow({ item, index, total, expanded, onToggle, onMove, onRemove, onUpdate }: RowProps) {
  if (!expanded) {
    return (
      <div className="group flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 transition-all hover:border-primary/30 hover:shadow-sm">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{item.title.trim() || "未命名公告"}</span>
            {item.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-warning" />}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${item.enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
              {item.enabled ? "上线中" : "已下线"}
            </span>
            <span className="text-[11px] text-muted-foreground">排序 {item.sort}</span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{item.content.trim() || "（未填写内容）"}</p>
          {(item.startAt || item.endAt) && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              时间窗：{item.startAt ? item.startAt.slice(0, 16).replace("T", " ") : "不限"} ~ {item.endAt ? item.endAt.slice(0, 16).replace("T", " ") : "不限"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="上移" title="上移"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="下移" title="下移"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={onToggle} aria-label="编辑" title="编辑"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" onClick={onRemove} aria-label="删除" title="删除（保存后生效）"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">编辑公告</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="上移"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="下移"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`an-title-${index}`} className="text-xs font-medium text-muted-foreground">标题</Label>
          <Input id={`an-title-${index}`} maxLength={100} className={inputCls} placeholder="公告标题"
            value={item.title} onChange={(e) => onUpdate("title", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`an-content-${index}`} className="text-xs font-medium text-muted-foreground">内容</Label>
          <Textarea id={`an-content-${index}`} maxLength={5000} rows={3} className={`min-h-20 text-sm ${inputCls}`} placeholder="公告内容，支持多行"
            value={item.content} onChange={(e) => onUpdate("content", e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`an-start-${index}`} className="text-xs font-medium text-muted-foreground">定时上线（可空）</Label>
            <Input id={`an-start-${index}`} type="datetime-local" className={inputCls}
              value={item.startAt ? item.startAt.slice(0, 16) : ""}
              onChange={(e) => onUpdate("startAt", localToIso(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`an-end-${index}`} className="text-xs font-medium text-muted-foreground">定时下线（可空）</Label>
            <Input id={`an-end-${index}`} type="datetime-local" className={inputCls}
              value={item.endAt ? item.endAt.slice(0, 16) : ""}
              onChange={(e) => onUpdate("endAt", localToIso(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`an-sort-${index}`} className="text-xs font-medium text-muted-foreground">排序（0-9999）</Label>
            <Input id={`an-sort-${index}`} type="number" min={0} max={9999} className={inputCls}
              value={item.sort} onChange={(e) => onUpdate("sort", e.target.value === "" ? 0 : Number(e.target.value))} />
          </div>
          <div className="flex items-end gap-6 pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={item.pinned}
                onChange={(e) => onUpdate("pinned", e.target.checked)} /> 置顶
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={item.enabled}
                onChange={(e) => onUpdate("enabled", e.target.checked)} /> 上线
            </label>
          </div>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={onToggle}>完成</Button>
      </div>
    </div>
  );
}
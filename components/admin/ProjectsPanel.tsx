"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Loader2, GripVertical, FolderGit2, Star, Eye } from "lucide-react";
import { toast } from "sonner";
import { PanelHeader, EmptyState } from "./panel";
import { useGlobalSaveState, useRegisterSave } from "./GlobalSave";
import { useEditRevision } from "./useEditRevision";
import MediaPicker from "./MediaPicker";

interface ProjectItem {
  id?: number;
  clientId?: number;
  title: string;
  description: string;
  url: string;
  image: string;
  tags: string;
  featured: boolean;
  enabled: boolean;
  sort: number;
}

let clientIdCounter = 0;
const nextClientId = () => ++clientIdCounter;

const EMPTY: ProjectItem = { title: "", description: "", url: "", image: "", tags: "", featured: false, enabled: true, sort: 0 };

/** 作品集管理：增删改 + 批量保存（含置顶/上线与封面图） */
export default function ProjectsPanel() {
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const disposed = useRef(false);
  const { markEdited, isStale, currentRevision } = useEditRevision();
  // 全局保存进行中：提示统一由注册中心汇总，面板内不再重复弹
  const { saving: globalSaving } = useGlobalSaveState();

  useEffect(() => {
    disposed.current = false;
    (async () => {
      try {
        const res = await fetch("/api/projects");
        if (res.ok) setItems(await res.json());
      } catch {
        toast.error("网络错误");
      } finally {
        if (!disposed.current) setLoading(false);
      }
    })();
    return () => {
      disposed.current = true;
    };
  }, []);

  const addItem = () => {
    setItems((p) => [...p, { ...EMPTY, sort: p.length, clientId: nextClientId() }]);
    markEdited();
    setDirty(true);
  };
  const removeItem = (i: number) => {
    setItems((p) => p.filter((_, idx) => idx !== i));
    markEdited();
    setDirty(true);
  };
  const update = <K extends keyof ProjectItem>(i: number, k: K, v: ProjectItem[K]) => {
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
    markEdited();
    setDirty(true);
  };

  /** 本地校验：链接/封面图格式，定位到具体行 */
  const collectErrors = (): string | null => {
    const valid = items.filter((it) => it.title.trim() !== "");
    const errs: string[] = [];
    valid.forEach((it, idx) => {
      const row = idx + 1;
      const urlOk = !it.url || /^(https?:\/\/|\/api\/uploads\/)/.test(it.url);
      const imgOk = !it.image || /^(https?:\/\/|\/api\/uploads\/)/.test(it.image);
      if (!urlOk) errs.push(`第 ${row} 行：链接须为 http(s) 或 /api/uploads/ 开头`);
      if (!imgOk) errs.push(`第 ${row} 行：封面图须为 http(s) 或 /api/uploads/ 开头`);
    });
    return errs.length ? errs.join("；") : null;
  };

  const save = async (): Promise<boolean> => {
    const message = collectErrors();
    if (message) {
      toast.error(message);
      return false;
    }
    const valid = items.filter((it) => it.title.trim() !== "");
    // 记录提交时刻的修订号：请求往返期间用户仍可能继续编辑
    const savedRevision = currentRevision();

    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });
      if (res.ok) {
        const data = await res.json();
        if (isStale(savedRevision)) {
          // 保存期间又有新改动：保留本地列表（含新改动）与脏标记，别用服务端结果覆盖
          if (!globalSaving) toast.warning("已保存，但保存期间又有新的修改，请再次保存");
          return true;
        }
        setItems(data.list);
        setDirty(false);
        toast.success(`作品保存成功：新增 ${data.createdCount} / 更新 ${data.updatedCount} / 删除 ${data.deletedCount}`);
        return true;
      }
      const d = await res.json();
      toast.error(d.error || "保存失败");
      return false;
    } catch {
      toast.error("网络错误");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // 接入全局保存。脏标记由本面板 save() 自行维护，注册中心不会代清。
  useRegisterSave({
    id: "projects",
    label: "作品集",
    dirty,
    save,
    revision: currentRevision,
    validate: () => collectErrors(),
  });

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
            <Button size="sm" onClick={addItem} className="gap-1.5">
              <Plus className="h-4 w-4" />
              添加作品
            </Button>
          }
        />
        {items.length === 0 && (
          <EmptyState icon={<FolderGit2 className="h-5 w-5" />} title="暂无作品，点击右上角「添加作品」创建" />
        )}
        {items.map((it, i) => (
          <div key={it.id ?? it.clientId ?? i} className="group relative rounded-xl border bg-card p-3 pl-12 transition-all hover:border-primary/30 hover:shadow-sm">
            {/* 序号（按排序排列） */}
            <div title="按「排序」数值排列" className="absolute left-0 top-0 flex h-full w-10 flex-col items-center justify-center gap-1 border-r border-border/50 bg-muted/30 text-muted-foreground/60">
              <GripVertical className="h-4 w-4" />
              <span className="text-[10px] font-semibold tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => removeItem(i)}
              className="absolute right-2 top-2 h-7 w-7 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
              aria-label="删除">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>

            <div className="space-y-2.5 pr-8">
              <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">标题</Label>
                  <Input value={it.title} onChange={(e) => update(i, "title", e.target.value)} placeholder="作品名称" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">排序</Label>
                  <Input type="number" min={0} value={it.sort} onChange={(e) => update(i, "sort", e.target.value === "" ? 0 : Number(e.target.value))} className="h-8 w-20 text-sm" />
                </div>
                {/* 置顶 / 上线开关 */}
                <div className="flex items-end gap-3 pb-1">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={it.featured} onChange={(e) => update(i, "featured", e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                    <Star className="h-3 w-3" />置顶
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={it.enabled} onChange={(e) => update(i, "enabled", e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                    <Eye className="h-3 w-3" />上线
                  </label>
                </div>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">项目链接</Label>
                  <Input value={it.url} onChange={(e) => update(i, "url", e.target.value)} placeholder="https://…（可选）" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`project-image-${i}`} className="text-xs text-muted-foreground">封面图/图标</Label>
                  <MediaPicker
                    id={`project-image-${i}`}
                    value={it.image}
                    onChange={(v) => update(i, "image", v)}
                    placeholder="图标名 / 图片URL / random:关键词"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">标签（逗号分隔）</Label>
                <Input value={it.tags} onChange={(e) => update(i, "tags", e.target.value)} placeholder="Next.js, 全栈, 开源" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">描述</Label>
                <Textarea value={it.description} onChange={(e) => update(i, "description", e.target.value)} rows={2} placeholder="一句话介绍这个作品（可选）" className="resize-none text-sm" />
              </div>
            </div>
          </div>
        ))}
        <Button onClick={save} disabled={saving} className={`w-full gap-1.5 ${dirty ? "ring-2 ring-primary/40" : ""}`}>
          {saving ? (<><Loader2 className="h-4 w-4 animate-spin" />保存中...</>) : dirty ? "● 有未保存的更改" : "保存作品"}
        </Button>
      </CardContent>
    </Card>
  );
}
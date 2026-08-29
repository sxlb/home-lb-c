"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Loader2, ChevronUp, ChevronDown, Pencil, Globe } from "lucide-react";
import { useLinkList } from "./useLinkList";
import IconfontPicker from "./IconfontPicker";
import LucideIconPicker from "./LucideIconPicker";
import { resolveLucideIcon, isLucideIcon } from "@/components/lucideIconResolver";

/** 后台面板通用加载占位（社交/网站链接面板、站点信息、天气等共用） */
export function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      加载中...
    </div>
  );
}

interface LinkItem {
  id?: number;
  /** 前端本地唯一标识（新增行使用，服务端不会持久化），用于列表 key 保持稳定 */
  clientId?: number;
  name: string;
  icon: string;
  url: string;
  tip?: string;
  sort: number;
}

interface LinksPanelProps {
  /** 链接列表 API 路径（如 /api/social-links、/api/site-links） */
  apiPath: string;
  /** 面板标题 */
  title: string;
  /** 面板描述 */
  description: string;
  /** 列表为空时的提示文案 */
  emptyText: string;
  /** 保存成功提示 */
  successMessage: string;
  /** 是否显示"悬停提示"字段（社交链接独有） */
  showTip?: boolean;
  /** 新建行默认图标 */
  defaultIcon?: string;
  /** 名称输入占位 */
  namePlaceholder?: string;
  /** 图标输入占位 */
  iconPlaceholder?: string;
  /** 链接地址输入占位 */
  urlPlaceholder?: string;
}

/** LinkRow 组件 props */
interface LinkRowProps {
  link: LinkItem;
  index: number;
  total: number;
  expanded: boolean;
  showTip: boolean;
  namePlaceholder?: string;
  iconPlaceholder?: string;
  urlPlaceholder?: string;
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onUpdate: (field: keyof LinkItem, value: string | number) => void;
}

/**
 * 链接列表面板（社交链接 / 网站链接共用）：
 * - 增/删/改单行 + 批量保存（useLinkList 统一状态管理）
 * - 通过 props 区分两种链接的字段差异（社交链接多一个"悬停提示"）
 */
export default function LinksPanel({
  apiPath,
  title,
  description,
  emptyText,
  successMessage,
  showTip = false,
  defaultIcon = "globe",
  namePlaceholder = "链接名称",
  iconPlaceholder = "如 github, globe, link",
  urlPlaceholder = "https://example.com",
}: LinksPanelProps) {
  const emptyItem: LinkItem = {
    name: "",
    icon: defaultIcon,
    url: "",
    ...(showTip ? { tip: "" } : {}),
    sort: 0,
  };
  const { items: links, loading, saving, addItem, removeItem, updateItem, save } = useLinkList(
    apiPath,
    emptyItem,
    successMessage,
    // 社交/网站链接的 icon 必填（后端 zod min(1)）
    { requireIcon: true }
  );

  // 同一时间只展开一行（-1 表示全部收起）
  const [expandedIndex, setExpandedIndex] = useState(-1);
  // 未保存变更标记：任何增删改置 true，保存成功置 false
  const [dirty, setDirty] = useState(false);

  const markDirty = () => setDirty(true);

  const handleAdd = () => {
    addItem();
    markDirty();
    setExpandedIndex(links.length);
  };

  const handleRemove = (index: number) => {
    removeItem(index);
    markDirty();
    setExpandedIndex((prev) => (prev === index ? -1 : prev > index ? prev - 1 : prev));
  };

  const handleUpdate = (index: number, field: keyof LinkItem, value: string | number) => {
    updateItem(index, field, value);
    markDirty();
  };

  // 上移/下移：交换相邻两行的内容字段（id/clientId 跟随行位置，避免主键错乱）
  const handleMove = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= links.length) return;
    const a = links[index];
    const b = links[target];
    const fields: (keyof LinkItem)[] = [
      "name",
      "icon",
      "url",
      "sort",
      ...(showTip ? (["tip"] as (keyof LinkItem)[]) : []),
    ];
    for (const f of fields) {
      updateItem(index, f, b[f]);
      updateItem(target, f, a[f]);
    }
    markDirty();
  };

  const handleSave = async () => {
    await save();
    setDirty(false);
    setExpandedIndex(-1);
  };

  if (loading) {
    return <LoadingPlaceholder />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button size="sm" onClick={handleAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            添加链接
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {links.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          </div>
        )}
        {links.map((link, index) => (
          <LinkRow
            key={link.id ?? link.clientId ?? index}
            link={link}
            index={index}
            total={links.length}
            expanded={expandedIndex === index}
            showTip={showTip}
            namePlaceholder={namePlaceholder}
            iconPlaceholder={iconPlaceholder}
            urlPlaceholder={urlPlaceholder}
            onToggle={() => setExpandedIndex(expandedIndex === index ? -1 : index)}
            onMove={(dir) => handleMove(index, dir)}
            onRemove={() => handleRemove(index)}
            onUpdate={(field, value) => handleUpdate(index, field, value)}
          />
        ))}
        {links.length > 0 && (
          <Button
            onClick={handleSave}
            disabled={saving}
            className={`w-full gap-1.5 ${dirty ? "ring-2 ring-primary/40" : ""}`}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : dirty ? (
              "● 有未保存的更改"
            ) : (
              "保存链接"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 链接行：收起态为紧凑预览（图标 + 名称/URL + 操作按钮），展开态为完整表单。
 * 收起态是列表默认形态，编辑/排序/删除操作均在此层；展开态聚焦字段编辑。
 */
function LinkRow({
  link,
  index,
  total,
  expanded,
  showTip,
  namePlaceholder = "链接名称",
  iconPlaceholder = "如 github, globe, link",
  urlPlaceholder = "https://example.com",
  onToggle,
  onMove,
  onRemove,
  onUpdate,
}: LinkRowProps) {
  // 收起态：紧凑预览行
  if (!expanded) {
    return (
      <div className="group flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 transition-all hover:border-primary/30 hover:shadow-sm">
        {/* 图标缩略图 */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <LinkIconPreview icon={link.icon} />
        </div>
        {/* 名称 + URL */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {link.name.trim() || "未命名链接"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {link.url || "（未填写链接地址）"}
          </p>
        </div>
        {/* 操作区：排序 / 编辑 / 删除 */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="上移"
            title="上移"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="下移"
            title="下移"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="编辑"
            title="编辑"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="删除"
            title="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // 展开态：完整表单（图标选择器仅此处渲染，收起时零渲染）
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <LinkIconPreview icon={link.icon} />
          </div>
          <span className="text-sm font-semibold">编辑链接</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="上移"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="下移"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`link-name-${index}`} className="text-xs font-medium text-muted-foreground">名称</Label>
            <Input
              id={`link-name-${index}`}
              value={link.name}
              onChange={(e) => onUpdate("name", e.target.value)}
              placeholder={namePlaceholder}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`link-icon-${index}`} className="text-xs font-medium text-muted-foreground">图标</Label>
            <Input
              id={`link-icon-${index}`}
              value={link.icon}
              onChange={(e) => onUpdate("icon", e.target.value)}
              placeholder={iconPlaceholder}
              className="h-8 text-sm"
            />
          </div>
        </div>
        {/* 图标选择器：Lucide / 图标库 Tab */}
        <IconPickerTabs value={link.icon} onChange={(name) => onUpdate("icon", name)} />
        <div className="space-y-1.5">
          <Label htmlFor={`link-url-${index}`} className="text-xs font-medium text-muted-foreground">链接地址</Label>
          <Input
            id={`link-url-${index}`}
            value={link.url}
            onChange={(e) => onUpdate("url", e.target.value)}
            placeholder={urlPlaceholder}
            className="h-8 text-sm"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {showTip && (
            <div className="space-y-1.5">
              <Label htmlFor={`link-tip-${index}`} className="text-xs font-medium text-muted-foreground">悬停提示</Label>
              <Input
                id={`link-tip-${index}`}
                value={link.tip ?? ""}
                onChange={(e) => onUpdate("tip", e.target.value)}
                placeholder="鼠标悬停时显示的文字"
                className="h-8 text-sm"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`link-sort-${index}`} className="text-xs font-medium text-muted-foreground">排序</Label>
            <Input
              id={`link-sort-${index}`}
              type="number"
              min={0}
              step={1}
              value={link.sort}
              onChange={(e) => onUpdate("sort", e.target.value === "" ? 0 : Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={onToggle}>
          完成
        </Button>
      </div>
    </div>
  );
}

/**
 * 链接图标预览：lucide:xxx 走 lucide 组件；icon- 前缀走 iconfont symbol；
 * 其余未知值兜底 Globe。供列表收起态与表单内实时预览使用。
 */
export function LinkIconPreview({ icon }: { icon: string }) {
  if (isLucideIcon(icon)) {
    const Icon = resolveLucideIcon(icon);
    if (Icon) return <Icon className="h-5 w-5" />;
  }
  if (icon.startsWith("icon-")) {
    return (
      <svg className="h-5 w-5" aria-hidden>
        <use href={`#${icon}`} />
      </svg>
    );
  }
  return <Globe className="h-5 w-5" />;
}

/**
 * 图标选择器 Tab 切换组件：
 * - Lucide 图标 / 图标库 两个 Tab
 * - 每个实例独立维护激活 Tab 状态
 * - Lucide 图标选中值格式：lucide:xxx
 * - 图标库选中值为 symbol 名（如 icon-xxx）
 */
function IconPickerTabs({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  // 根据当前值自动推断激活的 Tab
  const getInitialTab = (): "lucide" | "iconfont" => {
    if (value.startsWith("lucide:")) return "lucide";
    // iconfont 通常是 icon- 前缀或其他自定义 symbol 名
    if (value.startsWith("icon-")) return "iconfont";
    return "lucide";
  };

  const [activeTab, setActiveTab] = useState<"lucide" | "iconfont">(getInitialTab);

  // value 变化（手动输入或外部修改）时同步激活 tab，避免 UI 状态与值错位
  useEffect(() => {
    setActiveTab(getInitialTab());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="space-y-2">
      {/* Tab 切换按钮 */}
      <div className="flex gap-1 rounded-md bg-muted p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("lucide")}
          className={`flex-1 rounded px-1.5 py-1 transition-colors ${
            activeTab === "lucide"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Lucide
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("iconfont")}
          className={`flex-1 rounded px-1.5 py-1 transition-colors ${
            activeTab === "iconfont"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          图标库
        </button>
      </div>
      {/* Tab 内容 */}
      {activeTab === "lucide" && <LucideIconPicker value={value} onChange={onChange} />}
      {activeTab === "iconfont" && <IconfontPicker value={value} onChange={onChange} />}
    </div>
  );
}

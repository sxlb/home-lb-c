"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Loader2, GripVertical } from "lucide-react";
import { useLinkList } from "./useLinkList";
import IconfontPicker from "./IconfontPicker";
import LucideIconPicker from "./LucideIconPicker";

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
          <Button size="sm" onClick={addItem} className="gap-1.5">
            <Plus className="h-4 w-4" />
            添加链接
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {links.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          </div>
        )}
        {links.map((link, index) => (
          <div
            key={link.id ?? link.clientId ?? index}
            className="group relative rounded-xl border bg-card transition-all hover:border-primary/30 hover:shadow-sm"
          >
            {/* 拖拽手柄 + 序号（无拖拽实现，title 说明按排序值排列） */}
            <div title="按「排序」数值排列" className="absolute left-0 top-0 flex h-full w-10 flex-col items-center justify-center gap-1 border-r border-border/50 bg-muted/30 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground">
              <GripVertical className="h-4 w-4" />
              <span className="text-[10px] font-semibold tabular-nums">{String(index + 1).padStart(2, "0")}</span>
            </div>

            {/* 删除按钮 - 右上角图标按钮 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeItem(index)}
              className="absolute right-2 top-2 h-7 w-7 text-muted-foreground opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
              aria-label="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>

            {/* 表单内容 - 左侧留出拖拽手柄空间 */}
            <div className="space-y-2.5 pl-12 pr-3 py-3">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`link-name-${index}`} className="text-xs font-medium text-muted-foreground">名称</Label>
                  <Input
                    id={`link-name-${index}`}
                    name={`link-name-${index}`}
                    value={link.name}
                    onChange={(e) => updateItem(index, "name", e.target.value)}
                    placeholder={namePlaceholder}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`link-icon-${index}`} className="text-xs font-medium text-muted-foreground">图标</Label>
                  <Input
                    id={`link-icon-${index}`}
                    name={`link-icon-${index}`}
                    value={link.icon}
                    onChange={(e) => updateItem(index, "icon", e.target.value)}
                    placeholder={iconPlaceholder}
                    className="h-8 text-sm"
                  />
                  {/* 图标选择器：Lucide 图标 / 图标库 Tab 切换 */}
                  <IconPickerTabs
                    value={link.icon}
                    onChange={(name) => updateItem(index, "icon", name)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`link-url-${index}`} className="text-xs font-medium text-muted-foreground">链接地址</Label>
                <Input
                  id={`link-url-${index}`}
                  name={`link-url-${index}`}
                  value={link.url}
                  onChange={(e) => updateItem(index, "url", e.target.value)}
                  placeholder={urlPlaceholder}
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {showTip && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`link-tip-${index}`} className="text-xs font-medium text-muted-foreground">悬停提示</Label>
                    <Input
                      id={`link-tip-${index}`}
                      name={`link-tip-${index}`}
                      value={link.tip ?? ""}
                      onChange={(e) => updateItem(index, "tip", e.target.value)}
                      placeholder="鼠标悬停时显示的文字"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor={`link-sort-${index}`} className="text-xs font-medium text-muted-foreground">排序</Label>
                  <Input
                    id={`link-sort-${index}`}
                    name={`link-sort-${index}`}
                    type="number"
                    min={0}
                    step={1}
                    value={link.sort}
                    onChange={(e) => updateItem(index, "sort", e.target.value === "" ? 0 : Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
        {links.length > 0 && (
          <Button onClick={save} disabled={saving} className="w-full gap-1.5">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                保存中...
              </>
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

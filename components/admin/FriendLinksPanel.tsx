"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Loader2, GripVertical, Users } from "lucide-react";
import { useLinkList } from "./useLinkList";
import { LoadingPlaceholder } from "./LinksPanel";

interface FriendLinkItem {
  id?: number;
  /** 前端本地唯一标识（新增行使用，服务端不会持久化），用于列表 key 保持稳定 */
  clientId?: number;
  name: string;
  url: string;
  icon: string;
  description: string;
  sort: number;
}

/**
 * 友情链接管理面板：
 * - 增/删/改单行 + 批量保存（useLinkList 统一状态管理）
 * - 字段：网站名称、网站地址、Logo URL、描述、排序
 */
export default function FriendLinksPanel() {
  const emptyItem: FriendLinkItem = {
    name: "",
    url: "",
    icon: "",
    description: "",
    sort: 0,
  };
  const { items: links, loading, saving, addItem, removeItem, updateItem, save } = useLinkList(
    "/api/friend-links",
    emptyItem,
    "友情链接保存成功",
    // 友情链接仅允许 http(s)（后端 friendLinkSchema），icon 可空
    { urlPattern: /^https?:\/\// }
  );

  if (loading) {
    return <LoadingPlaceholder />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">友情链接</CardTitle>
            <CardDescription>管理首页展示的友情链接（合作伙伴、优秀站点等）</CardDescription>
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
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">暂无友情链接，点击右上角「添加链接」创建</p>
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
                  <Label htmlFor={`friend-name-${index}`} className="text-xs font-medium text-muted-foreground">网站名称</Label>
                  <Input
                    id={`friend-name-${index}`}
                    name={`friend-name-${index}`}
                    value={link.name}
                    onChange={(e) => updateItem(index, "name", e.target.value)}
                    placeholder="如 某某博客"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`friend-sort-${index}`} className="text-xs font-medium text-muted-foreground">排序</Label>
                  <Input
                    id={`friend-sort-${index}`}
                    name={`friend-sort-${index}`}
                    type="number"
                    min={0}
                    step={1}
                    value={link.sort}
                    onChange={(e) => updateItem(index, "sort", e.target.value === "" ? 0 : Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`friend-url-${index}`} className="text-xs font-medium text-muted-foreground">网站地址</Label>
                <Input
                  id={`friend-url-${index}`}
                  name={`friend-url-${index}`}
                  value={link.url}
                  onChange={(e) => updateItem(index, "url", e.target.value)}
                  placeholder="https://example.com"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`friend-icon-${index}`} className="text-xs font-medium text-muted-foreground">Logo URL</Label>
                <Input
                  id={`friend-icon-${index}`}
                  name={`friend-icon-${index}`}
                  value={link.icon}
                  onChange={(e) => updateItem(index, "icon", e.target.value)}
                  placeholder="https://example.com/logo.png（可选）"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`friend-description-${index}`} className="text-xs font-medium text-muted-foreground">网站描述</Label>
                <Textarea
                  id={`friend-description-${index}`}
                  name={`friend-description-${index}`}
                  value={link.description}
                  onChange={(e) => updateItem(index, "description", e.target.value)}
                  placeholder="一句话介绍这个网站（可选）"
                  className="min-h-[60px] resize-none text-sm"
                />
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

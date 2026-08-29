# 链接管理界面改造（S1）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将后台社交/网站链接面板改造为"折叠式列表 + 行内编辑"，列表即前台预览形态，去掉伪拖拽栏，增加未保存提示与箭头排序。

**Architecture:** `LinksPanel.tsx` 重写主体：主面板管理 `expandedIndex`（同一时间展开一行）与 `dirty` 状态（操作计数方案）；新增内部 `LinkRow`（收起态预览行 / 展开态表单）+ `LinkIconPreview`（图标解析）。复用 `useLinkList`、`IconPickerTabs`、`lucideIconResolver`，不改后端与数据结构。

**Tech Stack:** Next.js 15 / React 19 / Tailwind / vitest

**设计文档:** `docs/superpowers/specs/2026-08-29-links-panel-design.md`

---

### Task 1: 图标预览组件 LinkIconPreview

**Files:**
- Modify: `components/admin/LinksPanel.tsx`（新增 LinkIconPreview）
- Create: `tests/link-icon-preview.test.tsx`

- [ ] **Step 1: 编写失败测试**

创建 `tests/link-icon-preview.test.tsx`：

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LinkIconPreview } from "@/components/admin/LinksPanel";

describe("LinkIconPreview 图标解析", () => {
  it("lucide: 前缀解析为 lucide 图标", () => {
    render(<LinkIconPreview icon="lucide:github" />);
    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("icon- 前缀渲染 iconfont symbol", () => {
    render(<LinkIconPreview icon="icon-github" />);
    const use = document.querySelector("use");
    expect(use?.getAttribute("href")).toBe("#icon-github");
  });

  it("未知图标兜底 Globe", () => {
    render(<LinkIconPreview icon="unknown-xyz" />);
    expect(document.querySelector("svg")).not.toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/link-icon-preview.test.tsx`
Expected: FAIL（`LinkIconPreview` 未导出）

- [ ] **Step 3: 实现 LinkIconPreview**

在 `components/admin/LinksPanel.tsx` 文件底部（IconPickerTabs 之后）新增：

```tsx
import { Globe } from "lucide-react";
import { resolveLucideIcon, isLucideIcon } from "./lucideIconResolver";

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
```

注意：`Globe` 需要加到文件顶部 lucide import 中（现有 `import { Plus, Trash2, Loader2, GripVertical } from "lucide-react"`）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/link-icon-preview.test.tsx`
Expected: 3 个用例 PASS

- [ ] **Step 5: 提交**

```bash
git add components/admin/LinksPanel.tsx tests/link-icon-preview.test.tsx
git commit -m "feat(admin-links): add LinkIconPreview with lucide/iconfont fallback"
```

---

### Task 2: LinkRow 收起态（列表预览行）

**Files:**
- Modify: `components/admin/LinksPanel.tsx`

- [ ] **Step 1: 新增 LinkRow 组件（收起态部分）**

在 `LinksPanel.tsx` 中新增内部组件（放在 LinkIconPreview 上方）：

```tsx
interface LinkRowProps {
  link: LinkItem;
  index: number;
  total: number;
  expanded: boolean;
  showTip: boolean;
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onUpdate: (field: keyof LinkItem, value: string | number) => void;
}

/** 链接行：收起态为紧凑预览（图标 + 名称/URL + 操作按钮），展开态为完整表单 */
function LinkRow({ link, index, total, expanded, showTip, onToggle, onMove, onRemove, onUpdate }: LinkRowProps) {
  // 收起态
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
        {/* 操作区 */}
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
  // 展开态表单（Task 3 实现）
  return null;
}
```

- [ ] **Step 2: 更新 lucide import**

将 `import { Plus, Trash2, Loader2, GripVertical } from "lucide-react";` 替换为：

```tsx
import { Plus, Trash2, Loader2, ChevronUp, ChevronDown, Pencil, Globe } from "lucide-react";
```

（移除不再使用的 `GripVertical`）

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 4: 提交**

```bash
git add components/admin/LinksPanel.tsx
git commit -m "feat(admin-links): collapsed preview row with move/edit/delete actions"
```

---

### Task 3: LinkRow 展开态（行内编辑表单）

**Files:**
- Modify: `components/admin/LinksPanel.tsx`

- [ ] **Step 1: 实现展开态表单**

将 LinkRow 中 `return null;` 的展开态分支替换为：

```tsx
  // 展开态：完整表单（保留原卡片字段，图标选择器仅此处渲染）
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
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
            aria-label="上移"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
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
              placeholder="链接名称"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`link-icon-${index}`} className="text-xs font-medium text-muted-foreground">图标</Label>
            <Input
              id={`link-icon-${index}`}
              value={link.icon}
              onChange={(e) => onUpdate("icon", e.target.value)}
              placeholder="如 github, globe, link"
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
            placeholder="https://example.com"
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
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 3: 提交**

```bash
git add components/admin/LinksPanel.tsx
git commit -m "feat(admin-links): inline edit form on expand with icon picker"
```

---

### Task 4: 主面板改造（展开管理 + dirty + 排序移动）

**Files:**
- Modify: `components/admin/LinksPanel.tsx`

- [ ] **Step 1: 主面板状态与回调**

将 `LinksPanel` 组件主体改为：

```tsx
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
    { requireIcon: true }
  );

  // 同一时间只展开一行（-1 表示全部收起）
  const [expandedIndex, setExpandedIndex] = useState<number>(-1);
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
    const fields: (keyof LinkItem)[] = ["name", "icon", "url", "sort", ...(showTip ? (["tip"] as const) : [])];
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
```

- [ ] **Step 2: 移除旧列表渲染代码**

删除原组件中第 115-221 行的旧卡片列表渲染（`links.map(...)` 的旧实现与旧保存按钮），确保组件主体与 Step 1 一致，无重复代码。

- [ ] **Step 3: 类型检查 + 全量测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 通过

- [ ] **Step 4: 构建验证**

Run: `npm run build`
Expected: 成功

- [ ] **Step 5: 提交**

```bash
git add components/admin/LinksPanel.tsx
git commit -m "feat(admin-links): expandable list with dirty indicator and arrow sorting"
```

---

### Task 5: 全量验证

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 全部 PASS（含新 link-icon-preview 用例）

- [ ] **Step 2: 类型 + Lint + 构建**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 无错误

- [ ] **Step 3: 手工验证清单**

1. `npm run dev` 后进入后台「社交链接」：默认收起为紧凑预览行（图标+名称+URL）
2. 点击编辑：展开表单，其他行自动收起；图标选择器可用；改名称后预览即时更新
3. 上移/下移按钮：行内容换位，首行上移/末行下移按钮禁用
4. 删除：行消失；删除展开行后编辑区收起
5. 添加链接：新行追加并自动展开
6. 修改后保存按钮变"● 有未保存的更改"高亮；保存成功后恢复"保存链接"并收起编辑
7. 「网站链接」面板同样验证；移动端宽度下操作按钮可见
8. 图标预览：填 `lucide:github` 显示 GitHub 图标、`icon-xxx` 显示 symbol、乱填兜底 Globe

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore(admin-links): final verification" || echo "无新增变更"
```

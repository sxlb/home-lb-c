# S5 主题实时预览 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「主题与壁纸」面板内实时预览强调色与玻璃卡片效果。

**Architecture:** `ThemePreview` 组件接收表单实时值，容器内联 CSS 变量（与 ThemeProvider 同逻辑），复用前台 `card-glass` / `text-glow-accent` 样式模拟主页卡片。

**Tech Stack:** React 19 / Tailwind

**设计文档:** `docs/superpowers/specs/2026-08-29-s5-theme-preview-design.md`

---

### Task 1: ThemePreview 组件

**Files:**
- Create: `components/admin/ThemePreview.tsx`

- [ ] **Step 1: 创建组件**

创建 `components/admin/ThemePreview.tsx`：

```tsx
"use client";

/** 主题实时预览：模拟前台主页卡片，CSS 变量随表单值实时变化（与 ThemeProvider 同逻辑） */
export default function ThemePreview({
  accentColor,
  glassOpacity,
  glassBlur,
}: {
  accentColor: string;
  glassOpacity: number;
  glassBlur: number;
}) {
  // 与 ThemeProvider 计算逻辑保持一致：非法 hex 回退默认天蓝；clamp 到合法区间
  const accent = accentColor && /^#[0-9a-fA-F]{3,8}$/.test(accentColor) ? accentColor : "#7dd3fc";
  const glassAlpha = String(Math.max(0, Math.min(80, glassOpacity)) / 100);
  const glassBlurPx = `${Math.max(0, Math.min(40, glassBlur))}px`;

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={
        {
          "--accent-color": accent,
          "--card-alpha": glassAlpha,
          "--glass-blur": glassBlurPx,
        } as React.CSSProperties
      }
    >
      {/* 模拟前台深色壁纸背景 */}
      <div className="relative bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] p-6">
        {/* 昵称 + 发光文字 */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-xl text-white ring-2 ring-white/30">
            A
          </div>
          <div>
            <p className="text-glow-accent text-2xl font-semibold text-white">示例昵称</p>
            <p className="text-xs text-white/50">预览效果随下方设置实时变化</p>
          </div>
        </div>

        {/* 模拟玻璃卡片：card-glass 读取 --card-alpha / --glass-blur */}
        <div className="card-glass card-info rounded-2xl p-4">
          <div className="mb-2 h-[3px] w-24 rounded-full" style={{ background: accent }} />
          <div className="flex items-center gap-2 text-sm text-white/90">
            <svg viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 2a10 10 0 1 0 10 10" />
            </svg>
            <span>玻璃卡片质感示例</span>
          </div>
          <p className="mt-2 text-xs text-white/60">
            不透明度 {glassOpacity}% · 模糊 {glassBlur}px · 强调色 {accent}
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 3: 提交**

```bash
git add components/admin/ThemePreview.tsx
git commit -m "feat(theme): realtime ThemePreview component with live CSS variables"
```

---

### Task 2: 挂载到 ThemePanel

**Files:**
- Modify: `components/admin/ThemePanel.tsx`

- [ ] **Step 1: 挂载预览**

在 `components/admin/ThemePanel.tsx`：
1. import：`import ThemePreview from "./ThemePreview";`
2. 在 `<CardContent>` 内 `<form>` 之前插入：

```tsx
        {/* 主题实时预览：CSS 变量随表单实时值变化，保存后前台同源生效 */}
        <div className="mb-5">
          <ThemePreview
            accentColor={profile.accentColor}
            glassOpacity={profile.glassOpacity}
            glassBlur={profile.glassBlur}
          />
        </div>
```

- [ ] **Step 2: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功

- [ ] **Step 3: 提交**

```bash
git add components/admin/ThemePanel.tsx
git commit -m "feat(theme): mount realtime preview in theme panel"
```

---

### Task 3: 全量验证

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 全部 PASS

- [ ] **Step 2: 类型 + Lint + 构建**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 无错误

- [ ] **Step 3: 手工验证清单**

1. 后台「主题与壁纸」：顶部显示实时预览区
2. 拖动「玻璃卡片不透明度」滑杆 → 预览卡片透明度实时变化
3. 拖动「玻璃卡片模糊」滑杆 → 预览卡片模糊实时变化
4. 修改强调色 → 预览渐变条/图标/发光文字颜色实时变化；清空时回退天蓝
5. 保存后回首页：玻璃卡片与强调色效果与预览一致

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore(theme-preview): final verification" || echo "无新增变更"
```

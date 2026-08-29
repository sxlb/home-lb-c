# 前端加载性能优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首屏 JS 减重（拆分 Effects.tsx）、加载动画与壁纸解耦、时钟 re-render 优化、装饰特效性能与统计代码延迟注入。

**Architecture:** 将 `Effects.tsx` 拆为 `LoadingScreen.tsx`（首屏预加载）+ `DecorativeEffects.tsx`（懒加载合并）；LoadingScreen 增加宽松就绪判定；时钟拆分时间/天气 state 并用 ref 直写 DOM；SeasonalEffect/ClickEffect 做 DPR 上限与 rAF 暂停；ScriptInjector 统计代码延迟注入。

**Tech Stack:** Next.js 15 / React 19 / vitest

**设计文档:** `docs/superpowers/specs/2026-08-29-loading-optimization-design.md`

---

### Task 1: 拆分 Effects.tsx → LoadingScreen + DecorativeEffects

**Files:**
- Create: `components/LoadingScreen.tsx`
- Create: `components/DecorativeEffects.tsx`
- Modify: `app/page.tsx:19,73-83`
- Delete: `components/Effects.tsx`
- Test: `tests/loading-screen.test.tsx`、`tests/click-effect.test.tsx`、`tests/dev-console.test.tsx`、`tests/dynamic-title.test.tsx`、`tests/top-progress-bar.test.tsx`

- [ ] **Step 1: 确认测试文件的 import 路径**

Run: `Select-String -Path 'tests/*.test.tsx' -Pattern 'Effects' | Select-Object Filename, LineNumber, Line`
Expected: `loading-screen.test.tsx` / `click-effect.test.tsx` / `dev-console.test.tsx` / `dynamic-title.test.tsx` / `top-progress-bar.test.tsx` 均 import 自 `@/components/Effects`

- [ ] **Step 2: 创建 LoadingScreen.tsx**

从原 `Effects.tsx` 第 1-121 行提取（`"use client"` + react imports + `LoadingScreen` 组件 + 其 props 接口），文件内容为：

```tsx
"use client";

import { useEffect, useState } from "react";

interface LoadingScreenProps {
  /** 是否启用加载动画（后台可配置） */
  enabled?: boolean;
  /** 站点昵称，显示在加载动画中央 */
  siteName?: string;
}

/**
 * 全屏加载动画
 * - 三环旋转动画 + 站点名 + Loading 文字
 * - 条件全部满足后分屏收起，随后移除遮罩：
 *   1. 最短展示 800ms（避免闪屏）
 *   2. 页面 window load 完成 或 宽松就绪（DOMContentLoaded 后 2s）
 *   3. 背景壁纸就绪（Background 组件广播 background-ready 事件）
 * - 安全兜底：最长 5s 强制收起，防止背景源异常导致加载动画卡死
 */
export function LoadingScreen({ enabled = true, siteName = "" }: LoadingScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [bgReady, setBgReady] = useState(false);

  // 监听背景就绪事件；若背景先于本组件挂载完成（window.__bgReady），直接视为就绪
  useEffect(() => {
    if (!enabled) return;
    if ((window as unknown as { __bgReady?: boolean }).__bgReady) {
      setBgReady(true);
      return;
    }
    const onReady = () => setBgReady(true);
    window.addEventListener("background-ready", onReady);
    return () => window.removeEventListener("background-ready", onReady);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || removed) return;

    let mounted = true;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const hide = () => {
      if (!mounted || hideTimer) return;
      // 先加 loaded 状态触发分屏收起动画
      setLoaded(true);
      // 等动画全部完成再移除节点：分屏收起 0.3s 延迟 + 0.5s，整体上移 1s 延迟 + 0.3s，共 1.3s
      hideTimer = setTimeout(() => {
        if (mounted) setRemoved(true);
        // 广播"加载动画已完全移除"，供欢迎通知等组件在动画结束后再展示
        window.dispatchEvent(new Event("loading-screen-removed"));
      }, 1400);
    };

    const tryHide = () => {
      if (document.readyState === "complete" && bgReady) hide();
    };

    // 最短展示时间（800ms）+ 条件判断
    const minTimer = setTimeout(() => {
      if (document.readyState === "complete" && bgReady) {
        hide();
      } else {
        window.addEventListener("load", tryHide, { once: true });
      }
    }, 800);

    // 宽松就绪兜底：DOMContentLoaded 后 2s 内壁纸未就绪也收起（弱网 LCP 优化）
    const relaxedTimer = setTimeout(() => {
      if (document.readyState !== "complete") return;
      if (!bgReady && !hideTimer) hide();
    }, 2800);

    // 背景就绪（bgReady 变化触发本 effect 重跑）后立即复查
    if (bgReady && document.readyState === "complete") hide();

    // 安全兜底：最长 5s 无论背景是否就绪都收起
    const safety = setTimeout(hide, 5000);

    return () => {
      mounted = false;
      if (minTimer) clearTimeout(minTimer);
      if (relaxedTimer) clearTimeout(relaxedTimer);
      if (safety) clearTimeout(safety);
      if (hideTimer) clearTimeout(hideTimer);
      window.removeEventListener("load", tryHide);
    };
  }, [enabled, bgReady, removed]);

  if (!enabled || removed) return null;

  return (
    <div
      id="loader-wrapper"
      className={`fixed inset-0 z-[999] overflow-hidden bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#1a1a2e] ${
        loaded ? "loader-loaded" : ""
      }`}
      aria-hidden
    >
      {/* 中心加载内容 */}
      <div className="loader">
        <div className="loader-circle" />
        <div className="loader-text">
          <span className="loader-name">{siteName || "个人主页"}</span>
          <span className="loader-tip">Loading...</span>
        </div>
      </div>
      {/* 左右分屏遮罩（使用与背景一致的渐变色） */}
      <div className="loader-section loader-section-left" style={{ background: "linear-gradient(90deg, #1a1a2e 0%, #16213e 100%)" }} />
      <div className="loader-section loader-section-right" style={{ background: "linear-gradient(270deg, #1a1a2e 0%, #16213e 100%)" }} />
    </div>
  );
}
```

注意：新增 `relaxedTimer`（2800ms 宽松就绪，即 800ms 最短展示 + 2s 等待），满足 P1-1 的"DOMContentLoaded 后 2s 收口"设计。

- [ ] **Step 3: 创建 DecorativeEffects.tsx**

从原 `Effects.tsx` 提取 `ClickEffect`、`DevConsole`、`DynamicTitle`、`TopProgressBar`、`WelcomeNotice` 及组合组件 `Effects`（第 123-720 行），保留原注释与实现，文件开头为：

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, X } from "lucide-react";

/**
 * ===== 页面装饰/工具类效果组件合集 =====
 * 5 个"enabled 开关 + 返回 null/占位"的客户端效果组件：
 * - 点击粒子 / 控制台彩蛋 / 动态标题 / 顶部进度条 / 欢迎通知
 * 独立文件 + 页面懒加载（ssr:false）：LoadingScreen 收起后再加载；
 * 后台全部关闭时此 chunk 零下载。
 */
```

组件与导出保持原样：`ClickEffect`、`DevConsole`、`DynamicTitle`、`TopProgressBar`、`WelcomeNotice`、`Effects`（默认导出，6 个 props 与原来一致）。

- [ ] **Step 4: 更新 page.tsx 引用**

将 `app/page.tsx` 第 19 行 `const Effects = dynamic(() => import("@/components/Effects"));` 替换为：

```tsx
const LoadingScreen = dynamic(() => import("@/components/LoadingScreen"), { ssr: true });
const Effects = dynamic(() => import("@/components/DecorativeEffects"), { ssr: false });
```

第 73 行 `<Effects ... />` 内部、`loadingScreen` prop 之前插入：

```tsx
        <LoadingScreen enabled={d.loadingScreen} siteName={d.nickname} />
```

- [ ] **Step 5: 更新测试 import 路径**

- `tests/loading-screen.test.tsx`：`import { LoadingScreen } from "@/components/Effects"` → `import { LoadingScreen } from "@/components/LoadingScreen"`
- `tests/click-effect.test.tsx`、`tests/dev-console.test.tsx`、`tests/dynamic-title.test.tsx`、`tests/top-progress-bar.test.tsx`：`import { XxxEffect } from "@/components/Effects"` → `import { XxxEffect } from "@/components/DecorativeEffects"`

- [ ] **Step 6: 删除原 Effects.tsx**

删除 `components/Effects.tsx`。

- [ ] **Step 7: 运行测试**

Run: `npx vitest run tests/loading-screen.test.tsx tests/click-effect.test.tsx tests/dev-console.test.tsx tests/dynamic-title.test.tsx tests/top-progress-bar.test.tsx`
Expected: 全部 PASS

- [ ] **Step 8: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功；构建输出确认 `DecorativeEffects` 为独立 chunk（懒加载）

- [ ] **Step 9: 提交**

```bash
git add components/LoadingScreen.tsx components/DecorativeEffects.tsx app/page.tsx tests/loading-screen.test.tsx tests/click-effect.test.tsx tests/dev-console.test.tsx tests/dynamic-title.test.tsx tests/top-progress-bar.test.tsx
git rm components/Effects.tsx
git commit -m "perf(loading): split Effects into LoadingScreen (critical) + DecorativeEffects (lazy)"
```

---

### Task 2: 大 chunk 归因审计（P0-2）

**Files:**
- Read: `.next/static/chunks/` 产物（255 与 4bd1b696 对应文件）
- Read: `components/SocialLinks.tsx`、`components/LinkTabs.tsx` 的 lucide import

- [ ] **Step 1: 确认大 chunk 归属**

Run: `Get-ChildItem '.next/static/chunks' | Sort-Object Length -Descending | Select-Object -First 8 Name, Length`，然后对前两大 chunk 执行：

```bash
Select-String -Path '.next/static/chunks/255-*.js' -Pattern 'lucide|music|weather|prisma' | Select-Object -First 3
Select-String -Path '.next/static/chunks/4bd1b696-*.js' -Pattern 'lucide|music|weather|prisma' | Select-Object -First 3
```

- [ ] **Step 2: 核查 lucide 引入方式**

Run: `Select-String -Path 'components/*.tsx','app/*.tsx' -Pattern "from ['\"]lucide-react['\"]" | Select-Object Filename, Line`
Expected: 均为具名导入（`import { Quote } from "lucide-react"` 等），无 `import * as` 或默认导入

- [ ] **Step 3: 记录结论（不强制改动）**

若 chunk 归属为 lucide 图标 + 业务代码，且均为具名导入，则 `optimizePackageImports` 已生效，记录"无需改动"；若发现整包引入，记录待修项并修复。本任务以审计结论落库为主。

- [ ] **Step 4: 提交（如无改动则跳过）**

```bash
git add -A
git commit -m "perf(loading): audit large chunks, confirm icon imports are tree-shaken" || echo "无改动"
```

---

### Task 3: 时钟 re-render 优化（P1-2）

**Files:**
- Modify: `components/ClockWeatherCapsule.tsx`

- [ ] **Step 1: 读取当前实现确认 state 结构**

Read `components/ClockWeatherCapsule.tsx` 全文（约 160 行），定位时间 state（`refresh` 1s interval）与天气 state 的声明位置。

- [ ] **Step 2: 时钟改为 ref 直写 DOM**

将时间显示改造为：`timeRef` 指向时间文本节点，1s interval 内仅 `timeRef.current.textContent = formatTime(...)`，不再 `setState` 时间字段；日期显示独立为分钟级更新（`setInterval` 30s 或随时钟 tick 但用 ref）。天气数据 state 保持不变，与时钟 tick 解耦。

实现要点：

```tsx
const timeRef = useRef<HTMLSpanElement>(null);
const dateRef = useRef<HTMLSpanElement>(null);

useEffect(() => {
  const update = () => {
    const now = new Date();
    if (timeRef.current) timeRef.current.textContent = fmtTime(now);
    if (dateRef.current) dateRef.current.textContent = fmtDate(now);
  };
  update();
  const timer = setInterval(update, 1000);
  return () => clearInterval(timer);
}, []);
```

注意：原格式化逻辑（timeFormat/showSeconds/dateFormat 配置）保留，仅将 setState 替换为 ref 写入。

- [ ] **Step 3: 运行测试 + 类型检查**

Run: `npx tsc --noEmit && npx vitest run tests/`
Expected: 通过（若存在 clock 相关测试）

- [ ] **Step 4: 提交**

```bash
git add components/ClockWeatherCapsule.tsx
git commit -m "perf(render): write clock time via ref, decouple weather card re-renders"
```

---

### Task 4: Canvas 特效性能（P2-1）

**Files:**
- Modify: `components/SeasonalEffect.tsx`
- Modify: `components/DecorativeEffects.tsx`（ClickEffect 部分）

- [ ] **Step 1: SeasonalEffect DPR 上限与暂停**

在 `components/SeasonalEffect.tsx` 中：
- 初始化 canvas 尺寸时 `const dpr = Math.min(window.devicePixelRatio || 1, 2); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);`
- 粒子数按视口面积缩放：`const count = Math.min(BASE_COUNT, Math.floor((w * h) / 20000));`（BASE_COUNT 为原默认值）
- 增加 `document.visibilitychange` 监听：页面隐藏时 `cancelAnimationFrame` 停止循环，可见时恢复

- [ ] **Step 2: ClickEffect DPR 无关（纯 DOM 动画，仅需确认无高开销）**

ClickEffect 为 DOM 粒子（非 canvas），无需 DPR 处理；确认其 `pointerdown` 监听器在 `enabled=false` 时已移除（现有实现已按 enabled 条件注册，无需改动）。

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功

- [ ] **Step 4: 提交**

```bash
git add components/SeasonalEffect.tsx
git commit -m "perf(effects): cap canvas DPR at 2, scale particle count, pause on hidden"
```

---

### Task 5: 统计代码延迟注入（P2-2）

**Files:**
- Modify: `components/ScriptInjector.tsx`

- [ ] **Step 1: 读取当前实现**

Read `components/ScriptInjector.tsx` 全文（约 30-40 行），确认 scripts 注入方式（dangerouslySetInnerHTML？）。

- [ ] **Step 2: 统计代码延迟注入**

改造：区分"统计代码"与"head 脚本"——将数组参数改为对象 `{ analytics: string; head: string }` 或保持数组但注入时：
- `headScript`（站长验证等）：挂载后立即注入（保持现状）
- `analyticsScript`（统计）：`requestIdleCallback` 注入，回退 `setTimeout(2000)`

若改 props 结构会牵连 `app/page.tsx` 调用处（`<ScriptInjector scripts={[d.analyticsScript, d.headScript]} />`），则保持数组签名，内部按"第二项为 head、第一项为 analytics"或改为 `{ analyticsScript, headScript }` 对象并同步更新 page.tsx。优先选择对象签名（语义清晰）。

- [ ] **Step 3: 运行测试 + 类型检查**

Run: `npx tsc --noEmit && npx vitest run tests/script-injector.test.tsx`
Expected: 通过（若测试断言注入时机，需同步调整）

- [ ] **Step 4: 提交**

```bash
git add components/ScriptInjector.tsx app/page.tsx
git commit -m "perf(loading): defer analytics script injection to idle time"
```

---

### Task 6: 全量验证

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 全部 PASS

- [ ] **Step 2: 类型 + Lint + 构建**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 无错误；记录 First Load JS 对比（Task 1 前的 102KB shared）

- [ ] **Step 3: 首屏 JS 对比**

Run: `npm run build 2>&1 | Select-String 'First Load JS'`
Expected: shared JS 或 page chunk 较拆分前下降（DecorativeEffects 移出首屏）

- [ ] **Step 4: 冒烟验证**

`npx next start -p 3100` 后 curl 首页：HTTP 200；HTML 包含 `LoadingScreen` 与 `DecorativeEffects` 的 lazy 标记（`__next_dynamic` 或独立 chunk 引用），加载动画逻辑正常。

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "chore(perf): final verification" || echo "无新增变更"
```

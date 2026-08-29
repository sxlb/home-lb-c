# 前端加载性能优化 设计文档

- 日期：2026-08-29
- 状态：已批准
- 涉及模块：首屏 JS 减重、渲染性能、资源加载策略

## 背景与目标

首页加载链路审计完成，数据层（Promise.all 并行）、懒加载（音乐/页脚/季节特效）、字体精简均已就绪。剩余优化空间集中在：

1. `Effects.tsx`（25.8KB）单文件耦合 6 个功能组件，`LoadingScreen` 首屏必需导致整个文件首屏加载
2. 加载动画最长等待 5s（等 window load + 壁纸就绪），弱网下遮挡 LCP
3. 时钟 1s setInterval 触发整组件 re-render（含天气卡）
4. 部分运行时/资源策略细节

目标：首屏 JS 减 15-18KB；弱网 LCP 提升 1-3s；运行时 CPU 占用下降。

## 设计决策

### P0-1: Effects.tsx 拆分（核心）

将 `components/Effects.tsx`（25.8KB，6 个功能 + 组合导出）拆分为两个文件：

1. **`components/LoadingScreen.tsx`**（新建，仅含 LoadingScreen）
   - 首屏必需：加载动画需要在页面挂载后立即执行
   - page.tsx 中改为单独 `dynamic(() => import("./LoadingScreen"), { ssr: true })`（保持预加载，动画不延迟）

2. **`components/DecorativeEffects.tsx`**（新建，含 ClickEffect / DevConsole / DynamicTitle / TopProgressBar / WelcomeNotice + 默认导出 Effects 组合）
   - 5 个装饰特效均为"开关 + 返回 null/占位"形态，合并为一个 lazy chunk
   - page.tsx 中 `dynamic(() => import("./DecorativeEffects"), { ssr: false })`：动画收起后再加载；后台全关时零下载
   - 注：ssr:false 安全——装饰特效只操作浏览器 API（事件监听/定时器），无 SSR 内容

3. 相关测试 import 路径更新：`loading-screen.test.tsx` 改从 `@/components/LoadingScreen` 导入；`click-effect.test.tsx`、`dev-console.test.tsx`、`dynamic-title.test.tsx`、`top-progress-bar.test.tsx` 改从 `@/components/DecorativeEffects` 导入

4. 删除原 `components/Effects.tsx`

预期：首屏 JS 减 15-18KB（DecorativeEffects 部分从首屏 chunk 移出）。

### P0-2: 大 chunk 归因审计

- 用 `next build` 的产物列表 + chunk 内容 grep 确认 `255`（170KB）与 `4bd1b696`（169KB）归属
- 重点核查 lucide-react 是否整包引入（SocialLinks / LinkTabs / 其他组件），确认 `lucideIconResolver` 按需解析已生效
- 若发现整包引入，改为按需 import；否则仅记录，不做无谓改动

### P1-1: LoadingScreen 与壁纸解耦

当前：最长 5s 安全兜底，等 `window load` + `background-ready` 事件。
调整：壁纸就绪条件放宽——`DOMContentLoaded` 后 2s 内壁纸未就绪也收起（保留最短展示 800ms 与 5s 绝对兜底）。
实现：在 `LoadingScreen` 中新增"宽松就绪"判定：`document.readyState === "interactive"` 后 2s 计时器，若 bgReady 未到则强制收起。
预期：弱网下 LCP 提升 1-3s，正常网络无感知。

### P1-2: 时钟 re-render 优化

当前：`ClockWeatherCapsule` 内 1s `setInterval` 更新 time state，触发整个组件（含天气卡）re-render。
优化：时间文本（时分秒）改为 `useRef` + 直接更新 DOM 节点文本（如 `<span ref={timeRef}>`），间隔 1s 只写 DOM 不触发 React re-render；日期分钟级更新保留 state（或同样 ref）。天气数据用独立 state，不受时钟 tick 影响。
实现要点：拆分"时钟"与"天气"两个子组件或两个 state 域；时钟用 ref 直写。

### P2-1: Canvas 特效性能

- `SeasonalEffect` / `ClickEffect`：DPR 上限 2（`Math.min(window.devicePixelRatio, 2)`）；粒子数按视口面积缩放；`visibilitychange` 隐藏时暂停 `requestAnimationFrame`
- 说明：SeasonalEffect 为独立 10.6KB 文件（已在懒加载列表），改动只涉内部渲染循环

### P2-2: 统计代码延迟注入

- `ScriptInjector`：`analyticsScript` 注入时机从挂载即注入改为 `requestIdleCallback`（回退 `setTimeout 2000`）后注入；`headScript`（站长验证类）保持立即注入
- 收益：不阻塞首屏交互

## 收益预估

| 指标 | 当前 | 优化后 |
|------|------|--------|
| 首屏 JS（Effects 部分） | 25.8KB | ~8KB（仅 LoadingScreen） |
| 弱网 LCP（动画遮挡） | 最长 5s | 最长 ~2s 收口 |
| 时钟 tick 渲染开销 | 整组件 1s/次 | DOM 直写 1s/次 |
| 统计代码注入 | 挂载即注入 | idle 后注入 |

## 非目标

- 字体再压缩（已是最优 woff2）
- 壁纸接口改造（依赖必应源，保持现状）
- MusicPlayer 深度拆分（已有 lazy，收益低）

## 测试

- 现有 `loading-screen` / `click-effect` / `dev-console` / `dynamic-title` / `top-progress-bar` 测试改 import 后全部通过
- `npm run typecheck`、`npm run lint`、`npm run build` 通过
- 手工验证：首页加载动画正常收起、点击粒子/动态标题/进度条/欢迎通知功能不回归、时钟每秒刷新正常

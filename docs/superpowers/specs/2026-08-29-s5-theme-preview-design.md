# 后台增强 S5：主题实时预览 设计文档

- 日期：2026-08-30
- 状态：已批准
- 涉及模块：后台主题与壁纸面板
- 关联计划：后台增强批次二（S3 + S4 + S5）

## 背景与目标

「主题与壁纸」面板调整强调色/玻璃参数时无法即时预览效果，需保存后回首页查看。目标：面板内实时预览，所见即所得。

## 设计决策

### 1. 实现方案

新建 `components/admin/ThemePreview.tsx`，接收 `accentColor / glassOpacity / glassBlur` 实时值：

- 容器内联 style 设置 CSS 变量（与 `ThemeProvider` 计算逻辑一致：hex 校验、0-80/0-40 clamp）
  - `--accent-color`、`--card-alpha`、`--glass-blur`
- 预览内容模拟前台主页卡片：深色渐变背景 + 昵称发光文字（`text-glow-accent`）+ 玻璃卡片（`card-glass`，含强调色渐变条与图标/示例文本）
- 零依赖、无新 API、纯前端

### 2. 挂载

`ThemePanel.tsx` 表单顶部挂载 `<ThemePreview accentColor={profile.accentColor} glassOpacity={profile.glassOpacity} glassBlur={profile.glassBlur} />`；滑杆/颜色输入 onChange 实时更新（useProfileForm 的 set 驱动），预览即时响应。

### 3. 文件变更

| 文件 | 操作 |
|------|------|
| `components/admin/ThemePreview.tsx` | 新建 |
| `components/admin/ThemePanel.tsx` | 修改：挂载预览 |

## 测试与验收

- 拖动玻璃不透明度/模糊滑杆、修改强调色 → 预览实时变化
- 保存后前台效果与预览一致（同 CSS 变量）
- 非法 hex 回退默认天蓝（与 ThemeProvider 一致）

## 非目标

- 前台壁纸/天气等完整复刻（仅模拟卡片质感与强调色）

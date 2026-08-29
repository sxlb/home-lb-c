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

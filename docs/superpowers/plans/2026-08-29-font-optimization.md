# 字体精简与自定义字体功能 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 精简内置字体为有爱圆体一款，并在后台提供"自定义字体"（CSS 字体名 + 开关 + 昵称/全站范围）设置，缩小容器体积、提升运行速度。

**Architecture:** 数据层在 `Profile` 新增 3 个字段（开关/字体名/范围），服务端沿用现有 zod 校验 + `/api/profile` 路由透传；前台由 Server Helper（`app/hooks.ts`）派生字体 class/family，新增轻量客户端组件 `CustomFont` 在全站范围时注入 `body` 字体；后台面板删除 19 款字体下拉，改为内置说明 + 自定义字体输入。

**Tech Stack:** Next.js 15 (App Router) / Prisma 5 + SQLite / zod / Tailwind / vitest

**设计文档:** `docs/superpowers/specs/2026-08-29-font-optimization-design.md`

---

### Task 1: Prisma Schema 与数据库迁移

**Files:**
- Modify: `prisma/schema.prisma:41-42`
- Create: `prisma/migrations/20260829000000_add_custom_font/migration.sql`
- Test: `tests/profile-schema.test.ts`

- [ ] **Step 1: 在 schema.prisma 的 Profile 模型新增 3 个字段**

在 `prisma/schema.prisma` 第 41-42 行（`logoArtFont` / `logoFont` 之后）追加：

```prisma
  customFontEnabled      Boolean  @default(false) // 自定义字体总开关
  customFontFamily       String   @default("") // 自定义字体名（CSS font-family，如 "PingFang SC"）
  customFontScope        String   @default("nickname") // 自定义字体应用范围：nickname / all
```

- [ ] **Step 2: 生成迁移 SQL（create-only 模式）**

Run: `npx prisma migrate dev --name add_custom_font --create-only`
Expected: 生成 `prisma/migrations/20260829000000_add_custom_font/migration.sql`，内容为：

```sql
-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "customFontEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Profile" ADD COLUMN "customFontFamily" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Profile" ADD COLUMN "customFontScope" TEXT NOT NULL DEFAULT 'nickname';
```

若 migrate dev 因数据库环境失败（无 dev.db），则手动创建上述目录与 SQL 文件（与现有 `20260827000000_add_must_change_password/migration.sql` 格式一致），随后用 `npx prisma generate` 刷新客户端类型。

- [ ] **Step 3: 提交**

```bash
git add prisma/schema.prisma prisma/migrations/20260829000000_add_custom_font/migration.sql
git commit -m "feat(fonts): add custom font fields to Profile schema"
```

---

### Task 2: 服务端校验（zod schema + 测试）

**Files:**
- Modify: `lib/validation.ts:171-212`
- Test: `tests/profile-schema.test.ts`

- [ ] **Step 1: 编写失败测试**

在 `tests/profile-schema.test.ts` 末尾追加：

```ts
describe("自定义字体字段", () => {
  it("默认值：开关 false、范围 nickname、字体名为空", () => {
    const result = profileSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customFontEnabled).toBe(false);
      expect(result.data.customFontFamily).toBe("");
      expect(result.data.customFontScope).toBe("nickname");
    }
  });

  it("合法字体名通过（中英文、数字、空格、引号、连字符）", () => {
    const result = profileSchema.safeParse({
      customFontEnabled: true,
      customFontFamily: '"PingFang SC", Microsoft YaHei',
      customFontScope: "all",
    });
    expect(result.success).toBe(true);
  });

  it("含危险字符的字体名被拒绝", () => {
    const result = profileSchema.safeParse({
      customFontEnabled: true,
      customFontFamily: 'Arial; url(https://evil.com/x.woff2)',
    });
    expect(result.success).toBe(false);
  });

  it("非法范围值被拒绝", () => {
    const result = profileSchema.safeParse({ customFontScope: "body" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/profile-schema.test.ts`
Expected: 4 个新用例失败（`customFontEnabled` 未定义）

- [ ] **Step 3: 在 profileSchema 中新增字段**

在 `lib/validation.ts` 第 212 行 `logoFont` 定义之后（`siteLinksTitle` 之前）插入：

```ts
  // 自定义字体（方案 A：输入 CSS 字体名，不存文件）
  customFontEnabled: z.boolean().optional().default(false),
  customFontFamily: z
    .string()
    .trim()
    .max(64, "字体名最长 64 字符")
    .refine(
      (v) => v === "" || /^[\u4e00-\u9fa5A-Za-z0-9 "'-,]+$/.test(v),
      "字体名仅支持中英文、数字、空格、引号与连字符"
    )
    .optional()
    .default(""),
  // 应用范围：nickname=仅昵称 / all=全站
  customFontScope: z
    .enum(["nickname", "all"], {
      errorMap: () => ({ message: "应用范围必须是 nickname / all" }),
    })
    .optional()
    .default("nickname"),
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/profile-schema.test.ts`
Expected: 全部用例 PASS

- [ ] **Step 5: 提交**

```bash
git add lib/validation.ts tests/profile-schema.test.ts
git commit -m "feat(fonts): validate custom font fields in profile schema"
```

---

### Task 3: /api/profile 路由透传新字段

**Files:**
- Modify: `app/api/profile/route.ts:77,147`

- [ ] **Step 1: 解构新增字段**

在 `app/api/profile/route.ts` 第 77 行 `logoFont,` 之后加入：

```ts
      customFontEnabled,
      customFontFamily,
      customFontScope,
```

- [ ] **Step 2: data 对象加入新增字段**

在 `app/api/profile/route.ts` 第 147 行 `logoFont,` 之后加入：

```ts
      customFontEnabled,
      customFontFamily,
      customFontScope,
```

- [ ] **Step 3: 提交**

```bash
git add app/api/profile/route.ts
git commit -m "feat(fonts): pass through custom font fields in profile API"
```

---

### Task 4: 后台共享类型与默认值

**Files:**
- Modify: `components/admin/profileShared.ts:31-32,93-94`

- [ ] **Step 1: ProfileShape 接口新增字段**

在 `components/admin/profileShared.ts` 第 31-32 行（`logoArtFont` / `logoFont`）之后加入：

```ts
  customFontEnabled: boolean;
  customFontFamily: string;
  customFontScope: string;
```

- [ ] **Step 2: INITIAL_PROFILE 默认值**

在 `components/admin/profileShared.ts` 第 93-94 行（`logoArtFont: true` / `logoFont: "zcool-kuail"`）之后加入：

```ts
  customFontEnabled: false,
  customFontFamily: "",
  customFontScope: "nickname",
```

- [ ] **Step 3: 提交**

```bash
git add components/admin/profileShared.ts
git commit -m "feat(fonts): add custom font fields to admin shared types"
```

---

### Task 5: 后台面板 UI（ProfilePanel）

**Files:**
- Modify: `components/admin/ProfilePanel.tsx:37-38,97-98,164-185,353-399`

- [ ] **Step 1: 类型与默认值**

在 `components/admin/ProfilePanel.tsx` 第 37-38 行（`logoArtFont: boolean;` / `logoFont: string;`）后加入：

```ts
  customFontEnabled: boolean;
  customFontFamily: string;
  customFontScope: string;
```

在第 97-98 行（`logoArtFont: true,` / `logoFont: "zcool-kuail",`）后加入：

```ts
  customFontEnabled: false,
  customFontFamily: "",
  customFontScope: "nickname",
```

- [ ] **Step 2: 删除 19 款字体常量数组**

删除 `components/admin/ProfilePanel.tsx` 第 164-185 行的 `LOGO_FONTS` 数组（含注释）。

- [ ] **Step 3: 重写字体设置区**

将第 384-399 行的"艺术字体样式"下拉 `<Label htmlFor="logoFont">艺术字体样式</Label>` + `<select id="logoFont" ...>` 整块替换为：

```tsx
                  <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">
                      内置艺术字体：有爱圆体（中英双语），随镜像打包
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-input bg-background/50 px-3 py-2.5 transition-colors hover:bg-muted/30" htmlFor="customFontEnabled">
                      <span>
                        <span className="block text-sm font-medium">自定义字体</span>
                        <span className="block text-xs text-muted-foreground">输入系统/网络字体名，无需重新构建</span>
                      </span>
                      <input
                        type="checkbox"
                        id="customFontEnabled"
                        name="customFontEnabled"
                        className="h-4 w-4 accent-primary"
                        checked={profile.customFontEnabled}
                        onChange={(e) => set("customFontEnabled", e.target.checked)}
                      />
                    </label>

                    {profile.customFontEnabled && (
                      <>
                        <div>
                          <Label htmlFor="customFontFamily">字体名称（CSS font-family）</Label>
                          <input
                            id="customFontFamily"
                            name="customFontFamily"
                            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            placeholder='如 "PingFang SC"、Microsoft YaHei'
                            value={profile.customFontFamily}
                            onChange={(e) => set("customFontFamily", e.target.value)}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            仅支持中英文、数字、空格、引号与连字符；浏览器无此字体时自动回退思源黑体
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="customFontScope">应用范围</Label>
                          <select
                            id="customFontScope"
                            name="customFontScope"
                            className={selectClass}
                            value={profile.customFontScope}
                            onChange={(e) => set("customFontScope", e.target.value)}
                          >
                            <option value="nickname">仅昵称</option>
                            <option value="all">全站</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
```

注：`selectClass` 已在文件顶部定义（第 188-189 行），`set` 为现有状态更新函数，直接复用。

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 5: 提交**

```bash
git add components/admin/ProfilePanel.tsx
git commit -m "feat(fonts): replace font picker with builtin note + custom font settings"
```

---

### Task 6: 前台 Server Helper 字体派生逻辑

**Files:**
- Modify: `app/hooks.ts:13-33,233-235`

- [ ] **Step 1: 精简 LOGO_FONT_CLASS 映射为仅有爱圆体**

将 `app/hooks.ts` 第 13-33 行的 `LOGO_FONT_CLASS` 替换为：

```ts
// ── 静态常量：内置艺术字体映射（仅保留有爱圆体，其余字体已随瘦身移除） ──
const LOGO_FONT_CLASS: Record<string, string> = {
  "nowar-rounded": "font-art-nowar",
};
```

- [ ] **Step 2: 更新 logoFontClass 派生逻辑**

将 `app/hooks.ts` 第 233-235 行替换为：

```ts
    logoFontClass: (profile?.logoArtFont ?? true)
      ? (LOGO_FONT_CLASS[profile?.logoFont || "nowar-rounded"] || "font-art-nowar")
      : "font-bold",
    // 自定义字体（仅范围=昵称时注入到昵称元素；范围=全站时由 CustomFont 组件注入 body）
    logoFontFamily: (profile?.customFontEnabled && profile?.customFontFamily?.trim())
      ? `"${profile.customFontFamily.trim()}", var(--font-noto-sc), var(--font-inter), sans-serif`
      : undefined,
    // 自定义字体配置透传（供 CustomFont 组件使用）
    customFontEnabled: profile?.customFontEnabled ?? false,
    customFontFamily: profile?.customFontFamily || "",
    customFontScope: profile?.customFontScope || "nickname",
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 4: 提交**

```bash
git add app/hooks.ts
git commit -m "feat(fonts): derive custom font family in page helper"
```

---

### Task 7: 前台渲染（CustomFont 组件 + 页面 + LogoFontLoader + layout）

**Files:**
- Create: `components/CustomFont.tsx`
- Modify: `app/page.tsx:111-115`
- Modify: `components/LogoFontLoader.tsx:5-10,76-85`
- Modify: `app/layout.tsx:6,13-34,53-60`
- Delete: `components/ArtFontsLoader.tsx`

- [ ] **Step 1: 创建 CustomFont 组件**

创建 `components/CustomFont.tsx`：

```tsx
"use client";

import { useEffect } from "react";

interface Props {
  enabled: boolean;
  family: string;
  scope: string;
}

/**
 * 自定义字体应用组件（范围=全站时生效）。
 * 直接注入 body 的 font-family，缺失字形自动回退思源黑体；
 * 范围=昵称时无需本组件，由页面昵称元素的 logoFontFamily 内联样式处理。
 */
export default function CustomFont({ enabled, family, scope }: Props) {
  useEffect(() => {
    const clean = family.trim();
    if (!enabled || !clean || scope !== "all") return;
    document.body.style.fontFamily = `"${clean}", var(--font-noto-sc), var(--font-inter), sans-serif`;
  }, [enabled, family, scope]);

  return null;
}
```

- [ ] **Step 2: 页面接入 CustomFont 并支持昵称内联字体**

在 `app/page.tsx` 第 111-115 行，将 h1 与 LogoFontLoader 改为：

```tsx
                  <h1 className={`${d.logoFontClass} text-glow-accent leading-none tracking-tight truncate logo-title`}>
                    <span
                      className="text-[28px] leading-none sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl"
                      style={d.logoFontFamily ? { fontFamily: d.logoFontFamily } : undefined}
                    >
                      <LogoFontLoader text={d.nickname} fontClass={d.logoFontClass} fontFamily={d.logoFontFamily} />
                    </span>
                  </h1>
```

在页面组件内合适位置（如 `<Background ... />` 附近）加入：

```tsx
        <CustomFont enabled={d.customFontEnabled} family={d.customFontFamily} scope={d.customFontScope} />
```

并在文件顶部 import：`import CustomFont from "@/components/CustomFont";`

- [ ] **Step 3: LogoFontLoader 支持 fontFamily**

修改 `components/LogoFontLoader.tsx`：

```tsx
interface Props {
  /** 昵称文本（用于预热对应字形的 unicode-range 分片） */
  text: string;
  /** 当前艺术字体 CSS 工具类（如 font-art-nowar，与 globals.css 定义对应） */
  fontClass: string;
  /** 自定义字体 font-family（可选；提供时优先于 fontClass 生效） */
  fontFamily?: string;
}
```

探针元素与昵称本体 span 改为同时应用 class 与可选内联字体：

```tsx
      <span
        ref={probeRef}
        aria-hidden
        className={`${fontClass} absolute h-px w-px overflow-hidden`}
        style={{ visibility: "hidden", ...(fontFamily ? { fontFamily } : {}) }}
      >
        {text}
      </span>
      <span
        className={`logo-font-fade ${ready ? "logo-font-ready" : ""}`}
        style={fontFamily ? { fontFamily } : undefined}
      >
        {text}
      </span>
```

- [ ] **Step 4: 精简 layout.tsx 字体加载**

将 `app/layout.tsx` 第 13-34 行（Google 8 种 + 有爱圆体 + Baloo2 声明）替换为仅保留有爱圆体与 Baloo2：

```tsx
// ===== 昵称内置艺术字体：有爱圆体(中文) + Baloo 2(西文)，中英双语 =====
const nowarRounded = localFont({
  src: [
    { path: "../public/fonts/nowar-rounded/NowarRounded-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/nowar-rounded/NowarRounded-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-nowar",
  display: "swap",
  preload: false,
});
const baloo2 = localFont({ src: [{ path: "../public/fonts/nowar-rounded/Baloo2-Variable.woff2", weight: "400", style: "normal" }], variable: "--font-baloo", display: "swap", preload: false });
```

同时：
- 删除第 6 行 `import ArtFontsLoader from "@/components/ArtFontsLoader";`
- body className（第 53-54 行）删掉 `maShanZheng.variable` 等已移除变量，仅保留：`${notoSc.variable} ${inter.variable} ${techMono.variable} ${baloo2.variable} ${nowarRounded.variable}`
- 删除第 60 行 `<ArtFontsLoader />`

- [ ] **Step 5: 删除 ArtFontsLoader 组件**

删除文件 `components/ArtFontsLoader.tsx`。

- [ ] **Step 6: 类型检查 + 构建验证**

Run: `npx tsc --noEmit && npm run build`
Expected: 均成功

- [ ] **Step 7: 提交**

```bash
git add components/CustomFont.tsx app/page.tsx components/LogoFontLoader.tsx app/layout.tsx
git rm components/ArtFontsLoader.tsx
git commit -m "feat(fonts): apply custom font to nickname/site, remove split-font loader"
```

---

### Task 8: 清理字体文件与 globals.css

**Files:**
- Delete: `public/fonts/google-local/` 下 8 个多余字体（保留 noto-sc/inter/tech-mono）
- Delete: `public/fonts/cn-fontsource-*/` 8 个目录
- Delete: `public/fonts/smiley-sans.woff2`、`public/fonts/maoken-sans.otf`（若存在）
- Modify: `app/globals.css:5-19,227-280`

- [ ] **Step 1: 删除多余字体文件**

先确认 `public/fonts` 根目录是否有 smiley-sans/maoken-sans 文件（`ls public/fonts`），然后删除：

```bash
# google-local 保留 font-noto-sc / font-inter / font-tech-mono
Remove-Item 'public/fonts/google-local/font-ma-shan.woff2','public/fonts/google-local/font-zcool.woff2','public/fonts/google-local/font-long-cang.woff2','public/fonts/google-local/font-zcool-xw.woff2','public/fonts/google-local/font-zcool-qk.woff2','public/fonts/google-local/font-liu-jian.woff2','public/fonts/google-local/font-zhi-mang.woff2','public/fonts/google-local/font-noto-serif-sc.woff2' -ErrorAction SilentlyContinue
Remove-Item 'public/fonts/cn-fontsource-alimama-dong-fang-da-kai-regular','public/fonts/cn-fontsource-ding-talk-jin-bu-ti-regular','public/fonts/cn-fontsource-hongleixingshu-regular','public/fonts/cn-fontsource-lxgw-wen-kai-screen','public/fonts/cn-fontsource-slidefu-regular','public/fonts/cn-fontsource-slideqiuhong-regular','public/fonts/cn-fontsource-xiaolai-sc-regular','public/fonts/cn-fontsource-yozai-medium' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'public/fonts/smiley-sans.woff2','public/fonts/maoken-sans.otf' -ErrorAction SilentlyContinue
```

- [ ] **Step 2: 清理 globals.css 字体定义**

删除 `app/globals.css` 第 5-19 行（SmileySans / MaokenSans 两个 @font-face 块），并删除第 227-280 行中除 `.font-art-nowar` 外的所有 `.font-art-*` 类，仅保留：

```css
  .font-art-nowar {
    font-family: var(--font-baloo), var(--font-nowar), var(--font-noto-sc), sans-serif;
  }
```

- [ ] **Step 3: 验证构建并确认体积收益**

Run: `npm run build`
Expected: 成功；`public/fonts` 总大小从 ~55MB 降至 ~4.7MB（noto-sc 1.08MB + inter 24KB + tech-mono 13KB + nowar 1.23MB + baloo 33KB + google-local 保留 3 个 + nowar-rounded）

- [ ] **Step 4: 提交**

```bash
git add -A public/fonts app/globals.css
git commit -m "perf(fonts): remove 14 unused fonts (~50MB), keep builtin nowar-rounded only"
```

---

### Task 9: 全量验证

- [ ] **Step 1: 运行全部测试**

Run: `npx vitest run`
Expected: 全部 PASS（含新增自定义字体用例）

- [ ] **Step 2: 类型检查 + Lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 无错误

- [ ] **Step 3: 生产构建**

Run: `npm run build`
Expected: 成功，无字体构建错误

- [ ] **Step 4: 手工验证清单**

1. `npm run dev` 启动后访问首页：昵称显示有爱圆体，无 FOUT 闪烁
2. 后台「站点信息」：自定义字体开关关闭时仅显示内置说明
3. 开启自定义字体 + 范围=昵称 + 填 `"PingFang SC"`：昵称切换为该字体（无此字体的 Windows 上回退思源黑体）
4. 范围=全站：body 字体切换，卡片正文同步变化
5. 填入 `Arial; url(...)`：保存被拒并提示校验错误
6. 关闭开关：页面恢复正常默认字体

- [ ] **Step 5: 最终提交（如有遗漏变更）**

```bash
git add -A
git commit -m "chore(fonts): final cleanup and verification" || echo "无新增变更"
```

---

## 部署后续（不在本计划内）

- 本地构建镜像验证体积：`docker build -t home-lb:latest .` 观察镜像从 544MB 下降
- 服务器端更新：`docker compose up -d --build`（触发迁移自动执行）

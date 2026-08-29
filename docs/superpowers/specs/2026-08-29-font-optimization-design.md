# 字体精简与自定义字体设计文档

- 日期：2026-08-29
- 状态：已批准
- 涉及模块：数据模型、后台管理面板、前端字体加载、字体资源、Docker 镜像

## 背景与目标

当前项目内置 19 款昵称艺术字体（含 8 款 fontsource 分片字体），总占用约 55MB，是容器镜像体积的主要来源之一，且页面挂载后需串行注入 8 个 font.css 样式表，拖慢运行速度。

目标：
1. 只保留 1 款内置字体（有爱圆体 NowarRounded），精简容器与构建产物
2. 后台提供"自定义字体"设置项（方案 A：输入 CSS 字体名，不上传文件）与开关、应用范围
3. 优化容器体积与站点运行速度

## 设计决策

### 数据模型（Prisma Profile 新增字段）

```prisma
customFontEnabled Boolean @default(false)  // 自定义字体总开关
customFontFamily  String  @default("")     // 自定义字体名（CSS font-family）
customFontScope   String  @default("nickname") // 应用范围：nickname / all
```

- 保留现有 `logoArtFont`（内置艺术字体开关）与 `logoFont`（兼容字段，不再提供选择 UI，渲染固定有爱圆体）
- 默认值保证老站点迁移无感

### 后台 UI（ProfilePanel 字体设置区）

重新组织为三行：
1. **艺术字体显示**（保留现有开关）：昵称使用内置有爱圆体
2. **自定义字体**（新开关）：启用后显示
   - 字体名称输入框：CSS font-family 名，防注入校验（仅允许中英文、数字、空格、引号、连字符）
   - 应用范围下拉：`昵称` / `全站`
3. 删除 19 款字体下拉选择器，改为说明文字"内置艺术字体：有爱圆体"

### 前端应用逻辑

- `app/layout.tsx`：只保留 `notoSc`、`inter`、`techMono`、`nowarRounded`、`baloo2` 五个 localFont，删除其余 14 个
- `components/ArtFontsLoader.tsx`：删除（8 个分片字体不再需要）
- 新增 `components/CustomFont.tsx`：
  - 读取 profile 配置（通过现有 profile 数据接口）
  - 范围=all 时向 `body` 注入自定义 font-family
  - 范围=nickname 时仅作用于昵称元素
  - 未启用或字体名无效时无副作用
- `components/LogoFontLoader.tsx`：`fontClass` 动态化——自定义字体启用（范围=nickname）时传自定义字体名，否则传内置有爱圆体类
- 回退策略：自定义字体缺失字形时回退 `var(--font-noto-sc)`，保证可读性

### 字体文件清理

删除约 53MB：
- `public/fonts/google-local/`：保留 `font-noto-sc`、`font-inter`、`font-tech-mono`，删除其余 7 个
- `public/fonts/cn-fontsource-*/`：8 个目录全删（约 51MB）
- `public/fonts/nowar-rounded/`：保留（有爱圆体 + Baloo2）
- `app/globals.css`：删除除 `.font-art-nowar` 外的 `.font-art-*` 类，及 SmileySans / MaokenSans 的 @font-face

### 容器与性能收益

| 指标 | 现状 | 优化后 |
|------|------|--------|
| 镜像体积 | 544MB | 预计 <490MB |
| 首屏 | 串行注入 8 个 font.css | 零额外注入 |
| 构建 | 打包 19 款字体 | 只打包 5 款 |
| 请求数 | 最多 8 个字体样式请求 | 0 个额外请求 |

### 数据库迁移

- 新增 migration：`20260829000000_add_custom_font/`，添加 3 个字段（带默认值）
- 老数据兼容：`logoFont` 字段保留，渲染固定有爱圆体

## 测试

- `npm run typecheck`：类型检查通过
- `npm run test`：现有 vitest 测试通过（含 profile-schema.test.ts）
- 手工验证：后台开启自定义字体（昵称/全站两种范围）、关闭开关、非法字体名回退

## 非目标（后续评估）

- 上传型自定义字体（方案 B）：需要文件存储、格式校验，后续单独评估

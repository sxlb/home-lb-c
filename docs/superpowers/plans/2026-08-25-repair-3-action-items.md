# 修复执行计划：数据库一致性 / 变更检测 / 信任边界加固

> **For agentic workers:** REQUIRED SUB-SKILL: 按本计划逐任务执行，每个任务完成后运行对应命令并提交。步骤使用复选框（`- [ ]`）跟踪。

**Goal:** 修复此前审查发现的 3 项关键问题——补齐缺失的数据库迁移列、重构 Profile 变更检测与字段同步、加固 IP 限流/登录限流/部署密钥/外链与脚本注入等信任边界。

**Architecture:** 分为 3 个行动项共 9 个任务。行动 1 是纯数据库迁移（优先、独立）；行动 2 在 `lib/server.ts` 抽出依赖 schema 的字段清单与变更检测函数，供 `diffProfile`、`diffLinks` 与 `/api/profile` 复用；行动 3 分散在 `lib/server.ts`、`app/api/account`、两套 deploy 脚本与两个前端组件。每个任务先写/改测试或先改被测纯函数，通过 `vitest` 与 `tsc` 验证后再提交。

**Tech Stack:** Next.js 15（App Router）、Prisma 5 + SQLite、TypeScript、NextAuth v4、vitest、zod

---

## 本次变更涉及的文件总览

| 文件 | 动作 | 职责 |
|------|------|------|
| `prisma/migrations/20260825000000_add_missing_profile_columns/migration.sql` | 新建 | 补齐 3 个缺失列 |
| `lib/server.ts` | 修改 | 字段清单动态化、密钥脱敏、`getChangedProfileFields`、`diffLinks` 改名、`getClientIp` 校验 |
| `lib/validation.ts` | 只读（作为字段源） | 无改动 |
| `app/api/profile/route.ts` | 修改 | 无变化时跳过写库 |
| `app/api/account/route.ts` | 修改 | 限流 key 与登录联动 |
| `.env.deploy.example` | 修改 | 占位符改为 `__GENERATE_RANDOM_KEY__` |
| `deploy.sh` / `deploy.ps1` | 修改 | 密钥检测同时识别新旧占位符 |
| `components/LinkTabs.tsx` | 修改 | 外链 `noopener,noreferrer` |
| `components/ScriptInjector.tsx` | 修改 | 注入属性净化 |
| `tests/profile-diff.test.ts`、`tests/diff-links.test.ts`、`tests/client-ip.test.ts` | 新建 | 单元测试 |
| `tests/links-schema.test.ts` | 只读 | 参考现有测试风格 |

**通用验证命令**（每个任务用到的子集）：
```bash
npx tsc --noEmit
npx vitest run tests/<文件>.test.ts
npx eslint .
```

---

# 行动 1（P0）：补齐缺失的数据库迁移列

> 背景：`amapSecretKey`、`txWeatherSk`、`iconfontUrl` 已在 `prisma/schema.prisma` 中声明并被代码使用，但所有 migration 都未创建这几列。本地 `dev.db` 因用过 `prisma db push` 而含有这些列，掩盖了问题；生产/新环境走 `prisma migrate deploy` 会缺列导致功能异常。**必须先做、独立交付。**

### Task 1: 创建迁移并同步本地/生产数据库

**Files:**
- Create: `prisma/migrations/20260825000000_add_missing_profile_columns/migration.sql`

- [ ] **Step 1: 创建迁移 SQL 文件**

`prisma/migrations/20260825000000_add_missing_profile_columns/migration.sql`：
```sql
-- 补齐此前仅存在于 schema（本地 dev.db 经 db push 应用过）而缺失于迁移历史的字段。
-- 修复：amapSecretKey / txWeatherSk / iconfontUrl 在生产 migrate deploy 后缺列的问题。
ALTER TABLE "Profile" ADD COLUMN "amapSecretKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Profile" ADD COLUMN "txWeatherSk" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Profile" ADD COLUMN "iconfontUrl" TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 2: 校验迁移文件能被 Prisma 识别**

运行：`npx prisma migrate status`
预期：输出中列出 `20260825000000_add_missing_profile_columns` 为 "Not yet applied"（本地 `dev.db` 因已有列，可用 Step 3 标记为已应用；若状态显示 "migration failed / drift"，按 Step 3 处理）。

- [ ] **Step 3: 对已含列的本地 dev.db 标记迁移已应用（不回跑 SQL，以免重复建列报错）**

运行：`npx prisma migrate resolve --applied 20260825000000_add_missing_profile_columns`
预期：无报错，Prisma 仅将其记入 `_prisma_migrations`，不执行 SQL。
前提：确认当前 `dev.db`（`prisma/dev.db`）确实已含这三列（本地应用此前基于 db push 的 schema 已具备）。**若你希望全新重建本地库可跳过本步**，直接 `npx prisma migrate reset --force && npm run db:seed`，让全部迁移（含本新迁移）完整回放。

- [ ] **Step 4: 确认迁移状态与构建可用**

运行：`npx prisma migrate status`
预期：`Database schema is up to date!`
运行：`npx tsc --noEmit`
预期：通过（无输出）。

- [ ] **Step 5: 全新/生产库验证（可选但推荐，在临时空库执行）**

```bash
DATABASE_URL="file:./_verify.db" npx prisma migrate deploy
```
预期：依次回放所有迁移，最后应用 `..._add_missing_profile_columns`，无 "duplicate column" 错误；随后删除 `_verify.db`。

- [ ] **Step 6: 提交**

```bash
git add prisma/migrations/20260825000000_add_missing_profile_columns/
git commit -m "fix(db): 补齐 amapSecretKey/txWeatherSk/iconfontUrl 缺失迁移"
```

---

# 行动 2（P1）：重构 Profile 变更检测与字段同步

### Task 2: 字段清单动态化 + 敏感字段脱敏（`lib/server.ts`）

**Files:**
- Modify: `lib/server.ts`（在顶部增加 import；替换 `diffProfile`；新增 `getChangedProfileFields`）
- Test: Create `tests/profile-diff.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/profile-diff.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { profileSchema } from "@/lib/validation";
import { getChangedProfileFields, diffProfile } from "@/lib/server";

describe("getChangedProfileFields（基于 profileSchema 派生的字段清单）", () => {
  it("能识别此前被 diffProfile 漏掉的 friendLinksTitle 与 iconfontUrl", () => {
    const before = { friendLinksTitle: "友情链接", iconfontUrl: "" };
    const after = { friendLinksTitle: "友链", iconfontUrl: "https://at.alicdn.com/x.js" };
    expect(getChangedProfileFields(before, after)).toContain("friendLinksTitle");
    expect(getChangedProfileFields(before, after)).toContain("iconfontUrl");
  });

  it("无变化时返回空数组", () => {
    const base = { nickname: "无名", bio: "" };
    expect(getChangedProfileFields(base, { ...base })).toEqual([]);
  });

  it("字段清单与 profileSchema.shape 键集合一致（不再手工维护）", () => {
    const schemaKeys = Object.keys(profileSchema.shape);
    // 用全套默认值便于比对
    const all = schemaKeys.reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = "";
      return acc;
    }, {});
    const changed = getChangedProfileFields(all, { ...all, nickname: "新名" });
    expect(changed).toEqual(["nickname"]);
  });
});

describe("diffProfile（敏感字段脱敏）", () => {
  it("amapSecretKey / txWeatherSk 不会把真实值写入日志 detail", () => {
    const { detail } = diffProfile(
      { amapSecretKey: "", txWeatherSk: "", nickname: "a" },
      { amapSecretKey: "SECRET_AMAP", txWeatherSk: "SECRET_TX", nickname: "a" }
    );
    expect(detail).not.toContain("SECRET_AMAP");
    expect(detail).not.toContain("SECRET_TX");
    expect(detail).toContain("已配置");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

运行：`npx vitest run tests/profile-diff.test.ts`
预期：FAIL——`getChangedProfileFields` 尚未定义（import 报错）。

- [ ] **Step 3: 实现（`lib/server.ts`）**

在文件顶部 import 区增加：
```ts
import { profileSchema } from "@/lib/validation";
```

新增常量与函数（放在 `diffProfile` 之前）：
```ts
// 从 profileSchema 派生字段清单，避免手工维护与 schema 漂移
const PROFILE_FIELDS = Object.keys(profileSchema.shape);
// 敏感字段：日志中仅记录"已配置/未配置"，不记录真实值
const SENSITIVE_PROFILE_FIELDS = new Set(["amapSecretKey", "txWeatherSk"]);

/** 返回实际发生变化（旧值≠新值）的 Profile 字段名列表 */
export function getChangedProfileFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  return PROFILE_FIELDS.filter((f) => (before[f] ?? "") !== (after[f] ?? ""));
}
```

将原 `diffProfile`（第 184–255 行）整体替换为：
```ts
export function diffProfile(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { summary: string; detail: string } {
  const changed = getChangedProfileFields(before, after);
  if (changed.length === 0) return { summary: "无变化", detail: "{}" };

  const detail = JSON.stringify(
    changed.reduce<Record<string, unknown>>((acc, f) => {
      if (SENSITIVE_PROFILE_FIELDS.has(f)) {
        acc[f] = { from: before[f] ? "已配置" : "未配置", to: after[f] ? "已配置" : "未配置" };
      } else {
        acc[f] = { from: before[f] ?? "", to: after[f] ?? "" };
      }
      return acc;
    }, {})
  );
  return { summary: `修改字段：${changed.join("、")}`, detail };
}
```

- [ ] **Step 4: 运行测试确认通过**

运行：`npx vitest run tests/profile-diff.test.ts`
预期：PASS（3 组 describe 全绿）。

- [ ] **Step 5: 全量校验**

运行：`npx tsc --noEmit && npx vitest run && npx eslint lib/server.ts`
预期：全部通过。

- [ ] **Step 6: 提交**

```bash
git add lib/server.ts tests/profile-diff.test.ts
git commit -m "refactor(profile): 字段清单由 schema 派生，日志脱敏敏感密钥"
```

### Task 3: `/api/profile` 无变化时跳过写库

**Files:**
- Modify: `app/api/profile/route.ts`

- [ ] **Step 1: 修改 PUT（避免每次保存刷新 updatedAt）**

在 `app/api/profile/route.ts` 顶部 import 区（第 4 行）加入 `getChangedProfileFields`：
```ts
import { writeOperationLog, getClientIp, diffProfile, getChangedProfileFields, internalError, error, requireSession, parseJsonBody, formatZodError } from "@/lib/server";
```

在 `const existing = await prisma.profile.findFirst(...)`（第 101 行）之后、构建 `data`（第 102 行）之前，插入变更检测与提前返回：
```ts
    // 单例模型：使用 upsert 防止并发创建多条记录
    const existing = await prisma.profile.findFirst({ orderBy: { id: "asc" } });
    const before = (existing as Record<string, unknown>) || {};
    const after = parsed.data as unknown as Record<string, unknown>;

    // 没有任何字段变化时跳过写库，避免每次保存都刷新 updatedAt/写日志
    if (existing && getChangedProfileFields(before, after).length === 0) {
      return NextResponse.json(existing);
    }

    const data = { ... };
```

将下方日志调用改为复用 `before`/`after`（替换第 167–169 行的内联参数）：
```ts
    const { summary, detail } = diffProfile(before, after);
```

- [ ] **Step 2: 校验**

运行：`npx tsc --noEmit && npx eslint app/api/profile/route.ts && npx vitest run`
预期：全部通过（该逻辑核心判定已由 Task 2 的纯函数测试覆盖；此处为薄层接线）。

- [ ] **Step 3: 提交**

```bash
git add app/api/profile/route.ts
git commit -m "feat(profile): 字段无变化时跳过写库，避免无意义地刷新 updatedAt"
```

### Task 4: `diffLinks` 识别重命名（`lib/server.ts`）

**Files:**
- Modify: `lib/server.ts`
- Test: Create `tests/diff-links.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/diff-links.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { diffLinks, type LinkItem } from "@/lib/server";

const mk = (name: string, extra: Partial<LinkItem> = {}): LinkItem => ({
  name,
  icon: "link",
  url: "https://a.com",
  tip: "",
  description: "",
  sort: 0,
  ...extra,
});

describe("diffLinks（重命名识别）", () => {
  it("仅改名时归为『重命名』而非『删除+新增』", () => {
    const before = [mk("旧名")];
    const after = [mk("新名")];
    const { summary, detail } = diffLinks(before, after);
    expect(summary).toContain("重命名 1 条");
    expect(summary).not.toContain("新增");
    expect(summary).not.toContain("删除");
    expect(detail).toContain("新名");
  });

  it("真正的新增/删除/修改仍被正常识别", () => {
    const before = [mk("keep"), mk("del")];
    const after = [mk("keep", { sort: 3 }), mk("add")];
    const { summary } = diffLinks(before, after);
    expect(summary).toContain("删除 1 条");
    expect(summary).toContain("新增 1 条");
    expect(summary).toContain("修改 1 条");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

运行：`npx vitest run tests/diff-links.test.ts`
预期：FAIL——当前 `diffLinks` 将改名判为删+增，`summary` 不包含"重命名"。

- [ ] **Step 3: 实现（`lib/server.ts`）**

将 `diffLinks`（第 126–177 行）整体替换为：
```ts
const LINK_KEYS = ["icon", "url", "tip", "description", "sort"] as const;
const linkValue = (l: LinkItem, k: (typeof LINK_KEYS)[number]) => l[k];

function linksEqualExceptName(a: LinkItem, b: LinkItem): boolean {
  return LINK_KEYS.every((k) => linkValue(a, k) === linkValue(b, k));
}

export function diffLinks(
  before: LinkItem[],
  after: LinkItem[]
): { summary: string; detail: string } {
  const beforeMap = new Map(before.map((b) => [b.name, b]));
  const afterMap = new Map(after.map((a) => [a.name, a]));

  const added: LinkItem[] = [];
  const removed: LinkItem[] = [];
  const modified: { before: LinkItem; after: LinkItem }[] = [];
  const renamed: { before: LinkItem; after: LinkItem }[] = [];

  after.forEach((a) => {
    if (!beforeMap.has(a.name)) added.push(a);
  });
  before.forEach((b) => {
    if (!afterMap.has(b.name)) removed.push(b);
  });

  // 重命名识别：被删条目与新增条目除 name 外字段全等 → 视为一次重命名，而非删+增
  for (const r of [...removed]) {
    const idx = added.findIndex((a) => a.name !== r.name && linksEqualExceptName(a, r));
    if (idx >= 0) {
      renamed.push({ before: r, after: added[idx] });
      removed.splice(removed.indexOf(r), 1);
      added.splice(idx, 1);
    }
  }

  // 修改识别：name 未变，仅比较其它字段
  before.forEach((b) => {
    const a = afterMap.get(b.name);
    if (a && b.name === a.name && !linksEqualExceptName(a, b)) {
      modified.push({ before: b, after: a });
    }
  });

  const parts: string[] = [];
  if (renamed.length) parts.push(`重命名 ${renamed.length} 条`);
  if (added.length) parts.push(`新增 ${added.length} 条`);
  if (removed.length) parts.push(`删除 ${removed.length} 条`);
  if (modified.length) parts.push(`修改 ${modified.length} 条`);
  const summary = parts.length ? parts.join("，") : "无变化";

  const detail = JSON.stringify({
    added: added.map((a) => ({ name: a.name, icon: a.icon, url: a.url })),
    removed: removed.map((r) => ({ name: r.name })),
    renamed: renamed.map((r) => ({
      from: r.before.name,
      to: r.after.name,
    })),
    modified: modified.map((m) => ({
      name: m.before.name,
      changed: LINK_KEYS.reduce<Record<string, unknown>>((acc, key) => {
        if (linkValue(m.before, key) !== linkValue(m.after, key)) {
          acc[key] = { from: linkValue(m.before, key), to: linkValue(m.after, key) };
        }
        return acc;
      }, {}),
    })),
  });

  return { summary, detail };
}
```

> 说明：`LinkItem` 已在 `lib/server.ts:84-92` 定义，无需新增导出（测试已用 `import { type LinkItem } from "@/lib/server"`）。

- [ ] **Step 4: 运行测试确认通过**

运行：`npx vitest run tests/diff-links.test.ts`
预期：PASS。

- [ ] **Step 5: 全量校验**

运行：`npx tsc --noEmit && npx vitest run && npx eslint lib/server.ts`
预期：全部通过（需确认 test 文件命名不冲突重复执行）。

- [ ] **Step 6: 提交**

```bash
git add lib/server.ts tests/diff-links.test.ts
git commit -m "fix(links): 识别链接重命名，避免被误判为删除+新增"
```

---

# 行动 3（P1 + P2）：加固信任边界

### Task 5: `getClientIp` 校验 IP 格式（`lib/server.ts`）

**Files:**
- Modify: `lib/server.ts`
- Test: Create `tests/client-ip.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/client-ip.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp, isValidIp } from "@/lib/server";

describe("isValidIp（IPv4/IPv6 校验）", () => {
  it("接受合法 IPv4 / IPv6", () => {
    expect(isValidIp("127.0.0.1")).toBe(true);
    expect(isValidIp("2001:db8::1")).toBe(true);
  });
  it("拒绝越界段、非法字符与超长", () => {
    expect(isValidIp("999.1.1.1")).toBe(false);
    expect(isValidIp("evil<script>")).toBe(false);
    expect(isValidIp("a".repeat(100))).toBe(false);
  });
  it("空值返回 false", () => {
    expect(isValidIp("")).toBe(false);
  });
});

describe("getClientIp（来自请求头，非法被丢弃）", () => {
  it("合法 x-forwarded-for 取第一个值", () => {
    const req = new NextRequest("http://localhost/api/x", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });
  it("非法 x-forwarded-for 回退 x-real-ip", () => {
    const req = new NextRequest("http://localhost/api/x", {
      headers: { "x-forwarded-for": "not-an-ip", "x-real-ip": "198.51.100.7" },
    });
    expect(getClientIp(req)).toBe("198.51.100.7");
  });
  it("全部非法时返回空串", () => {
    const req = new NextRequest("http://localhost/api/x", {
      headers: { "x-forwarded-for": "hacker" },
    });
    expect(getClientIp(req)).toBe("");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

运行：`npx vitest run tests/client-ip.test.ts`
预期：FAIL——`isValidIp` 未定义；`getClientIp` 不校验直接透传。

- [ ] **Step 3: 实现（`lib/server.ts`）**

替换 `getClientIp`（第 116–120 行）并新增 `isValidIp`：
```ts
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

/** 校验 IP：IPv4 校验各段值域，IPv6 做宽松字符+长度校验 */
export function isValidIp(ip: string): boolean {
  if (!ip || ip.length > 45) return false;
  if (IPV4_RE.test(ip)) return ip.split(".").every((n) => Number(n) <= 255);
  return IPV6_RE.test(ip);
}

/** 从请求头提取客户端 IP（仅接受合法格式，丢弃伪造/非法值） */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (isValidIp(first)) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) {
    const realTrim = real.trim();
    if (isValidIp(realTrim)) return realTrim;
  }
  return "";
}
```

> 说明：`app/api/weather/route.ts` 中本地 `sanitizeIp` 仍可保留（输入已先经 `getClientIp` 净化，冗余无害）；`stats` / `account` 直接使用 `getClientIp`，自动获益。

- [ ] **Step 4: 运行测试确认通过**

运行：`npx vitest run tests/client-ip.test.ts`
预期：PASS。

- [ ] **Step 5: 全量校验**

运行：`npx tsc --noEmit && npx vitest run && npx eslint lib/server.ts`
预期：通过。

- [ ] **Step 6: 提交**

```bash
git add lib/server.ts tests/client-ip.test.ts
git commit -m "fix(ip): getClientIp 仅接受合法 IPv4/IPv6，拒绝伪造非法来源"
```

### Task 6: 登录与账号修改限流 key 联动（`app/api/account/route.ts`）

**Files:**
- Modify: `app/api/account/route.ts`

- [ ] **Step 1: 改为使用默认限流 key（与登录共享失败计数）**

将第 38 行与第 64 行中的 `"account-update"` 参数移除，回退到默认 `"admin"` key：
```ts
    const { locked, remainingMs } = checkRateLimit();
```
```ts
      recordFailedAttempt();
```
> 效果：单管理员站点中，连续 5 次错误的改密/改名操作会与登录失败共用同一计数，统一触发 10 分钟锁定，避免绕开登录锁。

- [ ] **Step 2: 校验**

运行：`npx tsc --noEmit && npx eslint app/api/account/route.ts && npx vitest run tests/rate-limit.test.ts`
预期：全部通过。

- [ ] **Step 3: 提交**

```bash
git add app/api/account/route.ts
git commit -m "fix(auth): 账号修改与登录共享限流计数，防止绕过登录锁定"
```

### Task 7: 部署密钥占位符与检测对齐（`.env.deploy.example` + 两套脚本）

**Files:**
- Modify: `.env.deploy.example`
- Modify: `deploy.sh`
- Modify: `deploy.ps1`

- [ ] **Step 1: 修改占位符**

`.env.deploy.example` 第 5 行改为：
```bash
NEXTAUTH_SECRET=__GENERATE_RANDOM_KEY__
```

- [ ] **Step 2: 更新 `deploy.sh` 检测（第 20 行）**

```bash
# 同时识别旧（change-me）与新（__GENERATE_RANDOM_KEY__）占位符，避免误判为已配置
if grep -Eq 'NEXTAUTH_SECRET=(change-me|__GENERATE_RANDOM_KEY__)' "$ENV_FILE"; then
```

- [ ] **Step 3: 更新 `deploy.ps1` 检测（第 19 行）**

```powershell
$isPlaceholder = Select-String -Path $envFile -Pattern 'NEXTAUTH_SECRET=(change-me|__GENERATE_RANDOM_KEY__)' -Quiet
if ($isPlaceholder) {
```

- [ ] **Step 4: 人工核对逻辑（可选 dry-run）**

确认两处脚本仍以 `openssl rand -hex 32`（sh）/ 随机字节（ps1）生成并整体替换 `NEXTAUTH_SECRET=` 行，无需改动替换逻辑本身。

- [ ] **Step 5: 提交**

```bash
git add .env.deploy.example deploy.sh deploy.ps1
git commit -m "fix(deploy): 密钥占位符改用明确标记并在两套脚本同步检测"
```

### Task 8: 外链 `noopener,noreferrer`（`components/LinkTabs.tsx`）

**Files:**
- Modify: `components/LinkTabs.tsx`

- [ ] **Step 1: 修改打开外链的方式（第 114 行）**

```ts
    window.open(link.url, "_blank", "noopener,noreferrer");
```

- [ ] **Step 2: 校验**

运行：`npx tsc --noEmit && npx eslint components/LinkTabs.tsx`
预期：通过。

- [ ] **Step 3: 提交**

```bash
git add components/LinkTabs.tsx
git commit -m "fix(links): 外链打开附加 noopener,noreferrer 防止反向接管"
```

### Task 9: `ScriptInjector` 注入属性净化

**Files:**
- Modify: `components/ScriptInjector.tsx`

- [ ] **Step 1: 增加净化逻辑**

在 `injectSnippet` 上方新增常量：
```ts
// 禁止注入到 <head> 的高风险属性与协议
const UNSAFE_ATTR = /^(on[a-z]+|formaction|srcdoc)$/i;
const UNSAFE_URL = /^javascript:/i;
```

将 `injectSnippet` 中复制普通标签属性的循环（第 65–68 行）替换为净化版：
```ts
      const node = document.createElement(el.tagName);
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (UNSAFE_ATTR.test(name)) continue; // 丢弃 onclick/onerror 等事件属性
        if (UNSAFE_URL.test(attr.value.trim())) continue; // 丢弃 javascript: URL
        node.setAttribute(attr.name, attr.value);
      }
      nodes.push(node);
```

同时对外部脚本 `src` 增加协议放行（第 54–57 行，保留现有逻辑，仅追加 javascript: 拦截）：
```ts
      if (el.getAttribute("src")) {
        const src = el.getAttribute("src") || "";
        if (!UNSAFE_URL.test(src.trim())) {
          script.src = src;
        }
        script.textContent = "";
      }
```

> 说明：本机仍允许管理员录入脚本（个人站点视为可信），此改动只作为纵深防御，防止意外注入的事件属性与 `javascript:` 协议被直接带进 DOM。CSP 完全去除 `'unsafe-inline'` 会破坏脚本注入能力，风险大于收益，本次不改 CSP，仅在任务自审区记录为后续可选项。

- [ ] **Step 2: 校验**

运行：`npx tsc --noEmit && npx eslint components/ScriptInjector.tsx && npx vitest run tests/dev-console.test.tsx tests/click-effect.test.tsx`
预期：全部通过（相关渲染测试不受影响）。

- [ ] **Step 3: 提交**

```bash
git add components/ScriptInjector.tsx
git commit -m "fix(scripts): 净化注入到 head 的属性与协议，拦截 on* 与 javascript:"
```

---

# 收尾校验（全任务完成后）

- [ ] 运行：`npx prisma migrate status` → `up to date`
- [ ] 运行：`npx tsc --noEmit` → 通过
- [ ] 运行：`npx eslint .` → 通过
- [ ] 运行：`npx vitest run` → 全部通过（原 152 + 新增 ≥ 9）
- [ ] 运行：`npm run build` → 生产构建通过（可选，若环境允许）
- [ ] 手动抽查：后台保存一次同名 Profile 配置应提示"无变化"且不刷新 `updatedAt`；`/api/health`、天气、外链打开行为正常。

---

# 自审记录

**Spec 覆盖**
- 行动 1（P0 迁移缺列）→ Task 1 ✅
- 行动 2（P1：无变化跳过写库、diffProfile 漂移+脱敏、diffLinks name）→ Task 2/3/4 ✅
- 行动 3（P1：IP 校验、登录/改密限流联动、部署密钥；P2：外链 noopener、脚本注入）→ Task 5/6/7/8/9 ✅

**占位符扫描**：所有代码步骤均含完整实现；测试含实际断言，无"添加报错处理/类似 Task N/稍后补齐"等占位。

**类型一致性**
- `getChangedProfileFields(before, after): string[]`、`diffProfile(...)`、`diffLinks(...)`、`isValidIp(ip): boolean`、`getClientIp(req)` 在 Task 2/4/5 定义后被 Task 3/4/5 与对应测试使用，签名一致。
- `LINK_KEYS`/`linksEqualExceptName`/`linkValue` 仅 Task 4 内部使用，命名自洽。
- `LinkItem` 沿用 `lib/server.ts` 既有导出，测试 import 与之匹配。

**已知遗留（非本次范围）**：CSP 的 `'unsafe-inline'` 收紧为后续可选项；`lib/server.ts` 接口限流桶清理仅在满阈值时触发（低风险，另行处理）。
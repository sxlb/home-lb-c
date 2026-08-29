# 数据管理套件（S2）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现后台数据备份（下载 JSON）与恢复（上传覆盖），支撑数据安全与配置迁移。

**Architecture:** 核心逻辑在 `lib/backup.ts`（buildBackup 组装 / parseBackup 校验 / restoreBackup 事务恢复，prisma 依赖注入便于测试）；两个 API 路由（GET 下载 / POST 恢复）；前端新增 DataPanel 面板并挂载到后台「运维工具」分组。

**Tech Stack:** Next.js 15 / Prisma 5 + SQLite / zod / vitest

**设计文档:** `docs/superpowers/specs/2026-08-29-data-management-design.md`

---

### Task 1: lib/backup.ts 核心逻辑（TDD）

**Files:**
- Create: `lib/backup.ts`
- Test: `tests/backup.test.ts`

- [ ] **Step 1: 编写失败测试**

创建 `tests/backup.test.ts`：

```ts
import { describe, it, expect, vi } from "vitest";
import { buildBackup, parseBackup, restoreBackup } from "@/lib/backup";

const profile = { nickname: "测试", bio: "hi", customFontEnabled: false };
const socialLinks = [{ name: "GitHub", icon: "github", url: "https://github.com", tip: "", sort: 0 }];
const siteLinks = [{ name: "博客", icon: "globe", url: "https://example.com", sort: 0 }];
const friendLinks = [{ name: "友链", url: "https://example.com", icon: "", description: "", sort: 0 }];

describe("buildBackup", () => {
  it("组装带版本号与导出时间的备份对象", () => {
    const b = buildBackup(profile as never, socialLinks, siteLinks, friendLinks);
    expect(b.version).toBe(1);
    expect(typeof b.exportedAt).toBe("string");
    expect(b.profile.nickname).toBe("测试");
    expect(b.socialLinks).toHaveLength(1);
    expect(b.siteLinks).toHaveLength(1);
    expect(b.friendLinks).toHaveLength(1);
  });
});

describe("parseBackup", () => {
  it("合法备份通过", () => {
    const b = buildBackup(profile as never, socialLinks, siteLinks, friendLinks);
    expect(parseBackup(b).ok).toBe(true);
  });

  it("version 非 1 被拒绝", () => {
    const b = buildBackup(profile as never, socialLinks, siteLinks, friendLinks);
    const result = parseBackup({ ...b, version: 2 });
    expect(result.ok).toBe(false);
  });

  it("结构缺失被拒绝", () => {
    const result = parseBackup({ version: 1 });
    expect(result.ok).toBe(false);
  });
});

describe("restoreBackup", () => {
  it("校验失败时不调用任何数据库操作", async () => {
    const prisma = {
      $transaction: vi.fn(),
      profile: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
      socialLink: { deleteMany: vi.fn(), createMany: vi.fn() },
      siteLink: { deleteMany: vi.fn(), createMany: vi.fn() },
      friendLink: { deleteMany: vi.fn(), createMany: vi.fn() },
    } as never;
    const bad = { version: 1, exportedAt: "", profile: { nickname: "" }, socialLinks: [], siteLinks: [], friendLinks: [] };
    const result = await restoreBackup(prisma, bad);
    expect(result.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/backup.test.ts`
Expected: FAIL（`@/lib/backup` 不存在）

- [ ] **Step 3: 实现 lib/backup.ts**

创建 `lib/backup.ts`：

```ts
import { z } from "zod";
import { profileSchema, socialLinkSchema, siteLinkSchema, friendLinkSchema } from "@/lib/validation";

/** 备份文件版本（升级格式时递增，恢复端按版本分流） */
export const BACKUP_VERSION = 1;

/** 备份文件结构（对外暴露，供 API 与前端类型使用） */
export interface BackupData {
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  profile: Record<string, unknown>;
  socialLinks: Record<string, unknown>[];
  siteLinks: Record<string, unknown>[];
  friendLinks: Record<string, unknown>[];
}

/** 组装备份对象（纯函数，可单测） */
export function buildBackup(
  profile: Record<string, unknown>,
  socialLinks: Record<string, unknown>[],
  siteLinks: Record<string, unknown>[],
  friendLinks: Record<string, unknown>[]
): BackupData {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    socialLinks,
    siteLinks,
    friendLinks,
  };
}

/** 基本结构校验：版本 + 字段形状（不涉及具体字段语义，字段级校验在 restoreBackup） */
export function parseBackup(raw: unknown): { ok: true; data: BackupData } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "备份文件格式错误" };
  const obj = raw as Record<string, unknown>;
  if (obj.version !== BACKUP_VERSION) return { ok: false, error: `不支持的备份版本（期望 v${BACKUP_VERSION}）` };
  if (!obj.profile || typeof obj.profile !== "object") return { ok: false, error: "备份缺少站点配置" };
  for (const key of ["socialLinks", "siteLinks", "friendLinks"] as const) {
    if (!Array.isArray(obj[key])) return { ok: false, error: `备份缺少 ${key}` };
  }
  return {
    ok: true,
    data: obj as unknown as BackupData,
  };
}

/**
 * 恢复备份：完整校验（profile + 三个链接表逐条）+ 事务覆盖。
 * prisma 依赖注入，便于单测 mock。
 * 返回 { ok, count? }；失败不写库（校验阶段前置），事务失败整体回滚。
 */
export async function restoreBackup(
  prisma: unknown,
  raw: unknown
): Promise<{ ok: true; count: { profile: 0 | 1; socialLinks: number; siteLinks: number; friendLinks: number } } | { ok: false; error: string }> {
  const parsed = parseBackup(raw);
  if (!parsed.ok) return parsed;

  const { profile, socialLinks, siteLinks, friendLinks } = parsed.data;

  // 字段级校验（前置，任何一条不合法即拒绝，不触碰数据库）
  const profileResult = profileSchema.safeParse(profile);
  if (!profileResult.success) return { ok: false, error: `站点配置校验失败：${profileResult.error.issues[0]?.message ?? "格式错误"}` };

  const validateList = (list: Record<string, unknown>[], schema: z.ZodTypeAny, label: string): { ok: true } | { ok: false; error: string } => {
    for (const item of list) {
      const r = schema.safeParse(item);
      if (!r.success) return { ok: false, error: `${label}中存在非法数据：${r.error.issues[0]?.message ?? "格式错误"}` };
    }
    return { ok: true };
  };
  const checks = [
    validateList(socialLinks, socialLinkSchema, "社交链接"),
    validateList(siteLinks, siteLinkSchema, "网站链接"),
    validateList(friendLinks, friendLinkSchema, "友情链接"),
  ];
  for (const c of checks) {
    if (!c.ok) return c;
  }

  const p = prisma as {
    $transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
    profile: { findFirst(args?: unknown): Promise<{ id: number } | null>; update(args: unknown): Promise<unknown>; create(args: unknown): Promise<unknown> };
    socialLink: { deleteMany(): Promise<unknown>; createMany(args: { data: unknown[] }): Promise<unknown> };
    siteLink: { deleteMany(): Promise<unknown>; createMany(args: { data: unknown[] }): Promise<unknown> };
    friendLink: { deleteMany(): Promise<unknown>; createMany(args: { data: unknown[] }): Promise<unknown> };
  };

  try {
    const result = await p.$transaction(async (txRaw) => {
      const tx = txRaw as {
        socialLink: { deleteMany(): Promise<unknown>; createMany(args: { data: unknown[] }): Promise<unknown> };
        siteLink: { deleteMany(): Promise<unknown>; createMany(args: { data: unknown[] }): Promise<unknown> };
        friendLink: { deleteMany(): Promise<unknown>; createMany(args: { data: unknown[] }): Promise<unknown> };
        profile: { findFirst(args?: unknown): Promise<{ id: number } | null>; update(args: unknown): Promise<unknown>; create(args: unknown): Promise<unknown> };
      };
      await tx.socialLink.deleteMany();
      await tx.siteLink.deleteMany();
      await tx.friendLink.deleteMany();

      // Profile 单例：存在则更新，否则创建
      const existing = await tx.profile.findFirst({ orderBy: { id: "asc" } });
      if (existing) {
        await tx.profile.update({ where: { id: existing.id }, data: profileResult.data });
      } else {
        await tx.profile.create({ data: profileResult.data });
      }

      if (socialLinks.length > 0) await tx.socialLink.createMany({ data: socialLinks });
      if (siteLinks.length > 0) await tx.siteLink.createMany({ data: siteLinks });
      if (friendLinks.length > 0) await tx.friendLink.createMany({ data: friendLinks });

      return {
        profile: existing ? (0 as const) : (1 as const),
        socialLinks: socialLinks.length,
        siteLinks: siteLinks.length,
        friendLinks: friendLinks.length,
      };
    });
    return { ok: true, count: result };
  } catch (e) {
    return { ok: false, error: "恢复失败：数据库错误" };
  }
}
```

注意：`createMany` 传入 `profileResult.data` 已由 schema 清洗；链接条目也应在校验后使用清洗值（当前简化传原始对象，如遇 Prisma 严格类型可改为 `r.data` 收集——本实现以通过校验为前提，字段超集在 Prisma 层会被 strip 或报错；如报错则在 validateList 中返回清洗数组，见 Step 5 的调整说明）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/backup.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 完善链接清洗（如测试/构建暴露 Prisma 类型问题）**

若 `createMany` 因多余字段（如 SocialLink 的 tip 传入 siteLink）报错，将 `validateList` 改为返回清洗后数组，并在事务中使用清洗值。完成后重跑测试。

- [ ] **Step 6: 提交**

```bash
git add lib/backup.ts tests/backup.test.ts
git commit -m "feat(backup): build/parse/restore backup core logic with tests"
```

---

### Task 2: GET /api/backup 下载

**Files:**
- Create: `app/api/backup/route.ts`

- [ ] **Step 1: 创建路由**

创建 `app/api/backup/route.ts`：

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildBackup } from "@/lib/backup";
import { requireSession, error, internalError } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 下载完整备份：Profile + 三个链接表（不含 User / OperationLog） */
export async function GET() {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }

    const [profile, socialLinks, siteLinks, friendLinks] = await Promise.all([
      prisma.profile.findFirst({ orderBy: { id: "asc" } }),
      prisma.socialLink.findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] }),
      prisma.siteLink.findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] }),
      prisma.friendLink.findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] }),
    ]);

    const backup = buildBackup(
      (profile as unknown as Record<string, unknown>) ?? {},
      socialLinks as unknown as Record<string, unknown>[],
      siteLinks as unknown as Record<string, unknown>[],
      friendLinks as unknown as Record<string, unknown>[]
    );

    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="home-lb-backup-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return internalError("[GET /api/backup] 导出失败", e);
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 3: 提交**

```bash
git add app/api/backup/route.ts
git commit -m "feat(backup): GET /api/backup downloads full data backup"
```

---

### Task 3: POST /api/backup/restore 恢复

**Files:**
- Create: `app/api/backup/restore/route.ts`
- Modify: `lib/server.ts:74`（LogModule 增加 "backup"）

- [ ] **Step 1: LogModule 增加 backup**

在 `lib/server.ts` 第 74 行 LogModule 类型中加入 `"backup"`：

```ts
export type LogModule = "profile" | "social-links" | "site-links" | "friend-links" | "account" | "weather-setting" | "backup";
```

- [ ] **Step 2: 创建恢复路由**

创建 `app/api/backup/restore/route.ts`：

```ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { restoreBackup } from "@/lib/backup";
import { requireSession, error, parseJsonBody, internalError, writeOperationLog, getClientIp } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 最大恢复体积（5MB） */
const MAX_RESTORE_BYTES = 5 * 1024 * 1024;

/** 恢复备份：危险操作，需 confirm: true 且备份结构合法 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_RESTORE_BYTES) {
      return error("备份文件过大（超过 5MB）", 400);
    }

    const json = await parseJsonBody<{ confirm?: boolean; backup?: unknown }>(request);
    if (json === null) {
      return error("请求体格式错误，需为合法 JSON");
    }
    if (json.confirm !== true) {
      return error("请确认后执行恢复操作", 400);
    }

    const result = await restoreBackup(prisma, json.backup);
    if (!result.ok) {
      return error(result.error, 400);
    }

    // 记录操作日志（失败不影响主操作）
    const username = session.user?.name || "unknown";
    await writeOperationLog({
      module: "backup",
      action: "restore",
      username,
      summary: `恢复备份：配置 ${result.count.profile ? "创建" : "更新"}，社交 ${result.count.socialLinks} 条、网站 ${result.count.siteLinks} 条、友情 ${result.count.friendLinks} 条`,
      ip: getClientIp(request),
    });

    return new Response(JSON.stringify({ ok: true, count: result.count }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return internalError("[POST /api/backup/restore] 恢复失败", e);
  }
}
```

- [ ] **Step 3: 类型检查 + 全量测试**

Run: `npx tsc --noEmit && npx vitest run tests/backup.test.ts`
Expected: 通过

- [ ] **Step 4: 提交**

```bash
git add app/api/backup/restore/route.ts lib/server.ts
git commit -m "feat(backup): POST /api/backup/restore with confirm guard and validation"
```

---

### Task 4: DataPanel 前端 + 后台 tab

**Files:**
- Create: `components/admin/DataPanel.tsx`
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: 创建 DataPanel**

创建 `components/admin/DataPanel.tsx`：

```tsx
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Upload, Loader2, Database, FileJson, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface BackupSummary {
  exportedAt?: string;
  counts?: { profile: string; socialLinks: number; siteLinks: number; friendLinks: number };
}

/** 数据管理面板：备份下载 + 恢复上传（危险操作二次确认） */
export default function DataPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePickFile = (f: File | null) => {
    setFile(f);
    setSummary(null);
    setConfirmed(false);
    if (!f) return;
    // 本地解析预览（不发送）：校验 version 并展示摘要
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data.version !== 1) {
          toast.error("备份版本不支持");
          setFile(null);
          return;
        }
        setSummary({
          exportedAt: data.exportedAt ? new Date(data.exportedAt).toLocaleString("zh-CN") : "未知",
          counts: {
            profile: data.profile?.nickname || "（空配置）",
            socialLinks: Array.isArray(data.socialLinks) ? data.socialLinks.length : 0,
            siteLinks: Array.isArray(data.siteLinks) ? data.siteLinks.length : 0,
            friendLinks: Array.isArray(data.friendLinks) ? data.friendLinks.length : 0,
          },
        });
      } catch {
        toast.error("备份文件解析失败，请确认为导出的 JSON 文件");
        setFile(null);
      }
    };
    reader.readAsText(f);
  };

  const handleRestore = async () => {
    if (!file || !summary || !confirmed) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, backup: JSON.parse(text) }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("恢复成功，数据已更新");
        setFile(null);
        setSummary(null);
        setConfirmed(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        toast.error(data.error || "恢复失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">数据管理</CardTitle>
            <CardDescription>备份与恢复站点数据（配置、社交/网站/友情链接），不包含账号密码</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 备份区 */}
        <div className="rounded-xl border bg-muted/20 p-4">
          <h3 className="mb-1 text-sm font-semibold">一键备份</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            下载全部业务数据为 JSON 文件，用于迁移部署或定期存档。账号密码与操作日志不包含在内。
          </p>
          <a
            href="/api/backup"
            download
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            下载备份
          </a>
        </div>

        {/* 恢复区 */}
        <div className="rounded-xl border border-destructive/20 p-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <Upload className="h-4 w-4" />
            恢复备份
          </h3>
          <p className="mb-3 text-xs text-destructive/80">
            危险操作：恢复将覆盖当前所有配置与链接数据，且不可撤销。请确认已下载最新备份。
          </p>

          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => handlePickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
            />

            {summary && (
              <div className="rounded-lg border bg-background/60 p-3 text-sm">
                <div className="mb-2 flex items-center gap-1.5 text-emerald-600">
                  <FileJson className="h-4 w-4" />
                  <span className="font-medium">备份文件信息</span>
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li>备份时间：{summary.exportedAt}</li>
                  <li>站点配置：{summary.counts?.profile}</li>
                  <li>社交链接：{summary.counts?.socialLinks} 条</li>
                  <li>网站链接：{summary.counts?.siteLinks} 条</li>
                  <li>友情链接：{summary.counts?.friendLinks} 条</li>
                </ul>
              </div>
            )}

            {file && (
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-destructive"
                />
                <span className="text-muted-foreground">我了解此操作将覆盖当前全部数据</span>
              </label>
            )}

            <Button
              variant="destructive"
              onClick={handleRestore}
              disabled={!file || !summary || !confirmed || restoring}
              className="gap-1.5"
            >
              {restoring ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  恢复中...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  确认恢复
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 后台增加 tab**

修改 `app/admin/page.tsx`：
1. TabId 增加 `"data"`；import `Database` 图标（lucide 已有）与 `DataPanel`
2. 「运维工具」分组 items 加入：

```tsx
{ id: "data", label: "数据管理", icon: Database, description: "备份与恢复站点数据" },
```

3. 内容区加入：

```tsx
{activeTab === "data" && <DataPanel />}
```

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功

- [ ] **Step 4: 提交**

```bash
git add components/admin/DataPanel.tsx app/admin/page.tsx
git commit -m "feat(backup): add DataPanel with backup download and restore upload"
```

---

### Task 5: 全量验证

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 全部 PASS（含 backup 用例）

- [ ] **Step 2: 类型 + Lint + 构建**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 无错误

- [ ] **Step 3: 手工验证清单**

1. 后台「运维工具 → 数据管理」：显示备份/恢复两区
2. 点击「下载备份」：浏览器下载 `home-lb-backup-YYYYMMDD.json`，内容含 version/profile/三个链接数组
3. 修改一条社交链接 → 上传备份文件 → 显示摘要（备份时间/各表条数）→ 勾选确认 → 「确认恢复」→ toast 成功
4. 回到「社交链接」确认数据已回滚为备份时状态
5. 未勾选确认时恢复按钮禁用
6. 上传非 JSON 文件：提示解析失败
7. 篡改备份 version=2：提示版本不支持
8. 未登录直接访问 `/api/backup` 与 `/api/backup/restore`：返回 401

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore(backup): final verification" || echo "无新增变更"
```

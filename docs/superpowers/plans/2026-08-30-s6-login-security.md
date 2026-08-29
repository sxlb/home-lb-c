# S6 登录安全 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 账号维度失败锁定 + 可选 TOTP 两步验证（零依赖 RFC 6238）。

**Architecture:** `lib/totp.ts` 自实现 TOTP（HMAC-SHA1 + base32 + 30s 步 ±1 容错）；`lib/auth.ts` 增加账号维度限流 key 与 authorize 内 2FA 校验；探测接口 `/api/auth/2fa-status`；AccountPanel 管理开启/关闭；登录页条件验证码输入。

**Tech Stack:** Next.js 15 / NextAuth 4 / Prisma 5 / node:crypto / vitest

**设计文档:** `docs/superpowers/specs/2026-08-30-s6-login-security-design.md`

---

### Task 1: lib/totp.ts（TDD，RFC 6238 测试向量）

**Files:**
- Create: `lib/totp.ts`
- Test: `tests/totp.test.ts`

- [ ] **Step 1: 编写失败测试**

创建 `tests/totp.test.ts`（RFC 6238 附录 B SHA1 测试向量，6 位取后 6 位）：

```ts
import { describe, it, expect, vi } from "vitest";
import { verifyTOTP, generateSecret, buildOtpauthUrl } from "@/lib/totp";

// RFC 6238 附录 B 测试向量：secret = "12345678901234567890"（ASCII）
// base32 = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("verifyTOTP（RFC 6238 SHA1 测试向量）", () => {
  const cases: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];

  for (const [time, code] of cases) {
    it(`时间 ${time} → ${code}`, () => {
      vi.setSystemTime(new Date(time * 1000));
      expect(verifyTOTP(SECRET, code)).toBe(true);
      vi.useRealTimers();
    });
  }

  it("错误验证码返回 false", () => {
    vi.setSystemTime(new Date(59 * 1000));
    expect(verifyTOTP(SECRET, "000000")).toBe(false);
    vi.useRealTimers();
  });

  it("非 6 位数字返回 false", () => {
    expect(verifyTOTP(SECRET, "12345")).toBe(false);
    expect(verifyTOTP(SECRET, "abcdef")).toBe(false);
  });
});

describe("generateSecret / buildOtpauthUrl", () => {
  it("生成 base32 格式 secret", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s.length).toBeGreaterThanOrEqual(26);
  });

  it("生成 otpauth URL", () => {
    expect(buildOtpauthUrl(SECRET, "admin")).toContain("otpauth://totp/admin");
    expect(buildOtpauthUrl(SECRET)).toContain("secret=");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/totp.test.ts`
Expected: FAIL（`@/lib/totp` 不存在）

- [ ] **Step 3: 实现 lib/totp.ts**

创建 `lib/totp.ts`：

```ts
import { createHmac, randomBytes } from "node:crypto";

/**
 * TOTP（RFC 6238）零依赖实现：HMAC-SHA1 + base32 secret + 30s 步长。
 * 用于后台两步验证（与 Google Authenticator / 1Password 等兼容）。
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** 生成随机 base32 secret（20 字节 → 32 字符，无 padding） */
export function generateSecret(): string {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** base32 解码（容忍小写与 padding/空格） */
function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** HOTP（RFC 4226）：HMAC-SHA1 动态截断 → 6 位数字 */
function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

/**
 * 验证 TOTP 验证码：30s 步长，允许 ±window 步时间漂移（默认 ±1 步）。
 */
export function verifyTOTP(secret: string, code: string, window = 1): boolean {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) return false;
  const decoded = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    if (hotp(decoded, counter + i) === normalized) return true;
  }
  return false;
}

/** 生成 otpauth:// URI（可复制到 Authenticator 手动添加或扫码） */
export function buildOtpauthUrl(secret: string, account = "admin"): string {
  return `otpauth://totp/${encodeURIComponent(account)}?secret=${secret}&issuer=home-lb&algorithm=SHA1&digits=6&period=30`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/totp.test.ts`
Expected: 全部 PASS（含 RFC 6238 官方向量）

- [ ] **Step 5: 提交**

```bash
git add lib/totp.ts tests/totp.test.ts
git commit -m "feat(2fa): zero-dependency TOTP with RFC 6238 test vectors"
```

---

### Task 2: User schema 增加 2FA 字段

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260830000000_add_2fa/migration.sql`

- [ ] **Step 1: schema 增加字段**

在 `prisma/schema.prisma` 的 User 模型（`mustChangePassword` 附近）加入：

```prisma
  twoFactorSecret      String   @default("") // TOTP 密钥（base32，开启 2FA 时生成）
  twoFactorEnabled     Boolean  @default(false) // 是否启用两步验证
```

- [ ] **Step 2: 创建迁移 + 生成客户端**

创建 `prisma/migrations/20260830000000_add_2fa/migration.sql`：

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN "twoFactorSecret" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
```

Run: `npx prisma generate`

- [ ] **Step 3: 提交**

```bash
git add prisma/schema.prisma prisma/migrations/20260830000000_add_2fa/migration.sql
git commit -m "feat(2fa): add twoFactor fields to User model"
```

---

### Task 3: lib/auth.ts 双 key 锁定 + 2FA 校验

**Files:**
- Modify: `lib/auth.ts`

- [ ] **Step 1: 增加错误码**

在 `AUTH_ERROR_CODES` 中加入：

```ts
  TOTP_REQUIRED: "totp_required",
  TOTP_INVALID: "totp_invalid",
```

- [ ] **Step 2: 增加账号维度 key 辅助函数**

在 `recordFailedAttempt` / `clearAttempts` 附近加入：

```ts
/** 账号维度限流 key（仅对已存在用户使用，避免锁定差异泄露账号存在性） */
export function getLoginUserRateKey(username: string): string {
  return `login:user:${username.toLowerCase()}`;
}
```

- [ ] **Step 3: authorize 内双 key 记录与 2FA 校验**

将 `authorize` 中限流与密码校验部分替换为：

```ts
      async authorize(credentials, req) {
        validateAuthEnv();

        const rateKey = getLoginRateLimitKey(req?.headers);
        const { locked } = checkRateLimit(rateKey);
        if (locked) {
          return null;
        }

        if (!credentials?.username || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });

        // 时序攻击防护：用户不存在时也执行一次 bcrypt.compare
        if (!user) {
          await bcrypt.compare(credentials.password, DUMMY_HASH);
          recordFailedAttempt(rateKey);
          return null;
        }

        // 账号维度锁定检查（用户存在后）：多 IP 分布式爆破时锁账号本身
        const userKey = getLoginUserRateKey(credentials.username);
        const userLock = checkRateLimit(userKey);
        if (userLock.locked) {
          return null;
        }

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) {
          recordFailedAttempt(rateKey);
          recordFailedAttempt(userKey);
          return null;
        }

        // 两步验证：密码通过后校验 TOTP（开启时）
        const code = (credentials as { totpCode?: string }).totpCode?.trim() || "";
        if (user.twoFactorEnabled) {
          if (!code) {
            recordFailedAttempt(rateKey);
            recordFailedAttempt(userKey);
            return null; // 前端经 error 参数识别 totp_required
          }
          const { verifyTOTP } = await import("@/lib/totp");
          if (!verifyTOTP(user.twoFactorSecret, code)) {
            recordFailedAttempt(rateKey);
            recordFailedAttempt(userKey);
            return null; // totp_invalid
          }
        }

        clearAttempts(rateKey);
        clearAttempts(userKey);
        return {
          id: String(user.id),
          name: user.username,
          mustChangePassword: user.mustChangePassword,
        };
      },
```

注意：authorize 无法直接返回具体错误码（NextAuth 吞异常），2FA 缺失/错误的区分由登录页通过"是否已探测到 2FA"逻辑提示（探测接口已告知 requires2fa，提交时若未填验证码则前端直接提示，不需后端区分）。

- [ ] **Step 4: 类型检查 + 测试**

Run: `npx tsc --noEmit && npx vitest run tests/auth.test.ts`
Expected: 通过（auth.test.ts 若存在限流相关断言，保持兼容）

- [ ] **Step 5: 提交**

```bash
git add lib/auth.ts
git commit -m "feat(2fa): account-level rate limit key and TOTP check in authorize"
```

---

### Task 4: 2FA 探测与管理 API

**Files:**
- Create: `app/api/auth/2fa-status/route.ts`
- Create: `app/api/account/2fa/route.ts`

- [ ] **Step 1: 探测接口**

创建 `app/api/auth/2fa-status/route.ts`：

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isRateLimited, getClientIp } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 探测账号是否开启 2FA（登录页条件显示验证码输入框）。IP 限流防枚举。 */
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username")?.trim() || "";
  if (!username) {
    return NextResponse.json({ requires2fa: false });
  }

  const ip = getClientIp(request) || "unknown";
  if (isRateLimited(`2fa-status:${ip}`, 30, 60_000)) {
    return NextResponse.json({ requires2fa: false });
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    return NextResponse.json({ requires2fa: !!user?.twoFactorEnabled });
  } catch {
    return NextResponse.json({ requires2fa: false });
  }
}
```

- [ ] **Step 2: 2FA 管理 API**

创建 `app/api/account/2fa/route.ts`：

```ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { generateSecret, verifyTOTP, buildOtpauthUrl } from "@/lib/totp";
import { requireSession, error, parseJsonBody, internalError, writeOperationLog, getClientIp } from "@/lib/server";

export const dynamic = "force-dynamic";

type Action = "setup" | "enable" | "disable";

/** 两步验证管理：setup 生成密钥 / enable 确认开启 / disable 关闭 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session || !session.user?.name) {
      return error("未授权", 401);
    }
    const username = session.user.name;

    const json = await parseJsonBody<{ action?: Action; code?: string }>(request);
    if (json === null || !json.action) {
      return error("缺少 action 参数");
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return error("账号不存在", 404);

    if (json.action === "setup") {
      // 已开启时不重复生成（避免覆盖现有密钥）
      if (user.twoFactorEnabled) return error("两步验证已开启");
      const secret = generateSecret();
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorSecret: secret },
      });
      return new Response(
        JSON.stringify({ ok: true, secret, otpauthUrl: buildOtpauthUrl(secret, username) }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // enable / disable 均需验证当前验证码
    const code = json.code?.trim() || "";
    if (!/^\d{6}$/.test(code)) return error("请输入 6 位验证码");
    if (!verifyTOTP(user.twoFactorSecret, code)) return error("验证码不正确");

    if (json.action === "enable") {
      if (user.twoFactorEnabled) return error("两步验证已开启");
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
      await writeOperationLog({
        module: "account",
        action: "update",
        username,
        summary: "开启两步验证（TOTP）",
        ip: getClientIp(request),
      });
      return new Response(JSON.stringify({ ok: true, enabled: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // disable
    if (!user.twoFactorEnabled) return error("两步验证未开启");
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: "" },
    });
    await writeOperationLog({
      module: "account",
      action: "update",
      username,
      summary: "关闭两步验证",
      ip: getClientIp(request),
    });
    return new Response(JSON.stringify({ ok: true, enabled: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return internalError("[POST /api/account/2fa] 操作失败", e);
  }
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 4: 提交**

```bash
git add app/api/auth/2fa-status/route.ts app/api/account/2fa/route.ts
git commit -m "feat(2fa): status probe and setup/enable/disable APIs"
```

---

### Task 5: 登录页条件验证码输入

**Files:**
- Modify: `app/admin/login/page.tsx`

- [ ] **Step 1: 增加 2FA 状态与输入**

在 `LoginPage` 中加入：

```tsx
  const [requires2fa, setRequires2fa] = useState(false);
  const [totpCode, setTotpCode] = useState("");

  // 用户名变化时探测是否开启 2FA（IP 限流防枚举）
  useEffect(() => {
    const name = username.trim();
    if (!name) {
      setRequires2fa(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/2fa-status?username=${encodeURIComponent(name)}`);
        const data = await res.json();
        if (!cancelled) setRequires2fa(!!data.requires2fa);
      } catch {
        /* 探测失败视为未开启 */
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username]);
```

在密码输入框之后加入（requires2fa 为 true 时显示）：

```tsx
            {requires2fa && (
              <div className="space-y-2">
                <Label htmlFor="totpCode" className="text-white/80">两步验证码</Label>
                <Input
                  id="totpCode"
                  name="totpCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="6 位验证码（Authenticator）"
                  className="input-glass text-center tracking-[0.3em]"
                  required={requires2fa}
                />
              </div>
            )}
```

提交 signIn 时带 totpCode；提交前本地校验：requires2fa 且未填验证码时直接提示：

```tsx
      if (requires2fa && !/^\d{6}$/.test(totpCode)) {
        setFormError("请输入 6 位两步验证码");
        setLoading(false);
        return;
      }
      const res = await signIn("credentials", {
        username,
        password,
        ...(requires2fa ? { totpCode } : {}),
        redirect: false,
      });
```

- [ ] **Step 2: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功

- [ ] **Step 3: 提交**

```bash
git add app/admin/login/page.tsx
git commit -m "feat(2fa): conditional TOTP input on login page"
```

---

### Task 6: AccountPanel 2FA 管理

**Files:**
- Modify: `components/admin/AccountPanel.tsx`

- [ ] **Step 1: 增加 2FA 管理区**

在 AccountPanel 表单之后加入 2FA 区（`CardContent` 内新增一个分隔区块）：

```tsx
      {/* ===== 两步验证 ===== */}
      <div className="mt-6 space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">两步验证（TOTP）</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          使用 Google Authenticator 等应用扫码或手动添加，登录时需额外输入 6 位验证码。
        </p>

        {twoFactorEnabled ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-emerald-600">已开启</span>
            <div className="flex items-center gap-2">
              <Input
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                placeholder="6 位验证码"
                maxLength={6}
                className="h-8 w-28 text-center tracking-widest"
              />
              <Button size="sm" variant="outline" onClick={handleDisable} disabled={!disableCode || saving2fa}>
                关闭
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" onClick={handleSetup} disabled={saving2fa}>
            启用两步验证
          </Button>
        )}

        {setupData && !twoFactorEnabled && (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs">
            <p className="mb-2 font-medium">将以下信息添加到验证器应用（或手动输入密钥）：</p>
            <p className="mb-1 break-all text-muted-foreground">密钥：<code className="text-foreground">{setupData.secret}</code></p>
            <p className="mb-2 break-all text-muted-foreground">OTPAuth：<code className="text-foreground">{setupData.otpauthUrl}</code></p>
            <div className="flex items-center gap-2">
              <Input
                value={enableCode}
                onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, ""))}
                placeholder="输入验证码确认"
                maxLength={6}
                className="h-8 w-32 text-center tracking-widest"
              />
              <Button size="sm" onClick={handleEnable} disabled={!/^\d{6}$/.test(enableCode) || saving2fa}>
                确认开启
              </Button>
            </div>
          </div>
        )}
      </div>
```

同时增加 state 与处理函数（`twoFactorEnabled` 初始化由登录时接口返回或默认 false；本实现中开启状态通过管理接口响应更新）：

```tsx
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [saving2fa, setSaving2fa] = useState(false);

  const call2fa = async (body: Record<string, string>) => {
    setSaving2fa(true);
    try {
      const res = await fetch("/api/account/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) return data;
      toast.error(data.error || "操作失败");
      return null;
    } catch {
      toast.error("网络错误");
      return null;
    } finally {
      setSaving2fa(false);
    }
  };

  const handleSetup = async () => {
    const data = await call2fa({ action: "setup" });
    if (data) setSetupData({ secret: data.secret, otpauthUrl: data.otpauthUrl });
  };

  const handleEnable = async () => {
    const data = await call2fa({ action: "enable", code: enableCode });
    if (data) {
      setTwoFactorEnabled(true);
      setSetupData(null);
      setEnableCode("");
      toast.success("两步验证已开启");
    }
  };

  const handleDisable = async () => {
    const data = await call2fa({ action: "disable", code: disableCode });
    if (data) {
      setTwoFactorEnabled(false);
      setDisableCode("");
      toast.success("两步验证已关闭");
    }
  };
```

注意：页面初始 `twoFactorEnabled` 未知——可调用 `GET /api/account/2fa/status`（或复用 2fa-status 接口带会话）获取。为最小改动，新增一个只读状态接口或在 `useEffect` 中调 `/api/account` 的返回中携带。实现时按实际情况：若 `/api/account` GET 未返回 2FA 状态，则在 AccountPanel `useEffect` 中调 `GET /api/account/2fa/status`（返回 `{ enabled }`，requireSession）。

- [ ] **Step 2: 补充状态接口（如需要）**

若需新增 `GET /api/account/2fa/status`：在 `app/api/account/2fa/route.ts` 增加：

```ts
/** 查询当前账号 2FA 状态（登录后） */
export async function GET() {
  try {
    const session = await requireSession();
    if (!session || !session.user?.name) return error("未授权", 401);
    const user = await prisma.user.findUnique({ where: { username: session.user.name } });
    return new Response(JSON.stringify({ enabled: !!user?.twoFactorEnabled }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return internalError("[GET /api/account/2fa] 查询失败", e);
  }
}
```

AccountPanel `useEffect` 初始化：

```tsx
  useEffect(() => {
    fetch("/api/account/2fa")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setTwoFactorEnabled(!!data.enabled); })
      .catch(() => { /* 忽略 */ });
  }, []);
```

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 成功

- [ ] **Step 4: 提交**

```bash
git add components/admin/AccountPanel.tsx app/api/account/2fa/route.ts
git commit -m "feat(2fa): manage TOTP enable/disable in account panel"
```

---

### Task 7: 全量验证

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 全部 PASS（含 totp 用例）

- [ ] **Step 2: 类型 + Lint + 构建**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 无错误

- [ ] **Step 3: 手工验证清单**

1. TOTP 单测通过（RFC 6238 向量）
2. 后台「账号设置」：启用 2FA → 显示 secret/otpauth URL → 输入 Authenticator 验证码确认 → 已开启
3. 退出登录 → 登录页输入账号后显示验证码输入框 → 密码 + 验证码正确登录成功；验证码错误登录失败
4. 连续错误密码 5 次（同一账号换 IP 场景由双 key 覆盖）→ 锁定提示
5. 关闭 2FA：输入当前验证码 → 已关闭 → 登录不再需要验证码
6. 未登录访问 `/api/account/2fa`：401

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore(2fa): final verification" || echo "无新增变更"
```

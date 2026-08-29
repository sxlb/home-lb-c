import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

// ---- 类型增强：把"是否需要强制改密"标记透传到 session / JWT ----
declare module "next-auth" {
  interface User {
    mustChangePassword?: boolean;
  }
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      mustChangePassword?: boolean;
    };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    mustChangePassword?: boolean;
  }
}

// 运行时安全校验：确保环境变量已配置
let envChecked = false;
function validateAuthEnv() {
  if (envChecked) return;
  envChecked = true;

  const secret = process.env.NEXTAUTH_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (!secret) {
    throw new Error("[auth] NEXTAUTH_SECRET 未设置，请使用 `openssl rand -base64 32` 生成后写入环境变量");
  }
  if (secret.length < 32) {
    throw new Error("[auth] NEXTAUTH_SECRET 长度不足 32 字符");
  }
  if (isProd) {
    if (
      secret === "dev-only-do-not-use-in-production-please-change-32chars" ||
      secret === "change-me-to-a-random-string-32-chars-or-more" ||
      secret === "please-change-this-to-a-random-32-char-string"
    ) {
      throw new Error("[auth] 生产环境 NEXTAUTH_SECRET 仍为示例值，请修改为真实随机密钥");
    }
  }
}

// 简单内存限流：5 分钟窗口内失败 5 次后锁定 10 分钟。
// 限流按"来源 IP + 账号"维度计数（key = login:<ip>），避免：
// 1) 任意来源的失败请求锁死真实管理员（全局单 key 的 DoS）；
// 2) 多 IP 分布式爆破各自独立计数绕过。
// 单实例部署有效；多实例/Serverless 需改用 Redis 等共享存储。
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;

type Attempt = { count: number; firstAt: number; lockUntil: number };
const attempts = new Map<string, Attempt>();

/** 宽松校验 IP 字面量字符（IPv4/IPv6），非法值丢弃，防止伪造头污染 key */
const LOGIN_IP_RE = /^[0-9a-fA-F:.]+$/;

/**
 * 头对象的最小兼容形态：
 * - Next.js 路由的 NextRequest.headers（Headers，有 get 方法）
 * - next-auth authorize 回调的 req.headers（Record<string, any>，key 为小写）
 */
type LoginHeaderSource =
  | Headers
  | { get?: (name: string) => string | null }
  | Record<string, unknown>
  | undefined;

/** 从两种头对象形态中读取同名头值（数组头拼接为逗号分隔） */
function readLoginHeader(headers: LoginHeaderSource, name: string): string {
  if (!headers) return "";
  if (typeof (headers as { get?: unknown }).get === "function") {
    return (headers as { get: (n: string) => string | null }).get(name) ?? "";
  }
  const v = (headers as Record<string, unknown>)[name.toLowerCase()];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return (v as string[]).join(",");
  return "";
}

/**
 * 从请求头提取限流 key（按来源 IP）：优先 x-forwarded-for 首个合法 IP，
 * 其次 x-real-ip；均非法时回退 "unknown"（所有无头请求共享一个桶，仍有限流）。
 * 两个头都可被请求方伪造，但伪造只会让攻击者锁住"自己的伪造 IP"，
 * 无法影响真实管理员；无需信任其准确性。
 */
export function getLoginRateLimitKey(headers?: LoginHeaderSource): string {
  let ip = "";
  const xff = readLoginHeader(headers, "x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (LOGIN_IP_RE.test(first)) ip = first;
  }
  if (!ip) {
    const real = readLoginHeader(headers, "x-real-ip").trim();
    if (LOGIN_IP_RE.test(real)) ip = real;
  }
  return `login:${ip || "unknown"}`;
}

export function checkRateLimit(key = "admin"): { locked: boolean; remainingMs: number } {
  const now = Date.now();
  const a = attempts.get(key);

  if (a && now < a.lockUntil) {
    return { locked: true, remainingMs: a.lockUntil - now };
  }
  if (a && now >= a.lockUntil && a.lockUntil > 0) {
    attempts.delete(key);
    return { locked: false, remainingMs: 0 };
  }
  if (a && now - a.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return { locked: false, remainingMs: 0 };
  }

  return { locked: false, remainingMs: 0 };
}

export function recordFailedAttempt(key = "admin") {
  const now = Date.now();
  const a = attempts.get(key) || { count: 0, firstAt: now, lockUntil: 0 };

  if (now < a.lockUntil) return;
  if (now - a.firstAt > WINDOW_MS) {
    a.count = 0;
    a.firstAt = now;
  }

  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    a.lockUntil = now + LOCK_MS;
  }
  attempts.set(key, a);
}

function clearAttempts(key = "admin") {
  attempts.delete(key);
}

/** 账号维度限流 key（仅对已存在用户使用，避免锁定差异泄露账号存在性） */
export function getLoginUserRateKey(username: string): string {
  return `login:user:${username.toLowerCase()}`;
}

/** 清空全部登录限流状态（测试用） */
export function resetLoginRateLimit(): void {
  attempts.clear();
}

// 预先生成的 dummy 哈希，用于用户不存在时保持响应时间一致（防时序攻击）
// 这是一个 bcrypt 哈希字符串，对任意密码 compare 都会返回 false 但消耗相同时间
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

// 登录失败原因码，用于前端区分错误类型
// NextAuth v4 的 authorize 抛出的异常会被吞掉，改用 URL error 参数传递
export const AUTH_ERROR_CODES = {
  RATE_LIMITED: "rate_limited",
  INVALID_CREDENTIALS: "invalid_credentials",
  TOTP_REQUIRED: "totp_required",
  TOTP_INVALID: "totp_invalid",
} as const;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/admin/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "账号", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials, req) {
        validateAuthEnv();

        // 限流检查：按来源 IP 维度计数（不抛异常，会被 NextAuth 吞掉，直接返回 null）
        // 前端通过 /api/auth/rate-limit 公开接口判断当前 IP 是否被锁定
        const rateKey = getLoginRateLimitKey(req?.headers);
        const { locked } = checkRateLimit(rateKey);
        if (locked) {
          return null;
        }

        if (!credentials?.username || !credentials?.password) return null;

        // 从数据库查询用户
        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });

        // 时序攻击防护：用户不存在时也执行一次 bcrypt.compare，保持响应时间一致
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

        // bcrypt 验证密码
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) {
          recordFailedAttempt(rateKey);
          recordFailedAttempt(userKey);
          return null;
        }

        // 两步验证：密码通过后校验 TOTP（开启时）
        // 验证码缺失/错误同样计入失败次数（双 key），防暴力尝试验证码
        const code = (credentials as { totpCode?: string }).totpCode?.trim() || "";
        if (user.twoFactorEnabled) {
          const { verifyTOTP } = await import("@/lib/totp");
          if (!code || !verifyTOTP(user.twoFactorSecret, code)) {
            recordFailedAttempt(rateKey);
            recordFailedAttempt(userKey);
            return null;
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
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      // 首次登录：把"是否需要强制改密"标记写入 token
      if (user) {
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false;
      }
      // 改密成功触发 session.update() 时，从数据库读取最新标记，
      // 保证"改密后提示条消失"无需重新登录也能立即生效。
      if (trigger === "update" && token.name) {
        try {
          const fresh = await prisma.user.findUnique({ where: { username: token.name } });
          token.mustChangePassword = fresh?.mustChangePassword ?? token.mustChangePassword ?? false;
        } catch {
          // DB 读取异常时保留原标记，不影响登录流程
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.mustChangePassword = token.mustChangePassword ?? false;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export { validateAuthEnv };

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

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

// 简单内存限流：5 分钟窗口内失败 5 次后锁定 10 分钟
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;

type Attempt = { count: number; firstAt: number; lockUntil: number };
const attempts = new Map<string, Attempt>();

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

// 预先生成的 dummy 哈希，用于用户不存在时保持响应时间一致（防时序攻击）
// 这是一个 bcrypt 哈希字符串，对任意密码 compare 都会返回 false 但消耗相同时间
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

// 登录失败原因码，用于前端区分错误类型
// NextAuth v4 的 authorize 抛出的异常会被吞掉，改用 URL error 参数传递
export const AUTH_ERROR_CODES = {
  RATE_LIMITED: "rate_limited",
  INVALID_CREDENTIALS: "invalid_credentials",
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
      async authorize(credentials) {
        validateAuthEnv();

        // 限流检查：不抛异常（会被 NextAuth 吞掉），直接返回 null
        // 前端通过 checkRateLimit 公开接口判断是否被锁定
        const { locked } = checkRateLimit();
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
          recordFailedAttempt();
          return null;
        }

        // bcrypt 验证密码
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) {
          recordFailedAttempt();
          return null;
        }

        clearAttempts();
        return { id: String(user.id), name: user.username };
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
};

export { validateAuthEnv };

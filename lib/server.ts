import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, validateAuthEnv } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validation";
import type { z, ZodTypeAny } from "zod";

/**
 * 服务端 API 工具集：统一放行"响应封装 + 会话校验 + 请求体解析 + 操作日志 + 限流"，
 * 供各 API 路由复用，避免在每个 route.ts 中重复实现。
 */

/* ==================== 日志与响应封装 ==================== */

/** 仅在开发环境输出完整错误；生产环境只输出摘要（可接入 Sentry 等） */
export function logError(message: string, error?: unknown) {
  if (process.env.NODE_ENV === "development") {
    console.error(message, error);
  } else {
    console.error(message);
  }
}

/** 返回 JSON 响应，默认 200 */
export function json(data: unknown, init?: number | ResponseInit) {
  return typeof init === "number" ? NextResponse.json(data, { status: init }) : NextResponse.json(data, init);
}

/** 成功响应：200/201 */
export function success<T>(data: T, status: 200 | 201 = 200): ReturnType<typeof json> {
  return json(data, status) as ReturnType<typeof json>;
}

/** 错误响应：4xx / 5xx */
export function error(message: string, status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502 = 400) {
  return json({ error: message }, status);
}

/** 服务器内部错误：统一 500 */
export function internalError(message = "服务器错误", e?: unknown) {
  logError(message, e);
  return error("服务器内部错误", 500);
}

/**
 * 要求已登录：校验认证环境并获取会话（API 路由认证样板）。
 * 未登录返回 null，调用方应返回 401。
 */
export async function requireSession() {
  validateAuthEnv();
  return getServerSession(authOptions);
}

/**
 * 安全解析 JSON 请求体；请求体非法 JSON 时返回 null（调用方应返回 400）。
 */
export async function parseJsonBody<T = unknown>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** 格式化 zod 校验错误为可读消息（如 "name: 名称不能为空; url: 链接必须以 http 开头"） */
export function formatZodError(zodError: z.ZodError): string {
  return zodError.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ");
}

/* ==================== 操作日志 ==================== */

/** 操作日志模块类型 */
export type LogModule = "profile" | "social-links" | "site-links" | "friend-links" | "account" | "weather-setting" | "backup" | "announcements";

export interface LogInput {
  module: LogModule;
  action: string;
  username: string;
  summary: string;
  detail?: string;
  ip?: string;
}

export interface LinkItem {
  id?: number;
  name: string;
  icon: string;
  url: string;
  tip?: string;
  description?: string;
  sort: number;
}

/**
 * 写入操作日志。
 * 日志写入失败不影响主操作，仅打印错误供排查。
 */
export async function writeOperationLog(input: LogInput) {
  try {
    await prisma.operationLog.create({
      data: {
        module: input.module,
        action: input.action,
        username: input.username,
        summary: input.summary,
        detail: input.detail || "",
        ip: input.ip || "",
      },
    });
  } catch (e) {
    console.error("[operationLog] 写入日志失败:", e);
  }
}

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

/** diffLinks 中参与"除 name 外字段比较"的键清单 */
const LINK_KEYS = ["icon", "url", "tip", "description", "sort"] as const;
type LinkKey = (typeof LINK_KEYS)[number];

/** 取指定键的值（keyof 收窄，避免 JS 字符串动态访问） */
function linkValue(l: LinkItem, k: LinkKey) {
  return l[k];
}

/** 两份链接在除 name 之外的字段上是否完全相同（用于识别"仅改名"） */
function linksEqualExceptName(a: LinkItem, b: LinkItem): boolean {
  return LINK_KEYS.every((k) => linkValue(a, k) === linkValue(b, k));
}

/**
 * 对比新旧链接列表（按 name 作为唯一键），生成增/删/改/重命名摘要。
 * 仅改名（除 name 外字段全等）归为「重命名」，而不误判为「删除+新增」。
 * 返回：summary（一句话摘要）与 detail（含新增/删除/重命名/修改明细的 JSON 字符串）
 */
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

  // 重命名识别：被删条目与新增条目除 name 外字段全等 → 视为一次重命名，而非删+增。
  // 启发式限制（已知 tradeoff）：真正的"删除 A + 新增 B（除 name 外字段全等）"也会被
  // 归为重命名（见 tests/diff-links.test.ts）；需要精确语义时应改用 id 优先匹配。
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

/**
 * 对比 Profile 变更字段，返回摘要与明细。
 * 说明：字段清单由 profileSchema 派生；敏感密钥仅记录"已配置/未配置"，
 * 不把真实值写入日志（防泄露）。
 */
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

/* ==================== 轻量内存限流 ==================== */

/**
 * 轻量内存滑动窗口限流器（按 key 计次，窗口内超过阈值返回 true）。
 * 适用于单实例部署（个人站点）；多实例 / Serverless 场景需改用 Redis 等共享存储。
 */
interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 60;

/**
 * 判断 key 是否超过限流阈值（每 key 在 windowMs 窗口内最多允许 max 次）。
 */
export function isRateLimited(key: string, max = DEFAULT_MAX, windowMs = DEFAULT_WINDOW_MS): boolean {
  const now = Date.now();

  // 桶过多时先清理过期条目，避免无界增长
  if (buckets.size >= MAX_BUCKETS) {
    for (const [k, b] of buckets) {
      if (now - b.windowStart >= DEFAULT_WINDOW_MS) buckets.delete(k);
    }
    // 清理后仍满：拒绝新 key（视为限流），防止攻击者用长窗口 key
    // 或持续换新 key 塞满 Map 造成内存 DoS
    if (buckets.size >= MAX_BUCKETS) return true;
  }

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    // 新窗口
    buckets.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

/** 清空限流状态（测试用） */
export function resetRateLimiter(): void {
  buckets.clear();
}

/* ==================== 链接列表路由工厂 ==================== */

/**
 * 链接列表路由所需的 Prisma 委托（结构兼容 socialLink / siteLink 两个模型）。
 * 仅声明工厂实际用到的方法，避免依赖具体 Prisma 类型。
 */
export interface LinkDelegate {
  findMany(args: {
    orderBy: { sort?: "asc" | "desc"; id?: "asc" | "desc" }[];
  }): Promise<LinkItem[]>;
  create(args: { data: Record<string, unknown> }): Promise<LinkItem>;
  deleteMany(): Promise<{ count: number }>;
  createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>;
}

/**
 * 将 Prisma 模型委托（如 prisma.socialLink）适配为 LinkDelegate。
 * Prisma 生成类型的参数类型更具体，与手写的最小接口在 TS 逆变规则下不直接兼容，
 * 但运行时二者完全匹配（数据已由 zod schema 校验），此适配仅在类型层面收窄。
 */
export function toLinkDelegate<T>(delegate: T): LinkDelegate {
  return delegate as unknown as LinkDelegate;
}

interface LinkRouteConfig<S extends ZodTypeAny> {
  /** 操作日志模块名（social-links / site-links / friend-links） */
  module: Extract<LogModule, "social-links" | "site-links" | "friend-links">;
  /** 资源名（用于错误提示） */
  label: string;
  /** 单条链接校验 schema（输出类型经 z.infer 推导，避免散落类型断言） */
  schema: S;
  /** 主客户端委托（prisma.socialLink / prisma.siteLink） */
  delegate: LinkDelegate;
  /** 从事务客户端取同名委托（tx.socialLink / tx.siteLink） */
  txDelegate: (tx: unknown) => LinkDelegate;
}

/**
 * 生成"社交链接 / 网站链接"两类高度相似的 REST 路由（GET / POST / PUT）。
 * 两个资源共用一套逻辑：鉴权 → 校验 → 增/删/改 → 事务批量保存 → 操作日志。
 */
export function createLinkListApi<S extends ZodTypeAny>({
  module,
  label,
  schema,
  delegate,
  txDelegate,
}: LinkRouteConfig<S>) {
  // 从 schema 推导记录类型，让 parsed.data / items 具类型，取代散落的类型断言
  type Item = z.infer<S>;
  // 仅对字面量使用 as const（保留可写数组类型，满足 Prisma 参数要求）
  const ORDER = { orderBy: [{ sort: "asc" as const }, { id: "asc" as const }] };

  async function GET() {
    try {
      const links = await delegate.findMany(ORDER);
      return NextResponse.json(links);
    } catch (e) {
      return internalError(`[GET ${label}] 查询失败`, e);
    }
  }

  async function POST(request: NextRequest) {
    try {
      const session = await requireSession();
      if (!session) {
        return error("未授权", 401);
      }

      const json = await parseJsonBody(request);
      if (json === null) {
        return error("请求体格式错误，需为合法 JSON");
      }

      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        return error(`参数校验失败：${formatZodError(parsed.error)}`);
      }

      const created = await delegate.create({ data: parsed.data });
      return NextResponse.json(created, { status: 201 });
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
        return error("创建失败：已存在相同数据", 409);
      }
      return internalError(`[POST ${label}] 创建失败`, e);
    }
  }

  // 批量更新（用于后台保存整个列表）
  async function PUT(request: NextRequest) {
    try {
      const session = await requireSession();
      if (!session) {
        return error("未授权", 401);
      }

      const json = await parseJsonBody(request);
      if (json === null) {
        return error("请求体格式错误，需为合法 JSON");
      }

      if (!Array.isArray(json)) {
        return error("请求体必须为数组");
      }

      // 逐条校验并收集清洗后的数据
      const items: Item[] = [];
      for (const item of json) {
        const parsed = schema.safeParse(item);
        if (!parsed.success) {
          return error(`参数校验失败：${formatZodError(parsed.error)}`);
        }
        items.push(parsed.data);
      }

      // 批量保存前：获取旧列表，用于生成操作日志的变更摘要
      const before = await delegate.findMany(ORDER);

      // 使用事务清空并重新插入
      const result = await prisma.$transaction(async (tx) => {
        const d = txDelegate(tx);
        await d.deleteMany();
        return d.createMany({ data: items });
      });

      // 记录操作日志（失败不影响主操作）
      const username = session.user?.name || "unknown";
      const { summary, detail } = diffLinks(before, items);
      await writeOperationLog({
        module,
        action: "batch_update",
        username,
        summary,
        detail,
        ip: getClientIp(request),
      });

      return NextResponse.json({ count: result.count });
    } catch (e) {
      return internalError(`[PUT ${label}] 保存失败`, e);
    }
  }

  return { GET, POST, PUT };
}

import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, error, internalError, getClientIp, writeOperationLog } from "@/lib/server";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

/** 默认社交链接种子数据（与 seed.js 一致） */
const DEFAULT_SOCIAL_LINKS = [
  { name: "GitHub", icon: "github", url: "https://github.com", tip: "去 Github 看看", sort: 0 },
  { name: "BiliBili", icon: "bilibili", url: "https://space.bilibili.com", tip: "(゜-゜)つロ 干杯~", sort: 1 },
  { name: "Email", icon: "mail", url: "mailto:example@example.com", tip: "来封 Email~", sort: 2 },
  { name: "Twitter", icon: "twitter", url: "https://x.com", tip: "你懂的~", sort: 3 },
  { name: "Telegram", icon: "send", url: "https://t.me", tip: "你懂的~", sort: 4 },
];

/** 默认网站链接种子数据（与 seed.js 一致） */
const DEFAULT_SITE_LINKS = [
  { name: "博客", icon: "book-open", url: "https://example.com/blog", sort: 0 },
  { name: "网盘", icon: "cloud", url: "https://example.com/pan", sort: 1 },
  { name: "音乐", icon: "music", url: "music:", sort: 2 },
  { name: "起始页", icon: "compass", url: "https://example.com/nav", sort: 3 },
  { name: "网址集", icon: "link", url: "https://example.com/web", sort: 4 },
  { name: "今日热榜", icon: "flame", url: "https://example.com/hot", sort: 5 },
];

/** Prisma 事务中模型名称映射表（数据库表名 → tx 属性名） */
const MODEL_MAP: Array<{ dbTable: string; modelKey: string }> = [
  { dbTable: "VisitRecord", modelKey: "visitRecord" },
  { dbTable: "SiteLinkClick", modelKey: "siteLinkClick" },
  { dbTable: "OperationLog", modelKey: "operationLog" },
  { dbTable: "UpdateRecord", modelKey: "updateRecord" },
  { dbTable: "Article", modelKey: "article" },
  { dbTable: "SiteAnnouncement", modelKey: "siteAnnouncement" },
  { dbTable: "ImageAsset", modelKey: "imageAsset" },
  { dbTable: "Project", modelKey: "project" },
  { dbTable: "Skill", modelKey: "skill" },
  { dbTable: "FriendLink", modelKey: "friendLink" },
  { dbTable: "SocialLink", modelKey: "socialLink" },
  { dbTable: "SiteLink", modelKey: "siteLink" },
  { dbTable: "VisitStat", modelKey: "visitStat" },
];

type ResetStats = { cleared: Record<string, number>; seedsCreated: Record<string, number> };

/** 通过事务内 prisma 实例清空某表并返回被删数量 */
async function clearModel(
  txClient: Record<string, unknown>,
  modelKey: string,
  countFn?: () => Promise<number>
): Promise<number> {
  const m = txClient[modelKey];
  if (!m) return 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedM = m as any;
    if (countFn) {
      const c = await countFn();
      await typedM.deleteMany?.();
      return typeof c === "number" ? c : Number(c);
    }
    await typedM.deleteMany?.();
    return 1;
  } catch {
    return 0;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }

    // 解析 confirmReset 参数
    const searchParams = new URL(request.url).searchParams;
    const qParam = searchParams.get("confirm");
    const confirm = qParam === "true";

    if (!confirm) {
      return error("请传递 confirm=true 确认重置操作（危险！）");
    }

    const username = session.user?.name || "unknown";
    const stats: ResetStats = { cleared: {}, seedsCreated: {} };

    // 使用事务确保原子性：要么全部成功，要么全部回滚
    await prisma.$transaction(async (tx) => {
      const txMap = tx as Record<string, unknown>;

      // ===== 第一阶段：清空所有业务表 =====
      for (const { dbTable, modelKey } of MODEL_MAP) {
        const t = txMap[modelKey];
        if (!t) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const typedT = t as any;
        try {
          if (typedT.count) {
            const c = await typedT.count();
            await typedT.deleteMany?.();
            (stats.cleared as Record<string, number>)[dbTable] = typeof c === "number" ? c : Number(c);
          } else {
            await typedT.deleteMany?.();
            (stats.cleared as Record<string, number>)[dbTable] = 1;
          }
        } catch {
          // 表可能不存在（旧版本数据库），忽略
        }
      }

      // 手动处理 Profile（count+delete 而非 deleteMany）
      try {
        const profile = txMap.profile as { findFirst?(): Promise<null | { id: number }>; delete?(params: { where: { id: number } }): Promise<void> };
        const existingProfile = await profile?.findFirst?.({ orderBy: { id: "asc" } });
        if (existingProfile) {
          (stats.cleared as Record<string, number>)["Profile"] = 1;
          await profile!.delete!({ where: { id: existingProfile.id } });
        } else {
          (stats.cleared as Record<string, number>)["Profile"] = 0;
        }
      } catch {}

      // ===== 第二阶段：重新注入种子默认数据 =====
      // Profile
      const profileCreate = txMap.profile as { create?(data: Record<string, unknown>): Promise<unknown> };
      await profileCreate!.create!({
        data: {
          avatar: "", siteIcon: "", nickname: "无名", bio: "这个人很懒，什么都没写",
          github: "", email: "", weatherProvider: "tencent", amapKey: "", txWeatherKey: "", weatherCity: "",
        },
      });
      stats.seedsCreated["Profile"] = 1;

      // SocialLink
      const socialLinkCreateMany = txMap.socialLink as { createMany?(data: { data: unknown[] }): Promise<unknown> };
      await socialLinkCreateMany!.createMany!({ data: DEFAULT_SOCIAL_LINKS });
      stats.seedsCreated["SocialLink"] = DEFAULT_SOCIAL_LINKS.length;

      // SiteLink
      const siteLinkCreateMany = txMap.siteLink as { createMany?(data: { data: unknown[] }): Promise<unknown> };
      await siteLinkCreateMany!.createMany!({ data: DEFAULT_SITE_LINKS });
      stats.seedsCreated["SiteLink"] = DEFAULT_SITE_LINKS.length;

      // ===== 第三阶段：用户账号处理 =====
      const adminUser = await (txMap.user as { findUnique?(where: { username: string }): Promise<null | { id: number }> })?.findUnique?.({ where: { username: "admin" } }) as { id: number } | null;
      if (adminUser) {
        const hashed = await bcrypt.hash("123456", 10);
        await (txMap.user as { update?(params: { where: { id: number }; data: Record<string, unknown> }): Promise<unknown> }).update!({
          where: { id: adminUser.id },
          data: { password: hashed, mustChangePassword: true },
        });
        stats.seedsCreated["User"] = 1;
      }
    });

    // 记录操作日志
    await writeOperationLog({
      module: "system",
      action: "reset_defaults",
      username,
      summary: "已重置全部业务数据为默认状态",
      detail: JSON.stringify(stats),
      ip: getClientIp(request),
    });

    const totalCleared = Object.values(stats.cleared).reduce((a, b) => a + b, 0);
    const totalSeeded = Object.values(stats.seedsCreated).reduce((a, b) => a + b, 0);

    return NextResponse.json({
      ok: true,
      message: `恢复默认成功：清空 ${totalCleared} 条记录，重建 ${totalSeeded} 条默认数据`,
      stats,
    });
  } catch (e) {
    console.error("[POST /api/reset-default] 重置失败:", e);
    return internalError("重置默认失败", e);
  }
}

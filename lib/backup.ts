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

/** 基本结构校验：版本 + 字段形状（字段级语义校验在 restoreBackup 内完成） */
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
 * 返回 { ok, count? }；校验失败不触碰数据库，事务失败整体回滚。
 */
export async function restoreBackup(
  prisma: unknown,
  raw: unknown
): Promise<{ ok: true; count: { profile: 0 | 1; socialLinks: number; siteLinks: number; friendLinks: number } } | { ok: false; error: string }> {
  const parsed = parseBackup(raw);
  if (!parsed.ok) return parsed;

  const { profile, socialLinks, siteLinks, friendLinks } = parsed.data;

  // 字段级校验（前置，任何一条不合法即拒绝）
  const profileResult = profileSchema.safeParse(profile);
  if (!profileResult.success) {
    return { ok: false, error: `站点配置校验失败：${profileResult.error.issues[0]?.message ?? "格式错误"}` };
  }

  // 校验并清洗链接数组（返回清洗后的数据供事务写入，避免多余字段）
  const cleanList = (list: Record<string, unknown>[], schema: z.ZodTypeAny, label: string): { ok: true; data: Record<string, unknown>[] } | { ok: false; error: string } => {
    const cleaned: Record<string, unknown>[] = [];
    for (const item of list) {
      const r = schema.safeParse(item);
      if (!r.success) {
        return { ok: false, error: `${label}中存在非法数据：${r.error.issues[0]?.message ?? "格式错误"}` };
      }
      cleaned.push(r.data as Record<string, unknown>);
    }
    return { ok: true, data: cleaned };
  };
  const social = cleanList(socialLinks, socialLinkSchema, "社交链接");
  if (!social.ok) return social;
  const site = cleanList(siteLinks, siteLinkSchema, "网站链接");
  if (!site.ok) return site;
  const friend = cleanList(friendLinks, friendLinkSchema, "友情链接");
  if (!friend.ok) return friend;

  const p = prisma as {
    $transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  };

  try {
    const result = await p.$transaction(async (txRaw) => {
      const tx = txRaw as {
        socialLink: { deleteMany(): Promise<unknown>; createMany(args: { data: Record<string, unknown>[] }): Promise<unknown> };
        siteLink: { deleteMany(): Promise<unknown>; createMany(args: { data: Record<string, unknown>[] }): Promise<unknown> };
        friendLink: { deleteMany(): Promise<unknown>; createMany(args: { data: Record<string, unknown>[] }): Promise<unknown> };
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

      if (social.data.length > 0) await tx.socialLink.createMany({ data: social.data });
      if (site.data.length > 0) await tx.siteLink.createMany({ data: site.data });
      if (friend.data.length > 0) await tx.friendLink.createMany({ data: friend.data });

      return {
        profile: (existing ? 0 : 1) as 0 | 1,
        socialLinks: social.data.length,
        siteLinks: site.data.length,
        friendLinks: friend.data.length,
      };
    });
    return { ok: true, count: result };
  } catch (e) {
    return { ok: false, error: "恢复失败：数据库错误" };
  }
}

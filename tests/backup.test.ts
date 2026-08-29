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
    interface MockPrisma {
      $transaction: ReturnType<typeof vi.fn>;
      profile: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
      socialLink: { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
      siteLink: { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
      friendLink: { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
    }
    const prisma = {
      $transaction: vi.fn(),
      profile: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
      socialLink: { deleteMany: vi.fn(), createMany: vi.fn() },
      siteLink: { deleteMany: vi.fn(), createMany: vi.fn() },
      friendLink: { deleteMany: vi.fn(), createMany: vi.fn() },
    } as unknown as MockPrisma;
    const bad = {
      version: 1,
      exportedAt: "",
      profile: { nickname: "" },
      socialLinks: [],
      siteLinks: [],
      friendLinks: [],
    };
    const result = await restoreBackup(prisma, bad);
    expect(result.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

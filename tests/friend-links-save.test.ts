import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * 覆盖「批量保存空列表」场景：用户删除全部链接后点击保存。
 * 回归 bug：server.ts 的 PUT 对空 items 直接调用 Prisma createMany([]) 会抛错，
 * 导致"删除所有链接后无法保存"。修复后空列表应跳过 createMany，仅 deleteMany。
 */

const mocks = {
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  operationLogCreate: vi.fn(),
};

// mock Prisma：friendLink 委托 + 事务（事务内提供 deleteMany / createMany）
vi.mock("@/lib/db", () => ({
  prisma: {
    friendLink: {
      findMany: (...args: unknown[]) => mocks.findMany(...args),
    },
    operationLog: {
      create: (...args: unknown[]) => mocks.operationLogCreate(...args),
    },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        friendLink: {
          deleteMany: (...args: unknown[]) => mocks.deleteMany(...args),
          createMany: (...args: unknown[]) => mocks.createMany(...args),
        },
      }),
  },
}));

// 放行鉴权：requireSession 内部调用 getServerSession(NextAuthOptions)
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(() => Promise.resolve({ user: { name: "admin" } })),
}));

// requireSession → validateAuthEnv 要求 NEXTAUTH_SECRET 至少 32 字符；
// setup.ts 的默认值仅 28 字符，首次调用 getServerSession 前会抛错。
// 这里覆盖为足够长的密钥，需在动态导入 route（触发 lib/auth 初始化）之前设置。
process.env.NEXTAUTH_SECRET = "test-secret-for-friend-links-save-0123456789abcdef";

const { PUT } = await import("@/app/api/friend-links/route");

function putRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/friend-links", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// 真实的旧数据（用于生成操作日志的变更摘要）
const existing = [
  { id: 1, name: "甲站", url: "https://a.example.com", icon: "", description: "", sort: 0 },
  { id: 2, name: "乙站", url: "https://b.example.com", icon: "", description: "", sort: 1 },
];

describe("PUT /api/friend-links（批量保存）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteMany.mockResolvedValue({ count: 2 });
  });

  it("保存空数组（删除全部链接）时跳过 createMany，仅清空并返回 0", async () => {
    mocks.findMany.mockResolvedValue(existing);

    const res = await PUT(putRequest([]));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ count: 0 });
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("删除全部时忽略 createMany 空数组报错（Prisma 不允许空数组）", async () => {
    // 若误走 createMany([])，Prisma 会抛错；此处模拟该错误应被规避
    mocks.findMany.mockResolvedValue([]);
    mocks.createMany.mockRejectedValue(new Error("Argument `data` must not be empty"));

    const res = await PUT(putRequest([]));

    expect(res.status).toBe(200);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("非空列表正常走 deleteMany + createMany", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.createMany.mockResolvedValue({ count: 2 });

    const payload = [
      { name: "甲站", url: "https://a.example.com", icon: "", description: "", sort: 0 },
      { name: "乙站", url: "https://b.example.com", icon: "", description: "", sort: 1 },
    ];
    const res = await PUT(putRequest(payload));

    expect(res.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    expect(mocks.createMany).toHaveBeenCalledWith({ data: payload });
  });
});
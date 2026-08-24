import { PrismaClient } from "@prisma/client";

// 全局缓存 PrismaClient，避免 Next.js 热重载或多 worker 场景下创建多个连接
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma;
}

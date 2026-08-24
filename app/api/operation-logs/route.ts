import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { internalError, error, requireSession } from "@/lib/server";

export const dynamic = "force-dynamic";

// 查询操作日志（仅后台管理员可用）
// 支持 ?limit= 控制条数（默认 50，最大 200）
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }

    // 解析 limit 参数：默认 50，最小 1，最大 200；非法值（NaN/负数/字符串）回退到默认值
    const rawLimit = request.nextUrl.searchParams.get("limit");
    const parsedLimit = parseInt(rawLimit || "50", 10);
    const limit = isNaN(parsedLimit) ? 50 : Math.min(Math.max(parsedLimit, 1), 200);

    const logs = await prisma.operationLog.findMany({
      orderBy: { id: "desc" },
      take: limit,
    });

    return NextResponse.json(logs);
  } catch (e) {
    return internalError("[GET /api/operation-logs] 查询失败", e);
  }
}
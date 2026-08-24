import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 公开接口：查询当前是否被限流锁定
// 登录页在提交前先调用此接口，若已锁定则直接提示，避免无效请求
export async function GET() {
  const { locked, remainingMs } = checkRateLimit();
  return NextResponse.json({
    locked,
    remainingMs,
    remainingMinutes: locked ? Math.ceil(remainingMs / 60000) : 0,
  });
}

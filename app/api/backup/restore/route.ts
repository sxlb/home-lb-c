import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { restoreBackup } from "@/lib/backup";
import { requireSession, error, parseJsonBody, internalError, writeOperationLog, getClientIp } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 最大恢复体积（5MB） */
const MAX_RESTORE_BYTES = 5 * 1024 * 1024;

/** 恢复备份：危险操作，需 confirm: true 且备份结构合法 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_RESTORE_BYTES) {
      return error("备份文件过大（超过 5MB）", 400);
    }

    const json = await parseJsonBody<{ confirm?: boolean; backup?: unknown }>(request);
    if (json === null) {
      return error("请求体格式错误，需为合法 JSON");
    }
    if (json.confirm !== true) {
      return error("请确认后执行恢复操作", 400);
    }

    const result = await restoreBackup(prisma, json.backup);
    if (!result.ok) {
      return error(result.error, 400);
    }

    // 记录操作日志（失败不影响主操作）
    const username = session.user?.name || "unknown";
    await writeOperationLog({
      module: "backup",
      action: "restore",
      username,
      summary: `恢复备份：配置 ${result.count.profile ? "创建" : "更新"}，社交 ${result.count.socialLinks} 条、网站 ${result.count.siteLinks} 条、友情 ${result.count.friendLinks} 条`,
      ip: getClientIp(request),
    });

    return new Response(JSON.stringify({ ok: true, count: result.count }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return internalError("[POST /api/backup/restore] 恢复失败", e);
  }
}

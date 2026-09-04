import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, success, error, internalError } from "@/lib/server";
import {
  CURRENT_VERSION,
  GITHUB_REPO,
  fetchLatestRelease,
  isNewerRelease,
} from "@/lib/version";
import {
  execState,
  readVersions,
  rollbackTargets,
  listBackupSnapshots,
} from "@/lib/update";

/**
 * 系统更新状态：GET /api/update/status
 * 返回当前版本、GitHub 最新发布、是否有新版本、执行状态、更新历史、回滚目标与数据快照。
 * 仅管理员可访问。
 */
export async function GET(_request: NextRequest) {
  const session = await requireSession();
  if (!session) return error("未授权", 401);

  try {
    const latest = await fetchLatestRelease();
    const current = CURRENT_VERSION;
    const isUpdateAvailable = latest.data ? isNewerRelease(latest.data.version, current) : false;

    const exec = execState();
    const versions = readVersions();
    const records = await prisma.updateRecord.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    // 结果回写：若最新执行结果与某条 pending/running 记录匹配，则收敛其最终状态
    if (exec.lastResult) {
      const open = records.find(
        (r) =>
          (r.status === "pending" || r.status === "running") &&
          r.version === exec.lastResult!.version &&
          r.action === exec.lastResult!.action
      );
      if (open) {
        const finalized = await prisma.updateRecord.update({
          where: { id: open.id },
          data: {
            status: exec.lastResult.status === "running" ? "running" : exec.lastResult.status,
            message: exec.lastResult.message,
            finishedAt: exec.lastResult.status === "running" ? null : new Date(),
          },
        });
        records[records.findIndex((r) => r.id === open.id)] = finalized;
      }
    }

    return success({
      currentVersion: current,
      repo: GITHUB_REPO,
      latestRelease: latest.data,
      latestError: latest.error,
      isUpdateAvailable,
      hostReady: Boolean(versions),
      exec,
      versions,
      rollbackTargets: rollbackTargets(),
      backups: listBackupSnapshots(),
      records,
    });
  } catch (e) {
    return internalError("获取更新状态失败", e);
  }
}
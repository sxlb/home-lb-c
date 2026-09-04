import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, success, error, internalError, parseJsonBody, writeOperationLog, getClientIp } from "@/lib/server";
import { fetchLatestRelease } from "@/lib/version";
import {
  execState,
  writeRequest,
  rollbackTargets,
  newId,
  type UpdateAction,
  type UpdateMethod,
} from "@/lib/update";

/**
 * 系统更新/回滚触发：POST /api/update/trigger
 * 请求体：{ action: "update" | "rollback", method?: "build" | "image", version?: string, description?: string }
 *  - action=update      ：更新到 GitHub 最新 release（无需传 version，取最新）
 *  - action=rollback    ：回滚到历史版本（version 必须为可回滚目标 tag，如 v1.2.0）
 *  - method              ：本次更新方式。build=宿主机自建构建；image=拉取已发布的镜像。缺省为 build。
 * 仅管理员可访问；执行中/待执行时拒绝重复提交。
 */
export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) return error("未授权", 401);

  const body = await parseJsonBody<{
    action?: string;
    method?: string;
    version?: string;
    description?: string;
  }>(request);
  if (!body || (body.action !== "update" && body.action !== "rollback")) {
    return error("参数错误：action 必须为 update 或 rollback");
  }
  const action = body.action as UpdateAction;

  // 更新方式校验：仅允许 build / image，缺省 build
  const method: UpdateMethod = body.method === "image" ? "image" : "build";

  // 并发防护：已有待执行/执行中的任务时拒绝
  const state = execState();
  if (state.kind !== "idle") {
    const who = state.kind === "pending" ? "已有待执行的更新请求" : "已有正在执行的更新任务";
    return error(`${who}，请等待完成后再尝试`, 409);
  }

  try {
    let version = "";
    let description = body.description?.trim() || "";

    if (action === "update") {
      const latest = await fetchLatestRelease(true); // 强制刷新，避免误用旧缓存
      if (!latest.data) return error(latest.error ? `无法检测到最新版本：${latest.error}` : "暂无可更新版本");
      version = latest.data.tag;
      description = description || latest.data.body || "";
    } else {
      // rollback：校验目标在历史版本列表中
      version = String(body.version || "").trim();
      if (!version) return error("参数错误：回滚必须指定目标版本（git tag）");
      const targets = rollbackTargets();
      if (!targets.includes(version)) {
        return error(`目标版本 ${version} 不在可回滚列表中`);
      }
    }

    const id = newId();
    const username = session.user?.name || "unknown";
    const requestMeta = {
      id,
      action,
      method,
      version,
      requestedBy: username,
      createdAt: new Date().toISOString(),
    };

    // 写入宿主机握手请求文件（宿主机定时器据此执行 git 拉取/重建/重启）
    writeRequest(requestMeta);

    // 数据库记录：进入 pending 队列
    await prisma.updateRecord.create({
      data: {
        version,
        action,
        method,
        fromVersion: "",
        status: "pending",
        message: "",
        description,
        triggeredBy: username,
      },
    });

    // 操作日志
    const methodLabel = method === "image" ? "（拉取镜像）" : "（服务器自建构建）";
    await writeOperationLog({
      module: "update",
      action,
      username,
      summary: `${action === "update" ? `触发更新到 ${version}` : `触发回滚到 ${version}`}${methodLabel}`,
      detail: description ? `说明：${description}` : "",
      ip: getClientIp(request),
    });

    return success({ ok: true, action, method, version, id });
  } catch (e) {
    return internalError("触发更新失败", e);
  }
}
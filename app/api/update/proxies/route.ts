import { NextRequest } from "next/server";
import {
  requireSession,
  success,
  error,
  internalError,
  parseJsonBody,
  writeOperationLog,
  getClientIp,
} from "@/lib/server";
import {
  listProxySources,
  normalizeMirrorBase,
  readCustomMirrors,
  testProxySources,
  writeCustomMirrors,
} from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * GitHub 加速代理管理：/api/update/proxies（仅管理员）
 *
 * - GET                ：返回候选源清单（官方 + 内置/环境变量 + 自定义），不发起网络请求
 * - GET ?test=1        ：并发测试全部候选源的连通性与延迟（由后台按钮主动触发，避免每次开面板都打一遍）
 * - POST { mirrors }   ：整组保存自定义代理（自动规范化+去重），保存后立即对版本检测生效
 *
 * 说明：自定义代理持久化在数据卷的 github-mirrors.json，不引入数据库表；
 * 内置代理始终保留，运维也可用环境变量 GITHUB_API_MIRRORS 整组替换内置列表。
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return error("未授权", 401);

    const test = new URL(request.url).searchParams.get("test") === "1";
    const [sources, custom] = await Promise.all([listProxySources(), readCustomMirrors()]);
    // 连通性测试并发发起，最慢的源决定整体耗时（约等于单个源的超时上限）
    const results = test ? await testProxySources() : null;

    return success({ sources, custom, results });
  } catch (e) {
    return internalError("[GET /api/update/proxies] 获取代理列表失败", e);
  }
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) return error("未授权", 401);

  try {
    const body = await parseJsonBody<{ mirrors?: unknown }>(request);
    if (!body || !Array.isArray(body.mirrors)) {
      return error("参数错误：mirrors 必须为字符串数组");
    }
    const raw = body.mirrors.map((m) => String(m));
    // 统计被忽略的非法项（非 http(s) 开头），如实回给前端提示
    const invalid = raw.filter((m) => m.trim() !== "" && normalizeMirrorBase(m) === null).length;

    const ok = await writeCustomMirrors(raw);
    if (!ok) {
      return error("保存失败：数据目录不可写，请检查容器对 data 卷的写权限");
    }
    const custom = await readCustomMirrors();

    await writeOperationLog({
      module: "update",
      action: "proxies",
      username: session.user?.name || "unknown",
      summary: `更新 GitHub 加速代理（自定义 ${custom.length} 个${invalid > 0 ? `，忽略非法 ${invalid} 个` : ""}）`,
      detail: custom.length > 0 ? custom.join("、") : "已清空自定义代理",
      ip: getClientIp(request),
    });

    return success({ custom, invalid });
  } catch (e) {
    return internalError("[POST /api/update/proxies] 保存代理失败", e);
  }
}

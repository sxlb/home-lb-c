import { NextResponse, NextRequest } from "next/server";
import { GITHUB_USERNAME_RE, githubProfileUrl } from "@/lib/github";
import { error, internalError, requireSession } from "@/lib/server";

export const dynamic = "force-dynamic";

/** GitHub API 多源：官方不可达时走反向代理，避免容器网络受限导致校验误判 */
const GITHUB_API_BASES = [
  "https://api.github.com/",
  "https://gh-proxy.com/https://api.github.com/",
];

/**
 * GET /api/github-user?username=<用户名>
 * 校验 GitHub 用户是否存在（后台填写用户名后联网校验）。
 * - 用户不存在：{ ok: false, exists: false, error }
 * - 全部数据源不可用：502，与「用户不存在」区分开，避免误报
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }

    const username = (request.nextUrl.searchParams.get("username") || "").trim();
    if (!username) {
      return error("请先填写 GitHub 用户名");
    }
    if (!GITHUB_USERNAME_RE.test(username)) {
      return NextResponse.json({ ok: false, exists: false, error: "GitHub 用户名格式不合法" });
    }

    let networkError: unknown = null;
    for (const base of GITHUB_API_BASES) {
      try {
        const res = await fetch(`${base}users/${encodeURIComponent(username)}`, {
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "home-lb-github-check",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(6000),
        });
        // 404 是权威结论：该用户名不存在
        if (res.status === 404) {
          return NextResponse.json({
            ok: false,
            exists: false,
            error: `GitHub 用户「${username}」不存在，请检查拼写`,
          });
        }
        if (!res.ok) {
          networkError = new Error(`GitHub API 返回 ${res.status}`);
          continue;
        }
        const data = (await res.json()) as {
          login?: string;
          name?: string;
          avatar_url?: string;
          html_url?: string;
          public_repos?: number;
        };
        return NextResponse.json({
          ok: true,
          exists: true,
          username,
          name: data.name || "",
          avatarUrl: data.avatar_url || "",
          htmlUrl: data.html_url || githubProfileUrl(username),
          publicRepos: typeof data.public_repos === "number" ? data.public_repos : 0,
        });
      } catch (e) {
        networkError = e;
      }
    }

    console.error("[GET /api/github-user] 全部数据源不可用", networkError);
    return error("暂时无法连接 GitHub 校验用户名，请稍后重试", 502);
  } catch (e) {
    return internalError("[GET /api/github-user] 校验失败", e);
  }
}

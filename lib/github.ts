/**
 * GitHub 账号相关的纯函数工具（前后端共用）。
 * 后台只需填写用户名（如 sxlb），链接由程序拼接，避免用户手抄完整网址出错。
 */

/** GitHub 用户名规则：字母/数字/连字符，不能以连字符开头或结尾，最长 39 字符 */
export const GITHUB_USERNAME_RE = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/;

/**
 * 从任意输入中解析出 GitHub 用户名。
 * 兼容：`sxlb`、`@sxlb`、`https://github.com/sxlb`、`github.com/sxlb/repo`。
 */
export function parseGithubUsername(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  const matched = raw.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#\s]+)/i);
  if (matched) return matched[1];
  return raw.replace(/^@/, "").split(/[/?#\s]/)[0];
}

/** 用户名 → GitHub 主页地址 */
export function githubProfileUrl(username: string): string {
  return `https://github.com/${username}`;
}

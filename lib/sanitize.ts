/**
 * 基础 HTML 清理：仅保留白名单标签 + 安全属性，移除所有 on* 事件属性和危险协议 URL。
 * 用于渲染由管理员在后台配置的富文本文本（如 siteFooterHtml），
 * 防止恶意脚本注入。由于是管理员自用站点，不要求对抗高级攻击，
 * 以"最小内联 + 零执行"为原则。
 *
 * ⚠️ 纯函数、无服务端依赖，供 SSR、CSR 和 API 路由共用。
 */

const SAFE_TAGS = new Set([
  "div", "p", "span", "br", "hr", "strong", "em", "u", "s", "del",
  "a", "code", "pre", "blockquote",
]);
const SAFE_ATTRS = new Set(["href", "title", "rel", "target"]);
const ALLOWED_HREF_PROTOCOLS = new Set(["http", "https", "mailto", "tel"]);
const ON_RE = /^on/i;

export function sanitizeHtml(raw: string): string {
  if (!raw) return "";
  const safe = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 用正则恢复受信任的标签和属性——白名单过滤后重建
  return safe.replace(/&lt;(\/?)([\w-]+)([^&]*?)&gt;/g, (_fullMatch: string, _slash: string, tag: string, attrs: string) => {
    const lowerTag = tag.toLowerCase();
    if (!SAFE_TAGS.has(lowerTag)) return ""; // 非白名单 → 直接丢弃
    const filteredAttrs = attrs.replace(/\s+([\w-]+)(?:=(".*?"|'.*?'|\S+))?/g, (_m: string, attrName: string, attrVal: string | undefined) => {
      const la = attrName.toLowerCase();
      if (la.startsWith("data-")) return ` ${la}`; // data-* 全放行
      if (ON_RE.test(la)) return ""; // 事件属性一律清除
      if (!SAFE_ATTRS.has(la)) return "";
      const sanitizedVal = attrVal != null ? attrVal.replace(/^["']|["']$/g, "") : "";
      if (attrVal != null && ["href", "src"].includes(la) && !ALLOWED_HREF_PROTOCOLS.has(sanitizedVal.split(":")[0].toLowerCase())) {
        return "";
      }
      return attrVal ? ` ${la}="${sanitizedVal}"` : ` ${la}`;
    });
    return `<${lowerTag}${filteredAttrs}>`;
  });
}

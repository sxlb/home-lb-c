/**
 * CSV 工具集：单元格转义 + 生成带 UTF-8 BOM 的 CSV 文本（Excel 兼容）。
 * BOM（\uFEFF）确保中文字段在 Excel 中直接打开不乱码。
 */

/** 转义单个单元格：含逗号/引号/换行时用双引号包裹，引号翻倍 */
export function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 组装完整 CSV 文本（UTF-8 BOM，CRLF 换行）。
 * 供 API 下载端点使用，直接作为响应体返回。
 */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvEscape).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
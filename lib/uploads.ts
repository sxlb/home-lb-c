import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

/** 上传文件目录（Docker 卷映射，与 wallpapers 并列） */
export function getUploadsDir(): string {
  return path.join(process.cwd(), "data", "uploads");
}

/** 单文件上限：10MB */
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

/**
 * 按文件头（Magic Number）识别图片类型。
 * 支持 jpg/png/webp/gif/avif/bmp/ico；SVG 及未知二进制返回 null。
 */
export function detectImageExt(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return ".png";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(Buffer.from("RIFF")) &&
    buffer.subarray(8, 12).equals(Buffer.from("WEBP"))
  ) return ".webp";
  if (buffer.length >= 6 && buffer.subarray(0, 4).equals(Buffer.from("GIF8"))) return ".gif";
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).equals(Buffer.from("ftyp")) &&
    (buffer.subarray(8, 12).equals(Buffer.from("avif")) ||
      buffer.subarray(8, 12).equals(Buffer.from("avis")))
  ) return ".avif";
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) return ".bmp";
  // ICO：00 00 01 00（保留字 + 类型 1 = 图标）
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00
  ) return ".ico";
  return null;
}

/** 文件名安全校验：白名单字符 + 禁止目录穿越 */
export function isSafeFileName(fileName: string): boolean {
  if (!/^[0-9a-zA-Z_.-]+$/.test(fileName)) return false;
  if (fileName === "." || fileName === ".." || fileName.includes("..")) return false;
  return true;
}

/** 扩展名 → Content-Type（供文件响应使用） */
function contentTypeFromExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
  };
  return map[ext] || "application/octet-stream";
}

/** 生成唯一安全的文件名 */
function newFileName(ext: string): string {
  return `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
}

/**
 * 保存上传文件：写入 uploads 目录并返回相对 URL（如 /api/uploads/file/xxx.png）。
 * 校验失败（类型不支持/为空/超限）抛错。
 */
export async function saveUpload(buffer: Buffer): Promise<string> {
  if (buffer.byteLength === 0) throw new Error("文件内容为空");
  if (buffer.byteLength > MAX_UPLOAD_SIZE) throw new Error("文件超过 10MB 限制");
  const ext = detectImageExt(buffer);
  if (!ext) throw new Error("不支持的图片类型（仅支持 jpg/png/webp/gif/avif/bmp/ico）");

  const fileName = newFileName(ext);
  const dir = getUploadsDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), buffer);
  return `/api/uploads/file/${fileName}`;
}

/**
 * 读取上传文件。文件名不合法 / 不存在返回 null。
 */
export async function readUpload(
  fileName: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isSafeFileName(fileName)) return null;
  const dir = getUploadsDir();
  const filePath = path.join(dir, fileName);
  if (!filePath.startsWith(dir + path.sep)) return null;
  try {
    const buffer = await fs.readFile(filePath);
    return { buffer, contentType: contentTypeFromExt(fileName) };
  } catch {
    return null;
  }
}

import { getUploadsDir, detectImageExt, MAX_UPLOAD_SIZE } from "@/lib/uploads";

/**
 * 媒体库工具集：图片尺寸解析 + MIME 推断。
 * width/height 用于媒体库网格展示；解析失败时回退为 {0,0}（不影响上传）。
 */

/** 扩展名 → MIME（与 lib/uploads 的文件响应映射保持一致） */
export function mimeFromExt(ext: string): string {
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
  return map[ext.toLowerCase()] || "image/png";
}

/** 读取原始图片尺寸（仅头部几十字节即可解析；解析失败返回 0,0） */
export function getImageSize(buffer: Buffer): { width: number; height: number } {
  const ext = detectImageExt(buffer);
  if (!ext) return { width: 0, height: 0 };

  try {
    if (ext === ".png") {
      // PNG: 8 字节签名 + IHDR (宽高为第 4 字节起的大端 uint32)
      if (buffer.length >= 24) {
        return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
      }
    } else if (ext === ".gif") {
      // GIF: 第 6/7 字节为宽，8/9 为高（小端 uint16）
      if (buffer.length >= 10) {
        return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
      }
    } else if (ext === ".bmp") {
      // BMP: DIB 头第 4/8 字节为宽高（小端 int32）
      if (buffer.length >= 26) {
        return { width: buffer.readInt32LE(18), height: Math.abs(buffer.readInt32LE(22)) };
      }
    } else if (ext === ".webp") {
      return webpSize(buffer);
    } else if (ext === ".jpg" || ext === ".jpeg") {
      return jpegSize(buffer);
    } else if (ext === ".ico") {
      return icoSize(buffer);
    }
  } catch {
    // 忽略解析异常，回退 0,0
  }
  return { width: 0, height: 0 };
}

/** WebP 尺寸：VP8 / VP8L / VP8X 三种头布局不同（RIFF 头：12 字节后为 FourCC，其 payload 自 offset 16 起） */
function webpSize(buffer: Buffer): { width: number; height: number } {
  if (buffer.length < 21) return { width: 0, height: 0 };
  const type = buffer.toString("ascii", 12, 16);
  if (type === "VP8X") {
    // VP8X: payload 自 16 起 = 保留(1) + flags(3) + 宽-1(24bit LE) + 高-1(24bit LE)
    if (buffer.length < 26) return { width: 0, height: 0 };
    const w = buffer.readUIntLE(20, 3);
    const h = buffer.readUIntLE(23, 3);
    return { width: w + 1, height: h + 1 };
  }
  if (type === "VP8 ") {
    // VP8 lossy: payload = 帧标签(3) + startcode(0x9D 0x01 0x2A)(3) + 宽(16bit) + 高(16bit)
    if (buffer.length < 26) return { width: 0, height: 0 };
    const w = buffer.readUInt16LE(22);
    const h = buffer.readUInt16LE(24);
    return { width: w & 0x3fff, height: h & 0x3fff };
  }
  if (type === "VP8L") {
    // VP8L lossless: payload = 签名(0x2F)(1) + 打包值(32bit LE)：bit0-13 宽-1、bit14-27 高-1
    if (buffer.length < 21) return { width: 0, height: 0 };
    const b = buffer.readUInt32LE(17);
    const w = b & 0x3fff;
    const h = (b >> 14) & 0x3fff;
    return { width: w + 1, height: h + 1 };
  }
  return { width: 0, height: 0 };
}

/** JPEG 尺寸：遍历 SOF 标记（FFC0-FFC3, FFC5-FFC7, FFC9-FFCB, FFCD-FFCF） */
function jpegSize(buffer: Buffer): { width: number; height: number } {
  let i = 2; // 跳过 SOI (FFD8)
  while (i + 8 < buffer.length) {
    if (buffer[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buffer[i + 1];
    // 独立标记跳过
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const isSOF =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    const len = buffer.readUInt16BE(i + 2);
    if (isSOF && len >= 7) {
      return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return { width: 0, height: 0 };
}

/** ICO 尺寸：目录头第 2/3 字节为宽/高（0 表示 256） */
function icoSize(buffer: Buffer): { width: number; height: number } {
  if (buffer.length < 6) return { width: 0, height: 0 };
  const w = buffer[0x06] || 256;
  const h = buffer[0x07] || 256;
  return { width: w, height: h };
}

export { getUploadsDir, detectImageExt, MAX_UPLOAD_SIZE };
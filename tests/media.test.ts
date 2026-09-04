import { describe, it, expect } from "vitest";
import { getImageSize, mimeFromExt } from "@/lib/media";

function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8); // IHDR 长度
  buf.write("IHDR", 12); // 块类型
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function gif(width: number, height: number): Buffer {
  const buf = Buffer.alloc(10);
  buf.write("GIF89a", 0);
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

function jpeg(width: number, height: number): Buffer {
  const buf = Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0
    0x00, 0x0b, // 段长度
    0x08, // 精度
  ]);
  const w = Buffer.alloc(4);
  w.writeUInt16BE(height, 0);
  w.writeUInt16BE(width, 2);
  return Buffer.concat([buf, w]);
}

function webpLossy(width: number, height: number): Buffer {
  const head = Buffer.alloc(22);
  head.write("RIFF", 0);
  head.writeUInt32LE(40, 4);
  head.write("WEBP", 8);
  head.write("VP8 ", 12);
  // payload: 帧标签(3)+startcode(3) 填充
  head.fill(0, 16, 22);
  head[19] = 0x9d;
  head[20] = 0x01;
  head[21] = 0x2a;
  const dim = Buffer.alloc(4);
  dim.writeUInt16LE(width & 0x3fff, 0);
  dim.writeUInt16LE(height & 0x3fff, 2);
  return Buffer.concat([head, dim]);
}

function webpLossless(width: number, height: number): Buffer {
  const head = Buffer.alloc(17);
  head.write("RIFF", 0);
  head.writeUInt32LE(30, 4);
  head.write("WEBP", 8);
  head.write("VP8L", 12);
  head[16] = 0x2f;
  const packed = (width - 1) | ((height - 1) << 14);
  const val = Buffer.alloc(4);
  val.writeUInt32LE(packed, 0);
  return Buffer.concat([head, val]);
}

describe("getImageSize（图片尺寸解析）", () => {
  it("PNG 读取宽高", () => {
    expect(getImageSize(png(200, 100))).toEqual({ width: 200, height: 100 });
  });

  it("GIF 读取宽高", () => {
    expect(getImageSize(gif(300, 150))).toEqual({ width: 300, height: 150 });
  });

  it("JPEG 读取宽高", () => {
    expect(getImageSize(jpeg(160, 80))).toEqual({ width: 160, height: 80 });
  });

  it("WebP lossy 读取宽高", () => {
    expect(getImageSize(webpLossy(120, 60))).toEqual({ width: 120, height: 60 });
  });

  it("WebP lossless 读取宽高", () => {
    expect(getImageSize(webpLossless(120, 60))).toEqual({ width: 120, height: 60 });
  });

  it("非图片 / 未知类型回退 0,0", () => {
    expect(getImageSize(Buffer.from("hello world, not an image"))).toEqual({ width: 0, height: 0 });
  });
});

describe("mimeFromExt", () => {
  it("常见扩展名映射正确", () => {
    expect(mimeFromExt(".png")).toBe("image/png");
    expect(mimeFromExt(".JPG")).toBe("image/jpeg");
    expect(mimeFromExt(".webp")).toBe("image/webp");
    expect(mimeFromExt(".svg")).toBe("image/svg+xml");
  });

  it("未知扩展名回退 image/png", () => {
    expect(mimeFromExt(".xyz")).toBe("image/png");
  });
});
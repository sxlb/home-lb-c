import { createHmac, randomBytes } from "node:crypto";

/**
 * TOTP（RFC 6238）零依赖实现：HMAC-SHA1 + base32 secret + 30s 步长。
 * 用于后台两步验证（与 Google Authenticator / 1Password 等兼容）。
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** 生成随机 base32 secret（20 字节 → 32 字符，无 padding） */
export function generateSecret(): string {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** base32 解码（容忍小写与 padding/空格） */
function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** HOTP（RFC 4226）：HMAC-SHA1 动态截断 → 6 位数字 */
function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

/**
 * 验证 TOTP 验证码：30s 步长，允许 ±window 步时间漂移（默认 ±1 步）。
 */
export function verifyTOTP(secret: string, code: string, window = 1): boolean {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) return false;
  const decoded = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    if (hotp(decoded, counter + i) === normalized) return true;
  }
  return false;
}

/** 生成 otpauth:// URI（可复制到 Authenticator 手动添加或扫码） */
export function buildOtpauthUrl(secret: string, account = "admin"): string {
  return `otpauth://totp/${encodeURIComponent(account)}?secret=${secret}&issuer=home-lb&algorithm=SHA1&digits=6&period=30`;
}

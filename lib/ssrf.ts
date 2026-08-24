import dns from "node:dns";
import net from "node:net";

/**
 * SSRF 防护工具：校验外部 URL 不允许指向内网 / 保留地址。
 *
 * 原理：
 * 1. 协议只允许 http / https
 * 2. 字面量 IP 直接按私网 / 保留地址段判断
 * 3. 域名先 DNS 解析（含全部 A/AAAA 记录），任一解析结果为私网 / 保留地址即拒绝，
 *    防止 DNS rebinding 攻击（攻击者先让域名解析为公网通过校验，再切换到内网地址）
 */

/** 校验不通过时抛出的错误类型 */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

// IPv4 私网 / 保留地址段（base 为网络号整数，prefix 为前缀长度）
const PRIVATE_IPV4_CIDRS: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8 本机（"当前网络"）
  [0x0a000000, 8], // 10.0.0.0/8 私有
  [0x7f000000, 8], // 127.0.0.0/8 环回
  [0x64400000, 10], // 100.64.0.0/10 CGNAT
  [0xa9fe0000, 16], // 169.254.0.0/16 链路本地
  [0xac100000, 12], // 172.16.0.0/12 私有
  [0xc0a80000, 16], // 192.168.0.0/16 私有
  [0xe0000000, 4], // 224.0.0.0/4 组播
  [0xf0000000, 4], // 240.0.0.0/4 保留
];

/** "a.b.c.d" -> 32 位无符号整数；格式非法返回 null */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

function cidrMask(prefix: number): number {
  if (prefix === 0) return 0;
  return (~0 << (32 - prefix)) >>> 0;
}

/** 判断 IPv4 是否为私网 / 保留地址 */
export function isPrivateIPv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return false;
  return PRIVATE_IPV4_CIDRS.some(([base, prefix]) => {
    const mask = cidrMask(prefix);
    return (value & mask) === (base & mask);
  });
}

/** 判断 IPv6 是否为私网 / 保留地址（含 IPv4 映射地址） */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true; // 未指定 / 环回
  if (normalized.startsWith("::ffff:")) {
    // IPv4 映射地址 ::ffff:a.b.c.d → 按 IPv4 判断
    return isPrivateIPv4(normalized.slice("::ffff:".length));
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 ULA
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true; // fe80::/10 链路本地
  }
  if (normalized.startsWith("ff")) return true; // ff00::/8 组播
  return false;
}

/**
 * 判断单个地址（IPv4 / IPv6，可含 %scope）是否为私网 / 保留地址。
 * 传入域名时返回 false（域名交由 DNS 解析校验）。
 */
export function isPrivateAddress(address: string): boolean {
  const ip = address.trim().toLowerCase();
  if (!ip) return false;
  // 去掉 IPv6 链路本地作用域标识（如 fe80::1%eth0）
  const noScope = ip.split("%")[0];
  if (net.isIPv6(noScope)) return isPrivateIPv6(noScope);
  if (net.isIPv4(noScope)) return isPrivateIPv4(noScope);
  return false;
}

/** 解析域名的全部 A/AAAA 记录；解析失败抛 UnsafeUrlError */
async function lookupAll(hostname: string): Promise<string[]> {
  try {
    // all: true 时恒返回地址数组
    const addresses = await dns.promises.lookup(hostname, { all: true });
    return addresses.map((item) => item.address);
  } catch (e) {
    throw new UnsafeUrlError(
      `DNS 解析失败，无法确认目标地址安全性: ${hostname}（${e instanceof Error ? e.message : String(e)}）`
    );
  }
}

/**
 * 校验 URL 是否允许作为服务端出站请求目标。
 * - 协议必须为 http / https
 * - 字面量 IP 不得为私网 / 保留地址（allowPrivate 时放行，用于管理员明确配置的自建 API）
 * - 域名解析后所有记录均不得为私网 / 保留地址（防 DNS rebinding；allowPrivate 时放行）
 * 校验通过返回 URL 对象，否则抛 UnsafeUrlError。
 */
export async function assertPublicHttpUrl(
  rawUrl: string,
  opts: { allowPrivate?: boolean } = {}
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("URL 格式不合法");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(`仅允许 http/https 协议，收到: ${url.protocol}`);
  }
  const host = url.hostname;
  // 管理员白名单放行：跳过私网/保留地址校验（自建 NeteaseCloudMusicApi 常部署于本机/内网）
  if (opts.allowPrivate) return url;
  if (isPrivateAddress(host)) {
    throw new UnsafeUrlError(`目标地址为内网/保留地址，已拒绝: ${host}`);
  }
  if (!net.isIPv4(host) && !net.isIPv6(host)) {
    // 域名：解析全部记录，任一私网即拒绝（防 DNS rebinding）
    const addresses = await lookupAll(host);
    for (const addr of addresses) {
      if (isPrivateAddress(addr)) {
        throw new UnsafeUrlError(`目标域名 ${host} 解析到内网/保留地址，已拒绝: ${addr}`);
      }
    }
  }
  return url;
}

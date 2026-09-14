/**
 * 访问统计辅助：User-Agent 解析（设备/系统/浏览器）与来源域名提取。
 * 纯正则、无第三方依赖，用于 /api/stats 记录访问明细。
 */

/** 解析后的访问维度 */
export interface UaInfo {
  device: "desktop" | "mobile" | "tablet";
  os: string;
  browser: string;
}

/**
 * 从 UA 字符串解析设备/系统/浏览器。
 * 顺序敏感：先判平板（避免 iPad iOS 被 Mobile 命中判成手机），再判移动端。
 */
export function parseUserAgent(ua: string): UaInfo {
  if (!ua) return { device: "desktop", os: "", browser: "" };

  let device: UaInfo["device"] = "desktop";
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua)) {
    device = "tablet";
  } else if (/Mobi|Android|iPhone|iPod|BlackBerry|Opera Mini|Windows Phone/i.test(ua)) {
    device = "mobile";
  }

  // 系统
  let os = "";
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/Windows NT (\d+\.\d+)/i))) {
    const v = Number(m[1]);
    os = v >= 10 ? "Windows 10/11" : v >= 6.2 ? "Windows 8" : v >= 6.1 ? "Windows 7" : "Windows";
  } else if (/Android (\d[\d.]*)/i.test(ua)) {
    os = "Android " + (ua.match(/Android (\d[\d.]*)/i)?.[1] ?? "");
  } else if (/CPU (iPhone )?OS (\d+[_a-z]*)/i.test(ua)) {
    os = "iOS";
  } else if (/Mac OS X [\d_.]+/i.test(ua)) {
    os = "macOS";
  } else if (/CrOS/i.test(ua)) {
    os = "ChromeOS";
  } else if (/Linux/i.test(ua)) {
    os = /Ubuntu/i.test(ua) ? "Ubuntu" : "Linux";
  } else {
    os = "";
  }

  // 浏览器（顺序：Edge 需在 Chrome 前，Safari 需剔除 Chromium 内核）
  let browser = "";
  if (/Edg[Ae]?\//i.test(ua)) {
    browser = "Edge";
  } else if (/MicroMessenger/i.test(ua)) {
    browser = "微信";
  } else if (/OPR\//i.test(ua)) {
    browser = "Opera";
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = "Samsung 浏览器";
  } else if (/Firefox\//i.test(ua)) {
    browser = "Firefox";
  } else if (/Chrome\//i.test(ua) || /CriOS\//i.test(ua)) {
    browser = "Chrome";
  } else if (/Safari\//i.test(ua)) {
    browser = "Safari";
  } else {
    browser = "";
  }

  return { device, os, browser };
}

/** 从 Referer 提取来源域名（http(s)://host 形式）；非 http 或空返回 ""（直接访问/书签） */
export function extractReferrerDomain(referer: string): string {
  if (!referer) return "";
  try {
    const u = new URL(referer);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

/** 当前东八区小时（0-23），与 /api/stats 日期口径一致 */
export function nowHour(): number {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return now.getUTCHours();
}

/**
 * 常见爬虫 / 机器人 / 探针的 UA 特征。
 * 覆盖：搜索引擎蜘蛛、社交平台抓取、SEO 工具、监控探活、脚本客户端与无头浏览器。
 */
const BOT_UA_RE =
  /(bot\b|bots\b|crawler|spider|crawling|slurp|facebookexternalhit|embedly|quora link preview|pinterest|bitlybot|vkshare|whatsapp|telegrambot|discordbot|googlebot|bingbot|baiduspider|yandexbot|sogou|360spider|bytespider|petalbot|applebot|semrush|ahrefs|mj12bot|dotbot|uptimerobot|pingdom|statuscake|headlesschrome|lighthouse|pagespeed|python-requests|python-urllib|aiohttp|httpx|curl\/|wget\/|go-http-client|java\/|okhttp|axios\/|node-fetch|undici|libwww-perl|monitor|probe|scanner)/i;

/**
 * 判断 UA 是否属于爬虫 / 机器人 / 探针。
 *
 * 用于统计采集侧过滤：若不区分，搜索引擎蜘蛛、监控探活与各类扫描器都会被计入
 * PV / UV，并被归类进「设备分布」「地域分布」，使后台数字与实际访客量系统性偏离。
 * 空 UA 同样视为非人类流量（正常浏览器必带 UA）。
 */
export function isBotUserAgent(ua: string): boolean {
  const value = (ua || "").trim();
  if (!value) return true;
  return BOT_UA_RE.test(value);
}
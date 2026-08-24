import { NextResponse, NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/server";

export const dynamic = "force-dynamic";

interface AmapWeather {
  status?: string;
  info?: string;
  lives?: Array<{
    province?: string;
    city?: string;
    weather?: string;
    temperature?: string;
    winddirection?: string;
    windpower?: string;
  }>;
}

interface TencentWeather {
  data?: {
    observe?: {
      degree?: string;
      weather?: string;
      wind_direction?: string;
      wind_direction_name?: string;
      wind_power?: string;
    };
  };
}

interface WeatherResult {
  city: string;
  weather: string;
  temperature: string;
  winddirection: string;
  windpower: string;
}

// 按 IP 的轻量出站频率限制：仅针对"按访客 IP 自动定位"（未配置固定城市）的请求生效。
// x-forwarded-for 可被请求方伪造，防止频繁触发外部天气出站请求。
const WEATHER_IP_WINDOW_MS = 60 * 1000;
const WEATHER_IP_LIMIT = 30;
const ipRequests = new Map<string, { count: number; firstAt: number }>();
function isIpRateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = ipRequests.get(ip);
  if (!rec || now - rec.firstAt > WEATHER_IP_WINDOW_MS) {
    // Map 过大时惰性清理过期条目，防止伪造大量 IP 撑爆内存
    if (ipRequests.size > 10_000) {
      for (const [k, v] of ipRequests) {
        if (now - v.firstAt > WEATHER_IP_WINDOW_MS) ipRequests.delete(k);
      }
    }
    ipRequests.set(ip, { count: 1, firstAt: now });
    return false;
  }
  rec.count += 1;
  return rec.count > WEATHER_IP_LIMIT;
}

/** 清洗访客 IP：仅保留 IPv4/IPv6 合法字符，防止拼接进定位接口 URL 造成注入 */
function sanitizeIp(ip: string): string {
  if (!ip) return "";
  const cleaned = ip.trim();
  return /^[0-9a-fA-F:.]+$/.test(cleaned) ? cleaned : "";
}

/**
 * 腾讯位置服务 WebServiceAPI 数字签名（RFC 规范）：
 * 1. 参数按 key 字典序（ASCII）升序排列
 * 2. 拼接为 "k=v&k=v"（值需 URL 编码）
 * 3. 末尾直接拼接 SK（不编码）
 * 4. 整体 MD5 后转大写，即 sig
 */
function tencentSign(params: Record<string, string>, sk: string): string {
  const query = Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
  return createHash("md5").update(`${query}${sk}`).digest("hex").toUpperCase();
}

/** 组装腾讯 WebServiceAPI 请求参数（含可选签名） */
function buildTencentParams(base: Record<string, string>, sk: string): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) sp.set(k, v);
  if (sk) sp.set("sig", tencentSign(base, sk));
  return sp;
}

/**
 * 高德 Web 服务 API 数字签名（官方规范）：
 * sig = MD5(参数按名升序排序的 "k=v&k=v" 拼接串 + 私钥)
 * - 参与签名的参数包含 key，不含 sig 本身
 * - 值不做 URL 编码（请求时再编码，与官方「＋号正常计算 sig」一致）；私钥直接拼接（无 & 前缀）
 * - MD5 输出小写 hex
 */
function amapSign(params: Record<string, string>, secret: string): string {
  const query = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("md5").update(`${query}${secret}`, "utf8").digest("hex");
}

/** 组装高德请求参数（含可选签名） */
function buildAmapParams(base: Record<string, string>, secret: string): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) sp.set(k, v);
  if (secret) sp.set("sig", amapSign(base, secret));
  return sp;
}

// ===== 天气结果缓存（5 分钟 TTL）=====
// 目的：高德 / 腾讯等外部数据源响应慢且不稳定，
// 为每个访客都实时请求会拖慢接口并刷屏日志。缓存命中后响应 <100ms。
interface WeatherCacheEntry {
  data: WeatherResult;
  expireAt: number;
}
const weatherCache = new Map<string, WeatherCacheEntry>();
const WEATHER_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

/** 读取有效缓存 */
function getWeatherCache(key: string): WeatherResult | null {
  const entry = weatherCache.get(key);
  if (!entry) return null;
  if (entry.expireAt > Date.now()) return entry.data;
  weatherCache.delete(key);
  return null;
}

/** 数据源全部失败时的过期兜底（弱网/上游挂掉时仍能返回最近一次成功数据） */
function getStaleWeatherCache(key: string): WeatherResult | null {
  const entry = weatherCache.get(key);
  return entry ? entry.data : null;
}

/** 写入缓存 */
function setWeatherCache(key: string, data: WeatherResult): void {
  weatherCache.set(key, { data, expireAt: Date.now() + WEATHER_CACHE_TTL });
  // 防止无限增长：缓存项超过 50 个时清理过期项
  if (weatherCache.size > 50) {
    const now = Date.now();
    for (const [k, v] of weatherCache) {
      if (v.expireAt <= now) weatherCache.delete(k);
    }
  }
}

// ===== 数据源 1：高德天气（需 Web 服务 Key，city 必填：adcode 或城市名） =====
// 未指定城市时用访客 IP 自动定位（ip 可为空，此时退回服务器 IP 定位）；
// secret 非空时按高德签名规范生成 sig（key 开启数字签名时必填，未开启可留空直调）
async function fetchAmapWeather(
  amapKey: string,
  city: string,
  ip: string,
  secret: string
): Promise<WeatherResult> {
  let cityCode = city.trim();
  // 高德天气接口必须传 city（adcode），否则返回 20000 INVALID_PARAMS：
  // 未指定城市时尝试 IP 定位自动获取 adcode
  if (!cityCode) {
    try {
      const locParams: Record<string, string> = { key: amapKey };
      if (ip) locParams.ip = ip;
      const url = new URL("https://restapi.amap.com/v3/ip");
      url.search = buildAmapParams(locParams, secret).toString();
      const ipRes = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (ipRes.ok) {
        const ipData = (await ipRes.json()) as { status?: string; adcode?: string | string[] };
        const ad = Array.isArray(ipData.adcode) ? ipData.adcode[0] : ipData.adcode;
        if (ipData.status === "1" && ad) cityCode = ad;
      }
    } catch {
      /* 定位失败走下方明确报错 */
    }
  }
  if (!cityCode) {
    throw new Error("高德天气需要指定城市（请在后台「天气设置 → 城市」填写城市名或 adcode）");
  }
  const wParams: Record<string, string> = {
    key: amapKey,
    city: cityCode,
    extensions: "base",
    output: "JSON",
  };
  const res = await fetch(
    `https://restapi.amap.com/v3/weather/weatherInfo?${buildAmapParams(wParams, secret).toString()}`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) throw new Error("amap http error");
  const data = (await res.json()) as AmapWeather;
  if (data.status !== "1" || !data.lives?.[0]) {
    throw new Error(`amap api error: ${data.info || "未知错误"}（${data.status}）`);
  }
  const live = data.lives[0];
  const winddirection =
    live.winddirection && live.winddirection.endsWith("风")
      ? live.winddirection
      : `${live.winddirection || "未知"}风`;
  const windpowerRaw = String(live.windpower ?? "未知");
  const windpower = windpowerRaw.endsWith("级") ? windpowerRaw : `${windpowerRaw}级`;
  return {
    city: live.city || live.province || "未知地区",
    weather: live.weather || "未知",
    temperature: `${live.temperature ?? "--"}℃`,
    winddirection,
    windpower,
  };
}

// ===== 数据源 2：腾讯天气（免费无密钥，需城市名，先反查省/市再查实况） =====
async function fetchTencentWeather(city: string): Promise<WeatherResult> {
  // 1. 城市反查：city/like 返回 { "101280601": "广东, 深圳" }
  const likeRes = await fetch(
    `https://wis.qq.com/city/like?source=pc&city=${encodeURIComponent(city)}`,
    { cache: "no-store", signal: AbortSignal.timeout(8000) }
  );
  if (!likeRes.ok) throw new Error("tencent city http error");
  const likeData = (await likeRes.json()) as { data?: Record<string, string> };
  const firstKey = likeData.data ? Object.keys(likeData.data)[0] : null;
  if (!firstKey || !likeData.data) throw new Error(`未找到城市：${city}`);
  const [province, cityName] = String(likeData.data[firstKey])
    .split(",")
    .map((s) => s.trim());

  // 2. 实况天气
  const wRes = await fetch(
    `https://wis.qq.com/weather/common?source=pc&weather_type=observe&province=${encodeURIComponent(
      province
    )}&city=${encodeURIComponent(cityName)}`,
    { cache: "no-store", signal: AbortSignal.timeout(8000) }
  );
  if (!wRes.ok) throw new Error("tencent weather http error");
  const wData = (await wRes.json()) as TencentWeather;
  const observe = wData.data?.observe;
  if (!observe) throw new Error("tencent weather no data");
  // 优先使用中文风向名（wind_direction_name），回退到 wind_direction
  const windDirRaw = observe.wind_direction_name || observe.wind_direction || "未知";
  const winddirection = windDirRaw.endsWith("风") ? windDirRaw : `${windDirRaw}风`;
  const windpowerRaw = String(observe.wind_power ?? "未知");
  const windpower = windpowerRaw.endsWith("级") ? windpowerRaw : `${windpowerRaw}级`;
  return {
    city: cityName || city,
    weather: observe.weather || "未知",
    temperature: `${observe.degree ?? "--"}℃`,
    winddirection,
    windpower,
  };
}

// ===== 数据源 3：腾讯天气 Key 版（腾讯位置服务，需 Key：IP 定位 + 实况天气） =====
interface TencentLbsLocation {
  status?: number;
  message?: string;
  result?: {
    ad_info?: { adcode?: number; province?: string; city?: string; district?: string };
  };
}

interface TencentLbsWeather {
  status?: number;
  message?: string;
  result?: {
    now?: { temp?: string | number; weather?: string; wind_dir?: string; wind_power?: string };
  };
}

async function fetchTencentKeyWeather(txKey: string, txSk: string, ip: string): Promise<WeatherResult> {
  // 1. 腾讯位置服务 IP 定位 → adcode（ip 可为空，此时按请求方 IP 定位；sk 非空时带签名）
  const locParams: Record<string, string> = { key: txKey };
  if (ip) locParams.ip = ip;
  const locUrl = new URL("https://apis.map.qq.com/ws/location/v1/ip");
  locUrl.search = buildTencentParams(locParams, txSk).toString();
  const locRes = await fetch(locUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!locRes.ok) throw new Error("tencent-key location http error");
  const loc = (await locRes.json()) as TencentLbsLocation;
  if (loc.status !== 0 || !loc.result?.ad_info?.adcode) {
    throw new Error(`tencent-key location error: ${loc.message || "no adcode"}`);
  }
  const ad = loc.result.ad_info;
  const adcode = ad.adcode;
  const city = ad.district || ad.city || ad.province || "未知地区";

  // 2. 腾讯天气实况（同样携带签名）
  const wParams: Record<string, string> = { key: txKey, adcode: String(adcode), type: "now" };
  const wUrl = new URL("https://apis.map.qq.com/ws/weather/v1/");
  wUrl.search = buildTencentParams(wParams, txSk).toString();
  const wRes = await fetch(wUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!wRes.ok) throw new Error("tencent-key weather http error");
  const wData = (await wRes.json()) as TencentLbsWeather;
  if (wData.status !== 0 || !wData.result?.now) {
    throw new Error(`tencent-key weather error: ${wData.message || "no data"}`);
  }
  const now = wData.result.now;
  const windDirRaw = String(now.wind_dir ?? "未知");
  const winddirection = windDirRaw.endsWith("风") ? windDirRaw : `${windDirRaw}风`;
  const windpowerRaw = String(now.wind_power ?? "未知");
  const windpower = windpowerRaw.endsWith("级") ? windpowerRaw : `${windpowerRaw}级`;
  return {
    city,
    weather: String(now.weather ?? "未知"),
    temperature: `${now.temp ?? "--"}℃`,
    winddirection,
    windpower,
  };
}

export async function GET(request: NextRequest) {
  // 访客真实 IP：天气自动定位使用（取 x-forwarded-for 首个 IP，可被代理设置）
  const visitorIp = sanitizeIp(getClientIp(request));
  const profile = await prisma.profile.findFirst().catch(() => null);
  const provider = profile?.weatherProvider || "";
  const amapKey = profile?.amapKey || "";
  const amapSecretKey = profile?.amapSecretKey || "";
  const weatherCity = profile?.weatherCity || "";
  const txKey = profile?.txWeatherKey || "";
  const txSk = profile?.txWeatherSk || "";
  // 缓存键：配置了固定城市则全局共享；未配置（按访客 IP 自动定位）则按 IP 区分，避免跨访客串缓存
  const cacheKey = `${provider}:${amapKey}:${amapSecretKey}:${weatherCity}:${txKey}:${txSk}:${weatherCity ? "" : visitorIp}`;

  // 命中有效缓存：直接返回（响应 <100ms，且不再打外部接口）
  const cached = getWeatherCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  // 未配置固定城市时按访客 IP 自动定位：对出站请求做宽松限流，
  // 防止伪造 x-forwarded-for 频繁触发外部天气接口
  if (!weatherCity && isIpRateLimited(visitorIp)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  // 收集可用数据源（高德 / 腾讯 Key 版 / 腾讯免费版），配置的 provider 优先尝试；
  // 某个源失败时自动切换下一个可用源（如高德挂掉回退腾讯），保证页面可用
  const sources: { name: string; fn: () => Promise<WeatherResult> }[] = [];
  if (amapKey) {
    sources.push({ name: "amap", fn: () => fetchAmapWeather(amapKey, weatherCity, visitorIp, amapSecretKey) });
  }
  if (txKey) {
    sources.push({ name: "tencent-key", fn: () => fetchTencentKeyWeather(txKey, txSk, visitorIp) });
  }
  if (weatherCity) {
    sources.push({ name: "tencent", fn: () => fetchTencentWeather(weatherCity) });
  }
  sources.sort((a, b) => (a.name === provider ? -1 : 0) - (b.name === provider ? -1 : 0));

  if (sources.length === 0) {
    return NextResponse.json(
      { error: "未配置天气数据源，请在后台「天气设置」中配置高德 Key 或腾讯天气" },
      { status: 400 }
    );
  }

  let lastError = "";
  for (const src of sources) {
    try {
      const result = await src.fn();
      setWeatherCache(cacheKey, result);
      return NextResponse.json(result);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn(`[weather] 数据源 ${src.name} 获取失败: ${lastError}`);
    }
  }

  // 全部失败：优先返回最近一次成功缓存（弱网/上游挂掉时页面仍可用），否则 500
  const stale = getStaleWeatherCache(cacheKey);
  if (stale) return NextResponse.json(stale);
  console.error(`[GET /api/weather] error: ${lastError}`);
  return NextResponse.json({ error: "天气服务异常" }, { status: 500 });
}

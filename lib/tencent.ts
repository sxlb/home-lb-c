import { createHash } from "node:crypto";

/**
 * 腾讯位置服务 WebServiceAPI 的签名与响应解析（纯函数，便于单测）。
 *
 * ⚠️ 签名规范与高德不同：腾讯要求**请求路径也参与签名**
 *    sig = MD5("/ws/location/v1/ip?" + 参数串按 key 升序 + SK)   （大写）
 * 只拼参数串（高德写法）会稳定返回 status=111「签名验证失败」，
 * 看起来像 Key 填错，实际是签名少了路径。已用真实 Key 对照验证：
 * 带路径 → status=0 Success；不带路径/不带签名 → status=111。
 */

/** 拼接参与签名的参数字符串：按 key 字典序升序，值做 URL 编码 */
function signQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
}

/** 计算腾讯 WebServiceAPI 的 sig（path 必须与真实请求路径一致，如 ws/location/v1/ip） */
export function tencentSign(path: string, params: Record<string, string>, sk: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return createHash("md5").update(`${clean}?${signQuery(params)}${sk}`).digest("hex").toUpperCase();
}

/** 组装腾讯请求参数（sk 非空时附带 sig） */
export function buildTencentParams(
  path: string,
  base: Record<string, string>,
  sk: string
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) sp.set(k, v);
  if (sk) sp.set("sig", tencentSign(path, base, sk));
  return sp;
}

/**
 * 腾讯实况天气返回结构：
 * { status: 0, result: { realtime: [{ province, city, district, adcode, infos: { weather, temperature, wind_direction, wind_power } }] } }
 * 注意是 realtime[].infos（不是早期文档里的 result.now），解析错会拿不到任何字段。
 */
export interface TencentRealtimeWeather {
  weather: string;
  temperature: string;
  winddirection: string;
  windpower: string;
}

/** 解析腾讯实况天气；结构不符（status≠0 或无 realtime）返回 null */
export function parseTencentRealtime(payload: unknown): TencentRealtimeWeather | null {
  const root = payload as { status?: number; result?: { realtime?: unknown } } | null;
  if (!root || root.status !== 0) return null;
  const list = root.result?.realtime;
  if (!Array.isArray(list) || list.length === 0) return null;
  const infos = (list[0] as { infos?: Record<string, unknown> } | undefined)?.infos;
  if (!infos) return null;

  const windDirRaw = String(infos.wind_direction ?? "未知");
  const windDir = windDirRaw.endsWith("风") ? windDirRaw : `${windDirRaw}风`;
  const windPowerRaw = String(infos.wind_power ?? "未知");
  const windPower = windPowerRaw.endsWith("级") ? windPowerRaw : `${windPowerRaw}级`;
  const temp = infos.temperature;
  return {
    weather: String(infos.weather ?? "未知"),
    temperature: `${temp ?? "--"}℃`,
    winddirection: windDir,
    windpower: windPower,
  };
}

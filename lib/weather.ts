/**
 * 天气相关的纯逻辑（与网络 IO 分离，便于单测）。
 *
 * 背景：高德的 IP 定位（/v3/ip）经常返回「省级 adcode + 市级名称」的组合，
 * 例如 112.17.0.1 → { province: "浙江省", city: "杭州市", adcode: "330000" }。
 * 若直接拿这个 adcode 去查天气，高德会把查询区域当作"浙江省"处理，
 * 返回的 city 字段就是"浙江省" —— 页面上便只显示出省份。
 */

/** 省级 adcode 形如 330000（后四位为 0）；市级为 330100 这类 */
export function isProvinceLevelAdcode(adcode: string): boolean {
  return /^\d{2}0000$/.test(adcode.trim());
}

/** 取首个非空字符串：高德的部分字段可能返回数组（如 province: ["浙江省"]）或空数组 */
export function firstString(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const s = firstString(item);
      if (s) return s;
    }
    return "";
  }
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 推导高德天气的查询参数（city）：
 * 1. 市级 adcode 最精确（如 440300 → 深圳市）；
 * 2. adcode 是省级但给了城市名时必须用城市名（否则只返回省份）；
 * 3. 再退回省份名，最后才用 adcode；全空则由调用方报「需要指定城市」。
 */
export function resolveAmapCityQuery(input: {
  adcode?: unknown;
  city?: unknown;
  province?: unknown;
}): string {
  const adcode = firstString(input.adcode);
  const city = firstString(input.city);
  const province = firstString(input.province);
  if (adcode && !isProvinceLevelAdcode(adcode)) return adcode;
  return city || province || adcode;
}

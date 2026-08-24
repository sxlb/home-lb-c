import { describe, it, expect } from "vitest";
import { profileSchema, weatherSettingSchema } from "@/lib/validation";

describe("天气数据源枚举（amap/tencent/tencent-key，wttr/uapis 仅存量兼容）", () => {
  it("profileSchema 接受 amap/tencent/tencent-key，且兼容历史 wttr/uapis 值", () => {
    for (const provider of ["wttr", "amap", "tencent", "tencent-key", "uapis"]) {
      const result = profileSchema.safeParse({ weatherProvider: provider });
      expect(result.success).toBe(true);
    }
  });

  it("profileSchema 缺省时默认 tencent", () => {
    const result = profileSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weatherProvider).toBe("tencent");
    }
  });

  it("profileSchema 拒绝非法数据源", () => {
    const result = profileSchema.safeParse({ weatherProvider: "foo" });
    expect(result.success).toBe(false);
  });

  it("weatherSettingSchema 兼容历史 wttr 值（存量数据）", () => {
    expect(weatherSettingSchema.safeParse({ weatherProvider: "wttr" }).success).toBe(true);
  });

  it("weatherSettingSchema 高德必须配置 Key", () => {
    expect(weatherSettingSchema.safeParse({ weatherProvider: "amap", amapKey: "" }).success).toBe(false);
    expect(
      weatherSettingSchema.safeParse({ weatherProvider: "amap", amapKey: "8a4f..." }).success
    ).toBe(true);
  });

  it("weatherSettingSchema 腾讯必须配置城市", () => {
    expect(
      weatherSettingSchema.safeParse({ weatherProvider: "tencent", weatherCity: "" }).success
    ).toBe(false);
    expect(
      weatherSettingSchema.safeParse({ weatherProvider: "tencent", weatherCity: "深圳" }).success
    ).toBe(true);
  });

  it("weatherSettingSchema 腾讯 Key 版必须配置腾讯位置服务 Key", () => {
    expect(
      weatherSettingSchema.safeParse({ weatherProvider: "tencent-key", txWeatherKey: "" }).success
    ).toBe(false);
    expect(
      weatherSettingSchema.safeParse({ weatherProvider: "tencent-key", txWeatherKey: "JXVBZ-XXX" }).success
    ).toBe(true);
  });

  it("profileSchema 腾讯 Key 版可配置 txWeatherKey", () => {
    const result = profileSchema.safeParse({ weatherProvider: "tencent-key", txWeatherKey: "JXVBZ-XXX" });
    expect(result.success).toBe(true);
  });

  it("weatherSettingSchema 拒绝非法数据源", () => {
    expect(weatherSettingSchema.safeParse({ weatherProvider: "foo" }).success).toBe(false);
  });
});

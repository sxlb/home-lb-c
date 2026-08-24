import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { weatherSettingSchema } from "@/lib/validation";
import { writeOperationLog, getClientIp, internalError, error, requireSession, parseJsonBody, formatZodError } from "@/lib/server";

export const dynamic = "force-dynamic";

// 保存天气配置（数据源 / 高德 Key / 腾讯 Key / 城市）
export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }

    const json = await parseJsonBody(request);
    if (json === null) {
      return error("请求体格式错误，需为合法 JSON");
    }

    const parsed = weatherSettingSchema.safeParse(json);
    if (!parsed.success) {
      return error(`参数校验失败：${formatZodError(parsed.error)}`);
    }

    const { weatherProvider, amapKey, amapSecretKey, txWeatherKey, txWeatherSk, weatherCity } = parsed.data;

    const existing = await prisma.profile.findFirst({ orderBy: { id: "asc" } });
    const profile = existing
      ? await prisma.profile.update({
          where: { id: existing.id },
          data: { weatherProvider, amapKey, amapSecretKey, txWeatherKey, txWeatherSk, weatherCity },
        })
      : await prisma.profile.create({
          data: { weatherProvider, amapKey, amapSecretKey, txWeatherKey, txWeatherSk, weatherCity },
        });

    await writeOperationLog({
      module: "weather-setting",
      action: "update",
      username: session.user?.name || "unknown",
      summary: `修改天气配置：数据源 ${weatherProvider}`,
      detail: JSON.stringify({
        weatherProvider: existing?.weatherProvider || "未配置",
        weatherCity: existing?.weatherCity || "",
        changed: {
          weatherProvider: { from: existing?.weatherProvider || "未配置", to: weatherProvider },
          amapKey: { from: existing?.amapKey ? "已配置" : "未配置", to: amapKey ? "已配置" : "未配置" },
          amapSecretKey: { from: existing?.amapSecretKey ? "已配置" : "未配置", to: amapSecretKey ? "已配置" : "未配置" },
          txWeatherKey: { from: existing?.txWeatherKey ? "已配置" : "未配置", to: txWeatherKey ? "已配置" : "未配置" },
          txWeatherSk: { from: existing?.txWeatherSk ? "已配置" : "未配置", to: txWeatherSk ? "已配置" : "未配置" },
          weatherCity: { from: existing?.weatherCity || "", to: weatherCity },
        },
      }),
      ip: getClientIp(request),
    });

    return NextResponse.json(profile);
  } catch (e) {
    return internalError("[PUT /api/weather-setting] 保存失败", e);
  }
}
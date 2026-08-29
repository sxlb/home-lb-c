import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validation";
import { writeOperationLog, getClientIp, diffProfile, getChangedProfileFields, internalError, error, requireSession, parseJsonBody, formatZodError } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const profile = await prisma.profile.findFirst({ orderBy: { id: "asc" } });
    if (!profile) {
      return error("未找到配置", 404);
    }
    return NextResponse.json(profile);
  } catch (e) {
    return internalError("[GET /api/profile] 查询失败", e);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const json = await parseJsonBody(request);
    if (json === null) {
      return error("请求体格式错误，需为合法 JSON");
    }

    const parsed = profileSchema.safeParse(json);
    if (!parsed.success) {
      return error(`参数校验失败：${formatZodError(parsed.error)}`);
    }

    const {
      avatar,
      siteIcon,
      nickname,
      bio,
      github,
      email,
      bgApi,
      weatherProvider,
      amapKey,
      amapSecretKey,
      weatherCity,
      txWeatherKey,
      txWeatherSk,
      coverType,
      autoBGSwitchInterval,
      wallpaperRefresh,
      theme,
      songApi,
      songServer,
      songId,
      siteUrl,
      siteIcp,
      siteMps,
      siteStart,
      siteLinksTitle,
      siteLinksIcon,
      friendLinksTitle,
      iconfontUrl,
      logoArtFont,
      loadingScreen,
      clickEffect,
      consoleEgg,
      showStats,
      dynamicTitle,
      topProgressBar,
      logoFont,
      customFontEnabled,
      customFontFamily,
      customFontScope,
      useRandomAvatar,
      welcomeEnabled,
      welcomeIndex,
      welcomeMessages,
      // 高级配置（后台可改，无需重新构建）
      siteTitle,
      siteDescription,
      siteKeywords,
      accentColor,
      glassOpacity,
      glassBlur,
      analyticsScript,
      headScript,
      timeFormat,
      showSeconds,
      dateFormat,
      hitokotoType,
      bgOverlay,
      avatarShape,
      avatarBorderColor,
    } = parsed.data;

    // 单例模型：使用 upsert 防止并发创建多条记录
    const existing = await prisma.profile.findFirst({ orderBy: { id: "asc" } });

    const before = (existing as Record<string, unknown>) || {};
    const after = parsed.data as unknown as Record<string, unknown>;

    // 没有任何字段变化时跳过写库，避免每次保存都刷新 updatedAt/写日志
    if (existing && getChangedProfileFields(before, after).length === 0) {
      return NextResponse.json(existing);
    }

    const data = {
      avatar,
      siteIcon,
      nickname,
      bio,
      github,
      email,
      bgApi,
      weatherProvider,
      amapKey,
      amapSecretKey,
      weatherCity,
      txWeatherKey,
      txWeatherSk,
      coverType,
      autoBGSwitchInterval,
      wallpaperRefresh,
      theme,
      songApi,
      songServer,
      songId,
      siteUrl,
      siteIcp,
      siteMps,
      siteStart,
      siteLinksTitle,
      siteLinksIcon,
      friendLinksTitle,
      iconfontUrl,
      logoArtFont,
      loadingScreen,
      clickEffect,
      consoleEgg,
      showStats,
      dynamicTitle,
      topProgressBar,
      logoFont,
      customFontEnabled,
      customFontFamily,
      customFontScope,
      useRandomAvatar,
      welcomeEnabled,
      welcomeIndex,
      welcomeMessages,
      // 高级配置
      siteTitle,
      siteDescription,
      siteKeywords,
      accentColor,
      glassOpacity,
      glassBlur,
      analyticsScript,
      headScript,
      timeFormat,
      showSeconds,
      dateFormat,
      hitokotoType,
      bgOverlay,
      avatarShape,
      avatarBorderColor,
    };
    const profile = existing
      ? await prisma.profile.update({ where: { id: existing.id }, data })
      : await prisma.profile.create({ data });

    // 记录操作日志（失败不影响主操作）
    const username = session.user?.name || "unknown";
    const { summary, detail } = diffProfile(before, after);
    await writeOperationLog({
      module: "profile",
      action: existing ? "update" : "create",
      username,
      summary,
      detail,
      ip: getClientIp(request),
    });

    return NextResponse.json(profile);
  } catch (e) {
    return internalError("[PUT /api/profile] 保存失败", e);
  }
}

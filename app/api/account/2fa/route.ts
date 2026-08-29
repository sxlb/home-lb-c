import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { generateSecret, verifyTOTP, buildOtpauthUrl } from "@/lib/totp";
import { requireSession, error, parseJsonBody, internalError, writeOperationLog, getClientIp } from "@/lib/server";

export const dynamic = "force-dynamic";

type Action = "setup" | "enable" | "disable";

/** 查询当前账号 2FA 状态（登录后） */
export async function GET() {
  try {
    const session = await requireSession();
    if (!session || !session.user?.name) return error("未授权", 401);
    const user = await prisma.user.findUnique({ where: { username: session.user.name } });
    return new Response(JSON.stringify({ enabled: !!user?.twoFactorEnabled }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return internalError("[GET /api/account/2fa] 查询失败", e);
  }
}

/** 两步验证管理：setup 生成密钥 / enable 确认开启 / disable 关闭 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session || !session.user?.name) {
      return error("未授权", 401);
    }
    const username = session.user.name;

    const json = await parseJsonBody<{ action?: Action; code?: string }>(request);
    if (json === null || !json.action) {
      return error("缺少 action 参数");
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return error("账号不存在", 404);

    if (json.action === "setup") {
      // 已开启时不重复生成（避免覆盖现有密钥）
      if (user.twoFactorEnabled) return error("两步验证已开启");
      const secret = generateSecret();
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorSecret: secret },
      });
      return new Response(
        JSON.stringify({ ok: true, secret, otpauthUrl: buildOtpauthUrl(secret, username) }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // enable / disable 均需验证当前验证码
    const code = json.code?.trim() || "";
    if (!/^\d{6}$/.test(code)) return error("请输入 6 位验证码");
    if (!verifyTOTP(user.twoFactorSecret, code)) return error("验证码不正确");

    if (json.action === "enable") {
      if (user.twoFactorEnabled) return error("两步验证已开启");
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
      await writeOperationLog({
        module: "account",
        action: "update",
        username,
        summary: "开启两步验证（TOTP）",
        ip: getClientIp(request),
      });
      return new Response(JSON.stringify({ ok: true, enabled: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // disable
    if (!user.twoFactorEnabled) return error("两步验证未开启");
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: "" },
    });
    await writeOperationLog({
      module: "account",
      action: "update",
      username,
      summary: "关闭两步验证",
      ip: getClientIp(request),
    });
    return new Response(JSON.stringify({ ok: true, enabled: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return internalError("[POST /api/account/2fa] 操作失败", e);
  }
}

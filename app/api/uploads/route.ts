import { NextRequest } from "next/server";
import { saveUpload } from "@/lib/uploads";
import { requireSession, error, internalError } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 上传图片文件（头像/图标/壁纸）：需登录，返回 /api/uploads/file/xxx URL */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return error("未授权", 401);
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return error("缺少 file 字段或类型不正确");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let url: string;
    try {
      url = await saveUpload(buffer);
    } catch (e) {
      return error(e instanceof Error ? e.message : "文件校验失败", 400);
    }

    return new Response(JSON.stringify({ ok: true, url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return internalError("[POST /api/uploads] 上传失败", e);
  }
}

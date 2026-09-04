import { NextRequest } from "next/server";
import path from "node:path";
import { saveUpload } from "@/lib/uploads";
import { prisma } from "@/lib/db";
import { getImageSize, mimeFromExt } from "@/lib/media";
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

    // 尽力而为地把上传登记进媒体库（媒体管理入口能看到各面板已上传的图片）。
    // 登记失败不影响本次上传（主流程仍返回 url）。
    try {
      const fileName = decodeURIComponent(url.split("/").pop() || "");
      const ext = path.extname(fileName);
      const { width, height } = getImageSize(buffer);
      await prisma.imageAsset.create({
        data: {
          url,
          fileName,
          mimeType: mimeFromExt(ext),
          size: buffer.byteLength,
          width,
          height,
          usage: "",
        },
      });
    } catch (mediaErr) {
      console.error("[uploads] 登记媒体库失败（可忽略）", mediaErr);
    }

    return new Response(JSON.stringify({ ok: true, url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return internalError("[POST /api/uploads] 上传失败", e);
  }
}

import { NextRequest } from "next/server";
import { readCachedWallpaper } from "@/lib/wallpaperCache";

export const dynamic = "force-dynamic";

/**
 * GET /api/wallpaper/file/[name]
 * 返回本地缓存的壁纸文件。文件名严格校验（防路径穿越），
 * 文件名唯一（时间戳+随机串），可长缓存。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const file = await readCachedWallpaper(name);
  if (!file) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

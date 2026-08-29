import { NextRequest } from "next/server";
import { readUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/** GET /api/uploads/file/[name]：返回上传的文件（白名单校验，长缓存） */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const file = await readUpload(name);
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

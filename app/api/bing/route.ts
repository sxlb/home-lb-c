import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// 代理必应每日壁纸，避免跨域与国内访问问题
export const revalidate = 3600; // 1 小时

interface BingResponse {
  images?: Array<{
    url: string;
    copyright?: string;
    title?: string;
  }>;
}

export async function GET() {
  try {
    const res = await fetch(
      "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN",
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) {
      return NextResponse.json({ error: "壁纸服务不可用" }, { status: 502 });
    }
    const data = (await res.json()) as BingResponse;
    const image = data.images?.[0];
    if (!image?.url) {
      return NextResponse.json({ error: "未获取到壁纸" }, { status: 502 });
    }
    return NextResponse.json({
      url: `https://www.bing.com${image.url}`,
      copyright: image.copyright || "",
      title: image.title || "",
    });
  } catch (e) {
    console.error("[GET /api/bing] error:", e);
    return NextResponse.json({ error: "壁纸服务异常" }, { status: 500 });
  }
}

import Link from "next/link";
import { prisma } from "@/lib/db";
import { CalendarDays, Eye, Pin, ChevronLeft } from "lucide-react";

export const revalidate = 60;

/** ISO 时间格式化为 "YYYY年M月D日" */
function formatDate(d: Date): string {
  const dt = new Date(d);
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

export default async function ArticlesPage() {
  const list = await prisma.article.findMany({
    where: { published: true },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }, { id: "desc" }],
    select: {
      id: true, title: true, slug: true, excerpt: true, cover: true, tags: true,
      pinned: true, viewCount: true, publishedAt: true,
    },
  }).catch(() => []);

  return (
    <main className="relative flex min-h-dvh w-full flex-col items-center px-5 py-12 text-white md:px-6">
      {/* 顶部返回首页 */}
      <div className="mx-auto flex w-full max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-white/60 transition-colors hover:text-white">
          <ChevronLeft className="h-4 w-4" /> 返回首页
        </Link>
      </div>

      <header className="mx-auto mt-6 w-full max-w-3xl">
        <h1 className="text-2xl font-bold tracking-wide md:text-3xl">随笔</h1>
        <p className="mt-1 text-sm text-white/50">记录一些想法与碎片</p>
      </header>

      <div className="mx-auto mt-8 flex w-full max-w-3xl flex-col gap-4">
        {list.length === 0 && (
          <div className="card-glass rounded-2xl p-10 text-center text-sm text-white/50">
            还没有发布文章，敬请期待。
          </div>
        )}
        {list.map((a) => {
          const tags = a.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
          return (
            <Link
              key={a.id}
              href={`/articles/${a.slug}`}
              className="card-glass group flex flex-col gap-3 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30 md:flex-row md:gap-5 md:p-6"
            >
              {a.cover && (
                <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-xl bg-white/5 md:h-28 md:w-40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.cover} alt={a.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <h2 className="flex items-start gap-2 text-base font-semibold leading-snug text-white md:text-lg">
                  {a.pinned && <Pin className="mt-1 h-4 w-4 shrink-0 rotate-45 text-amber-300" aria-label="置顶" />}
                  <span className="truncate group-hover:underline">{a.title}</span>
                </h2>
                {a.excerpt && (
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-white/60">{a.excerpt}</p>
                )}
                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tags.slice(0, 5).map((t, i) => (
                      <span key={`${t}-${i}`} className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] text-white/60">{t}</span>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex items-center gap-4 pt-3 text-xs text-white/40">
                  <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDate(a.publishedAt)}</span>
                  <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{a.viewCount}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
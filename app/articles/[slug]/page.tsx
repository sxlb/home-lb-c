import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { ChevronLeft, CalendarDays, Eye, Tag, Pin } from "lucide-react";
import { ArticleViewCounter } from "@/components/ArticleViewCounter";
import { Markdown } from "@/components/Markdown";

export const revalidate = 60;

/** ISO 时间格式化为 "YYYY年M月D日" */
function formatDate(d: Date): string {
  const dt = new Date(d);
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

type Params = Promise<{ slug: string }>;

/** 读取单篇文章（服务端，仅已发布）；重复请求内复用（React cache） */
async function getArticle(slug: string) {
  return prisma.article.findFirst({ where: { slug, published: true } });
}

/** 动态 SEO / 社交卡片元信息 */
export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.excerpt || article.title,
    openGraph: {
      title: article.title,
      description: article.excerpt || article.title,
      type: "article",
      ...(article.cover ? { images: [article.cover] } : {}),
    },
  };
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  const tags = article.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean);

  return (
    <main className="relative flex min-h-dvh w-full flex-col items-center px-5 py-12 text-white md:px-6">
      {/* 顶部返回 */}
      <div className="mx-auto flex w-full max-w-3xl">
        <Link href="/articles" className="inline-flex items-center gap-1.5 text-sm text-white/60 transition-colors hover:text-white">
          <ChevronLeft className="h-4 w-4" /> 全部随笔
        </Link>
      </div>

      <article className="card-glass mx-auto mt-6 w-full max-w-3xl rounded-2xl p-6 md:p-10">
        {/* 标题与元信息 */}
        <header>
          {tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {tags.map((t, i) => (
                <span key={`${t}-${i}`} className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-white/60">
                  <Tag className="h-3 w-3" />{t}
                </span>
              ))}
            </div>
          )}
          <h1 className="flex items-start gap-2 text-2xl font-bold leading-snug tracking-wide md:text-3xl">
            {article.pinned && <Pin className="mt-1.5 h-5 w-5 shrink-0 rotate-45 text-amber-300" />}
            {article.title}
          </h1>
          <div className="mt-4 flex items-center gap-4 border-b border-white/10 pb-5 text-xs text-white/40">
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDate(article.publishedAt)}</span>
            <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{article.viewCount} 阅读</span>
            <span className="ml-auto text-white/30">更新于 {formatDate(article.updatedAt)}</span>
          </div>
        </header>

        {/* 封面 */}
        {article.cover && (
          <div className="mt-6 overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={article.cover} alt={article.title} className="h-auto w-full object-cover" />
          </div>
        )}

        {/* 正文（Markdown） */}
        <div className="article-body mt-8">
          <Markdown content={article.content} />
        </div>

        {/* 阅读量计数（客户端，悬浮于正文之后） */}
        <ArticleViewCounter slug={article.slug} />
      </article>
    </main>
  );
}
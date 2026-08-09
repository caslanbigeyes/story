import Link from "next/link";
import type { GetStaticPaths, GetStaticProps } from "next";
import {
  getAllNewsItems,
  getNewsItemById,
  type NewsItem,
} from "@/lib/newsItems";
import { markdownToHtml } from "@/lib/markdown";
import { SITE_TIME_ZONE } from "@/lib/site";
import SEO from "@/components/SEO";

interface Props {
  item: NewsItem;
  reflectionHtml: string;
}

function formatFullDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: SITE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function NewsDetailPage({ item, reflectionHtml }: Props) {
  return (
    <>
      <SEO
        title={item.title}
        description={item.info || item.hover || item.title}
        path={`/news/${item.id}`}
        type="article"
        publishedTime={item.createdAt}
      />

      <article className="space-y-8 animate-fade-up">
        <Link
          href="/news"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors group"
        >
          <svg
            className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回资讯
        </Link>

        <header className="space-y-4">
          <h1 className="font-serif text-2xl md:text-3xl font-semibold leading-snug text-gray-900 dark:text-gray-100">
            {item.title}
          </h1>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-gray-400" />
              {item.sourceLabel}
            </span>
            <span className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
            <time dateTime={item.createdAt}>
              {formatFullDateTime(item.createdAt)}
            </time>
            {item.info ? (
              <>
                <span className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
                <span>{item.info}</span>
              </>
            ) : null}
          </div>

          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
          >
            原文链接
            <svg
              className="w-3.5 h-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </a>
        </header>

        <section className="space-y-3 pt-2 border-t border-gray-200/70 dark:border-gray-800/70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-8 h-px bg-gray-400" />
              <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">
                Reflection · 读后感
              </h2>
            </div>
            {/* <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/70"
              title="读后感由 AI 模拟一个普通人写出，含虚构生活场景"
            >
              AI 模拟
            </span> */}
          </div>

          <div
            className="prose prose-gray dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: reflectionHtml }}
          />
        </section>
      </article>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const items = getAllNewsItems();
  return {
    paths: items.map((it) => ({ params: { id: it.id } })),
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const id = params?.id;
  if (typeof id !== "string") {
    return { notFound: true };
  }
  const item = getNewsItemById(id);
  if (!item) {
    return { notFound: true };
  }
  const { html } = await markdownToHtml(item.reflection || "");
  return {
    props: { item, reflectionHtml: html },
  };
};

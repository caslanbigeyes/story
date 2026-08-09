import Link from "next/link";
import type { GetStaticProps } from "next";
import { getAllNewsItems, type NewsItem } from "@/lib/newsItems";
import { SITE_TIME_ZONE } from "@/lib/site";
import SEO from "@/components/SEO";

interface Props {
  items: NewsItem[];
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: SITE_TIME_ZONE,
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

export default function NewsListPage({ items }: Props) {
  return (
    <>
      <SEO title="资讯" description="每半小时聚合一次的资讯流，附 AI 模拟读后感。" path="/news" />

      <div className="space-y-8 animate-fade-up">
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-px bg-gray-400" />
            <h1 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">
              News · 资讯
            </h1>
          </div>
       
        </header>

        {items.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-500 dark:text-gray-400">
            还没有资讯，等爬虫跑一轮就有了。
          </div>
        ) : (
          <ul className="divide-y divide-gray-200/70 dark:divide-gray-800/70">
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  href={`/news/${it.id}`}
                  className="group flex items-start justify-between gap-4 py-3.5"
                >
                  <span className="font-serif text-base md:text-lg text-gray-900 dark:text-gray-100 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                    {it.title}
                  </span>
                  <time
                    dateTime={it.createdAt}
                    className="shrink-0 text-xs font-mono text-gray-400 dark:text-gray-500 pt-1 tabular-nums"
                  >
                    {formatDateTime(it.createdAt)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  return {
    props: {
      items: getAllNewsItems(),
    },
    revalidate: 60,
  };
};

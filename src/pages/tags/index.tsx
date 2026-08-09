import Link from "next/link";
import type { GetStaticProps } from "next";
import { getAllTags, type TagInfo } from "@/lib/posts";
import SEO from "@/components/SEO";

interface Props {
  tags: TagInfo[];
}

export default function TagsIndex({ tags }: Props) {
  return (
    <>
      <SEO title="所有标签" path="/tags" description="按主题浏览全部文章" />

      <div className="space-y-10 animate-fade-up">
        <header>
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em] mb-4">
            <span className="w-6 h-px bg-gray-400 dark:bg-gray-600" />
            Tags
          </div>
          <h1 className="font-serif text-3xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            所有标签
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-3 text-sm">
            共 {tags.length} 个标签
          </p>
        </header>

        {tags.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">还没有标签。</p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {tags.map(({ tag, count }) => (
              <Link
                key={tag}
                href={`/tags/${encodeURIComponent(tag)}`}
                className="group inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-gray-900/60 border border-gray-200/70 dark:border-gray-800/70 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md dark:hover:shadow-black/40 transition-all"
              >
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  #{tag}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  return {
    props: { tags: getAllTags() },
    revalidate: 60,
  };
};

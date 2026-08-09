import Link from "next/link";
import type { GetStaticPaths, GetStaticProps } from "next";
import { getAllTags, getPostsByTag, type PostMeta } from "@/lib/posts";
import { formatZhDate } from "@/lib/site";
import SEO from "@/components/SEO";

interface Props {
  tag: string;
  posts: PostMeta[];
}

export default function TagPage({ tag, posts }: Props) {
  return (
    <>
      <SEO
        title={`#${tag}`}
        path={`/tags/${encodeURIComponent(tag)}`}
        description={`关于 ${tag} 的全部文章（共 ${posts.length} 篇）`}
      />

      <div className="space-y-10 animate-fade-up">
        <header>
          <Link
            href="/tags"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors mb-4"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            所有标签
          </Link>
          <h1 className="font-serif text-3xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            #{tag}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-3 text-sm">
            共 {posts.length} 篇文章
          </p>
        </header>

        <ul className="space-y-3">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/posts/${post.slug}`}
                className="group block p-5 rounded-2xl bg-white dark:bg-gray-900/60 border border-gray-200/70 dark:border-gray-800/70 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md dark:hover:shadow-black/40 transition-all"
              >
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                  <time dateTime={post.date}>{formatZhDate(post.date)}</time>
                  <span className="w-1 h-1 rounded-full bg-gray-300" />
                  <span>{post.readingTime} min</span>
                </div>
                <h2 className="font-serif text-lg md:text-xl font-semibold text-gray-900 dark:text-gray-100 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {post.title}
                </h2>
                {post.excerpt ? (
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-2 line-clamp-2">
                    {post.excerpt}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: getAllTags().map(({ tag }) => ({ params: { tag } })),
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const tag = params?.tag;
  if (typeof tag !== "string") return { notFound: true };

  const posts = getPostsByTag(tag);
  if (posts.length === 0) return { notFound: true };

  return {
    props: { tag, posts },
  };
};

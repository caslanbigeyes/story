import Link from "next/link";
import type { GetStaticPaths, GetStaticProps } from "next";
import {
  getAllPosts,
  getPostBySlug,
  getRelatedPosts,
  type Post,
  type PostMeta,
} from "@/lib/posts";
import { markdownToHtml, type TocItem } from "@/lib/markdown";
import { formatZhDate } from "@/lib/site";
import Comments from "@/components/Comments";
import Toc from "@/components/Toc";
import CodeCopyEnhancer from "@/components/CodeCopyEnhancer";
import SEO from "@/components/SEO";

interface Props {
  post: Post;
  toc: TocItem[];
  prev: PostMeta | null;
  next: PostMeta | null;
  related: PostMeta[];
}

export default function PostPage({ post, toc, prev, next, related }: Props) {
  const isNewsDigest =
    post.tags.includes("news") && post.tags.includes("ai-summary");

  return (
    <>
      <SEO
        title={post.title}
        description={post.excerpt}
        path={`/posts/${post.slug}`}
        type="article"
        publishedTime={post.date}
        tags={post.tags}
      />

      <Toc items={toc} />
      <CodeCopyEnhancer />

      <article className="space-y-8 animate-fade-up">
        <Link
          href="/"
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
          返回列表
        </Link>

    
        <div
          className={`prose prose-gray dark:prose-invert max-w-none ${
            isNewsDigest ? "news-digest" : ""
          }`}
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* 上下篇导航 */}
        {(prev || next) && (
          <nav className="grid sm:grid-cols-2 gap-3 pt-8 border-t border-gray-200/70 dark:border-gray-800/70">
            {prev ? (
              <Link
                href={`/posts/${prev.slug}`}
                className="group block p-4 rounded-xl border border-gray-200/70 dark:border-gray-800/70 bg-white dark:bg-gray-900/60 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md dark:hover:shadow-black/40 transition-all"
              >
                <div className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5 flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                  上一篇
                </div>
                <div className="font-serif text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {prev.title}
                </div>
              </Link>
            ) : <span />}
            {next ? (
              <Link
                href={`/posts/${next.slug}`}
                className="group block p-4 rounded-xl border border-gray-200/70 dark:border-gray-800/70 bg-white dark:bg-gray-900/60 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md dark:hover:shadow-black/40 transition-all sm:text-right"
              >
                <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1 sm:justify-end">
                  下一篇
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </div>
                <div className="font-serif text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {next.title}
                </div>
              </Link>
            ) : <span />}
          </nav>
        )}

        {/* 相关推荐 */}
        {related.length > 0 && (
          <section className="pt-8 border-t border-gray-200/70 dark:border-gray-800/70 space-y-5">
            <div className="flex items-center gap-3">
              <span className="w-8 h-px bg-gray-400 dark:bg-gray-600" />
              <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">
                Related · 相关阅读
              </h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              {related.map((p) => (
                <Link
                  key={p.slug}
                  href={`/posts/${p.slug}`}
                  className="group block p-4 rounded-xl bg-white dark:bg-gray-900/60 border border-gray-200/70 dark:border-gray-800/70 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md dark:hover:shadow-black/40 transition-all"
                >
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
                    {formatZhDate(p.date, "short")}
                  </div>
                  <div className="font-serif text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {p.title}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <Comments />
      </article>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = getAllPosts();
  return {
    paths: posts.map((p) => ({ params: { slug: p.slug } })),
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const slug = params?.slug;
  if (typeof slug !== "string") {
    return { notFound: true };
  }

  try {
    const all = getAllPosts();
    const idx = all.findIndex((p) => p.slug === slug);
    // 列表按日期倒序：idx-1 是更新的（下一篇），idx+1 是更旧的（上一篇）
    const next = idx > 0 ? all[idx - 1] : null;
    const prev = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

    const post = getPostBySlug(slug);
    const isNewsDigest =
      post.tags.includes("news") && post.tags.includes("ai-summary");
    const { html, toc } = await markdownToHtml(post.content, {
      kind: isNewsDigest ? "news-digest" : "default",
    });

    const related = getRelatedPosts(slug, 3);

    return {
      props: {
        post: { ...post, content: html },
        toc,
        prev,
        next,
        related,
      },
      revalidate: 60,
    };
  } catch {
    return { notFound: true };
  }
};

import Link from "next/link";
import type { GetStaticProps } from "next";
import { getAllPosts, type PostMeta } from "@/lib/posts";
import { formatZhDate } from "@/lib/site";
import SEO from "@/components/SEO";

interface Props {
  posts: PostMeta[];
}

function TagPill({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center gap-1 bg-white/60 dark:bg-cyan-400/5 backdrop-blur text-gray-600 dark:text-cyan-200/80 px-2.5 py-0.5 rounded-full text-xs border border-gray-200/60 dark:border-cyan-400/20">
      <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-fuchsia-400 dark:shadow-[0_0_6px_rgba(255,45,209,0.9)]" />
      {tag}
    </span>
  );
}

function FeaturedCard({ post }: { post: PostMeta }) {
  return (
    <Link
      href={`/posts/${post.slug}`}
      className="group relative block rounded-3xl overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-[#070a14] dark:via-[#0a0d18] dark:to-[#0c0816] p-10 md:p-14 shadow-xl hover:shadow-2xl transition-all duration-500 animate-fade-up dark:border dark:border-cyan-400/20 dark:shadow-[0_0_30px_rgba(0,240,255,0.10),0_0_60px_rgba(255,45,209,0.06)]"
    >
      {/* 装饰性光晕 */}
      <div className="absolute -top-20 -right-20 w-72 h-72 bg-blue-500/20 dark:bg-cyan-400/25 rounded-full blur-3xl group-hover:bg-blue-500/30 dark:group-hover:bg-cyan-400/35 transition-colors duration-700" />
      <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-purple-500/20 dark:bg-fuchsia-500/25 rounded-full blur-3xl group-hover:bg-purple-500/30 dark:group-hover:bg-fuchsia-500/35 transition-colors duration-700" />

      <div className="relative">
        <div className="flex items-center gap-2 text-xs font-medium text-blue-300 dark:text-cyan-300 mb-4 uppercase tracking-widest cyber-num">
          <span className="inline-block w-8 h-px bg-blue-300 dark:bg-cyan-300 dark:shadow-[0_0_6px_rgba(0,240,255,0.9)]" />
          Featured · 精选
        </div>

        <h2 className="font-serif text-3xl md:text-5xl font-bold text-white leading-tight tracking-tight mb-4 group-hover:translate-x-1 transition-transform duration-500">
          {post.title}
        </h2>

        {/* {post.excerpt ? (
          <p className="text-gray-300/90 text-base md:text-lg leading-relaxed mb-6 max-w-2xl line-clamp-3">
            {post.excerpt}
          </p>
        ) : null} */}

        <div className="flex items-center flex-wrap gap-3 text-xs text-gray-400">
          <time dateTime={post.date}>{formatZhDate(post.date)}</time>
          <span className="w-1 h-1 rounded-full bg-gray-500" />
          <span>{post.readingTime} min read</span>
          {post.tags && post.tags.length > 0 ? (
            <>
              <span className="w-1 h-1 rounded-full bg-gray-500" />
              <span className="flex items-center gap-1.5">
                {post.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full bg-white/10 text-gray-300"
                  >
                    #{tag}
                  </span>
                ))}
              </span>
            </>
          ) : null}
        </div>

        <div className="mt-8 inline-flex items-center gap-2 text-sm text-white/90 group-hover:gap-3 transition-all duration-300">
          <span>开始阅读</span>
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

function PostCard({ post, index }: { post: PostMeta; index: number }) {
  return (
    <Link
      href={`/posts/${post.slug}`}
      className="group relative block bg-white dark:bg-[#0a0d14]/80 rounded-2xl p-6 md:p-7 border border-gray-200/70 dark:border-cyan-400/15 hover:border-gray-300 dark:hover:border-cyan-400/45 hover:shadow-lg dark:hover:shadow-[0_0_24px_rgba(0,240,255,0.18)] hover:-translate-y-1 transition-all duration-300 animate-fade-up"
      style={{ animationDelay: `${Math.min(index * 60, 480)}ms` }}
    >
      {/* 顶部霓虹细线 */}
      <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-cyan-400/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 dark:group-hover:shadow-[0_0_8px_rgba(0,240,255,0.6)]" />

      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-gray-400 dark:text-cyan-300/70 mb-3 cyber-num">
        <time dateTime={post.date}>{formatZhDate(post.date)}</time>
        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-fuchsia-400/80" />
        <span>{post.readingTime} min</span>
      </div>

      <h3 className="font-serif text-xl md:text-2xl font-semibold text-gray-900 dark:text-gray-50 leading-snug tracking-tight mb-3 group-hover:text-blue-600 dark:group-hover:text-cyan-200 dark:group-hover:[text-shadow:0_0_14px_rgba(0,240,255,0.45)] transition-colors duration-300">
        {post.title}
      </h3>

      {/* {post.excerpt ? (
        <p className="text-gray-600 dark:text-gray-400 text-sm md:text-[15px] leading-relaxed line-clamp-2 mb-4">
          {post.excerpt}
        </p>
      ) : null} */}

      <div className="flex items-end justify-between gap-3">
        {post.tags && post.tags.length > 0 ? (
          <div className="flex items-center flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
          </div>
        ) : <span />}

        <span
          aria-hidden
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-50 dark:bg-cyan-400/10 text-gray-400 dark:text-cyan-200/80 border border-transparent dark:border-cyan-400/20 group-hover:bg-blue-600 group-hover:text-white dark:group-hover:bg-cyan-400/20 dark:group-hover:text-cyan-100 dark:group-hover:shadow-[0_0_12px_rgba(0,240,255,0.55)] group-hover:translate-x-0.5 transition-all duration-300 shrink-0"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </Link>
  );
}

export default function Home({ posts }: Props) {
  const [featured, ...rest] = posts;

  return (
    <>
      <SEO />

      <div className="space-y-16">


        {posts.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-6xl mb-4">✍️</div>
            <p className="text-gray-500 dark:text-gray-400">还没有文章。</p>
            <Link
              href="/admin"
              className="inline-block mt-4 px-5 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-full text-sm hover:bg-gray-700 dark:hover:bg-white transition"
            >
              写第一篇
            </Link>
          </div>
        ) : (
          <>
            {/* Featured 区 */}
            {featured ? (
              <section>
                <FeaturedCard post={featured} />
              </section>
            ) : null}

            {/* Latest 列表 */}
            {rest.length > 0 ? (
              <section className="space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-px bg-gray-400 dark:bg-cyan-400/70 dark:shadow-[0_0_6px_rgba(0,240,255,0.7)]" />
                    <h2 className="text-xs font-medium text-gray-500 dark:text-cyan-300/80 uppercase tracking-[0.2em] cyber-num">
                      Latest · 最新
                    </h2>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-fuchsia-300/70 cyber-num">{rest.length} 篇</span>
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                  {rest.map((post, idx) => (
                    <PostCard key={post.slug} post={post} index={idx} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  return {
    props: {
      posts: getAllPosts(),
    },
    revalidate: 60,
  };
};

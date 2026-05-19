import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import ReadingProgress from "./ReadingProgress";
import ThemeToggle from "./ThemeToggle";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const isActive = (href: string) =>
    href === "/" ? router.pathname === "/" : router.pathname.startsWith(href);

  return (
    <div className="min-h-screen flex flex-col bg-[#fafaf9] dark:bg-[#0b0d10] text-gray-900 dark:text-gray-100 texture-noise transition-colors">
      <ReadingProgress />
      {/* 全局柔光背景 */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-blue-200/30 via-indigo-100/20 to-purple-200/30 dark:from-blue-900/30 dark:via-indigo-900/20 dark:to-purple-900/30 rounded-full blur-3xl animate-blob" />
      </div>
      <header className="sticky top-0 z-20 bg-white/70 dark:bg-gray-950/60 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-800/60">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="group flex items-center gap-2 text-lg font-semibold tracking-tight"
          >
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-gray-900 to-gray-700 dark:from-gray-100 dark:to-gray-300 text-white dark:text-gray-900 text-sm font-serif shadow-sm group-hover:rotate-6 transition-transform duration-300">
              M
            </span>
            <span className="font-serif">My Blog</span>
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            {[
              { href: "/", label: "首页" },
              { href: "/news", label: "读后感" },
              { href: "/tags", label: "标签" },
              { href: "/admin", label: "写作" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-full transition-colors ${
                  isActive(item.href)
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <span className="mx-1 w-px h-4 bg-gray-200 dark:bg-gray-700" />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-6 md:py-16">
        {children}
      </main>

      <footer className="border-t border-gray-200/60 dark:border-gray-800/60 bg-white/50 dark:bg-gray-950/30">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-gray-400" />
            <span>Crafted with Next.js & Markdown</span>
            <span className="w-1 h-1 rounded-full bg-gray-400" />
          </div>
          <div className="flex items-center gap-3">
            <span>© {new Date().getFullYear()} My Blog</span>
            <span className="w-px h-3 bg-gray-300" />
            <a
              href="/rss.xml"
              className="inline-flex items-center gap-1 hover:text-orange-600 transition-colors"
              aria-label="RSS"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6.18 17.82a2.18 2.18 0 1 1-4.36 0 2.18 2.18 0 0 1 4.36 0zM4 4.44v3.05a12.51 12.51 0 0 1 12.51 12.51h3.05A15.56 15.56 0 0 0 4 4.44zM4 10.1v3.05a6.85 6.85 0 0 1 6.85 6.85h3.05A9.9 9.9 0 0 0 4 10.1z" />
              </svg>
              RSS
            </a>
            <a
              href="/sitemap.xml"
              className="hover:text-gray-900 transition-colors"
            >
              Sitemap
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

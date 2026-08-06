import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState, type ReactNode } from "react";
import ReadingProgress from "./ReadingProgress";
import ThemeToggle from "./ThemeToggle";

interface LayoutProps {
  children: ReactNode;
}

// 路由保留：所有条目都对应实际页面，仅在 UI 上从默认水平 nav 收起到抽屉
const NAV_ITEMS = [
  { href: "/", label: "首页", en: "Home" },
  { href: "/news", label: "读后感", en: "Dispatches" },
  { href: "/lab", label: "实验室", en: "Lab" },
  { href: "/tags", label: "标签", en: "Index" },
  // { href: "/admin", label: "写作", en: "Compose" },
];

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? router.pathname === "/" : router.pathname.startsWith(href);

  // 路由变更自动关闭菜单（移动端尤其需要）
  useEffect(() => {
    const close = () => setMenuOpen(false);
    router.events.on("routeChangeStart", close);
    return () => router.events.off("routeChangeStart", close);
  }, [router.events]);

  // ESC 关闭 + 打开时锁定滚动
  useEffect(() => {
    if (!menuOpen) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen flex flex-col bg-[#fafaf9] dark:bg-[#05060a] text-gray-900 dark:text-gray-100 texture-noise transition-colors">
      <ReadingProgress />

      {/* 顶栏 */}
      <header className="sticky top-0 z-30 noir-glass border-b border-gray-200/60 dark:border-cyan-400/15">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          {/* 品牌：Nocturne · 夜色手稿 */}
          <Link href="/" className="group flex items-center gap-3 min-w-0">
            <span className="relative inline-flex items-center justify-center w-8 h-8 shrink-0">
              {/* 双色霓虹方块 */}
              <span className="absolute inset-0 rounded-md bg-gradient-to-br from-cyan-400/90 to-fuchsia-500/90 dark:from-cyan-400 dark:to-fuchsia-500 dark:shadow-[0_0_14px_rgba(0,240,255,0.55),0_0_22px_rgba(255,45,209,0.35)]" />
              <span className="absolute inset-[2px] rounded-[5px] bg-white dark:bg-[#05060a] flex items-center justify-center">
                <span className="font-serif text-[15px] font-semibold tracking-tight text-gray-900 dark:text-cyan-200 dark:[text-shadow:0_0_8px_rgba(0,240,255,0.7)]">
                  N
                </span>
              </span>
            </span>
            <span className="flex flex-col leading-tight min-w-0">
              <span className="font-serif text-[15px] sm:text-base font-semibold tracking-[0.18em] uppercase text-gray-900 dark:text-cyan-100 dark:[text-shadow:0_0_10px_rgba(0,240,255,0.45)] truncate">
                Nocturne
              </span>
              <span className="cyber-num text-[10px] text-gray-500 dark:text-fuchsia-300/80 tracking-[0.25em] uppercase">
                llf
              </span>
            </span>
          </Link>

          {/* 右侧控件：主题切换 + 菜单触发 */}
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <button
              type="button"
              aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
              aria-expanded={menuOpen}
              aria-controls="nocturne-menu"
              onClick={() => setMenuOpen((v) => !v)}
              className="relative inline-flex items-center justify-center w-10 h-10 rounded-md text-gray-700 dark:text-cyan-200 hover:text-gray-900 dark:hover:text-cyan-100 hover:bg-gray-100/70 dark:hover:bg-cyan-400/10 transition-colors"
            >
              <span className="flex flex-col items-end justify-center gap-[5px] w-5">
                <span
                  className={`hamburger-line ${
                    menuOpen ? "w-5 translate-y-[6.5px] rotate-45" : "w-5"
                  }`}
                />
                <span
                  className={`hamburger-line ${
                    menuOpen ? "w-5 opacity-0" : "w-3.5"
                  }`}
                />
                <span
                  className={`hamburger-line ${
                    menuOpen ? "w-5 -translate-y-[6.5px] -rotate-45" : "w-4"
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* 抽屉菜单：覆盖层（移动 & 桌面统一） */}
      <div
        id="nocturne-menu"
        aria-hidden={!menuOpen}
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* 背板 */}
        <button
          type="button"
          aria-label="关闭菜单"
          onClick={() => setMenuOpen(false)}
          className="absolute inset-0 w-full h-full noir-glass cursor-default"
        />

        {/* 内容 */}
        {menuOpen ? (
          <div className="relative h-full max-w-3xl mx-auto px-6 sm:px-8 pt-24 pb-12 flex flex-col justify-between animate-drawer-in scan-sweep overflow-hidden">
            {/* 顶部小信息条 */}
            <div className="flex items-center justify-between text-[10px] cyber-num uppercase tracking-[0.3em] text-gray-500 dark:text-cyan-300/70">
              <span className="inline-flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 dark:shadow-[0_0_8px_rgba(255,45,209,0.9)] neon-flicker" />
                Menu / 导航
              </span>
              <span>v.{new Date().getFullYear()}</span>
            </div>

            {/* 导航主体：大字 + 编号 */}
            <nav className="my-auto py-12">
              <ul className="flex flex-col gap-2 sm:gap-3">
                {NAV_ITEMS.map((item, i) => {
                  const active = isActive(item.href);
                  return (
                    <li
                      key={item.href}
                      className="animate-menu-item"
                      style={{ animationDelay: `${120 + i * 70}ms` }}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={`group flex items-center gap-4 sm:gap-6 py-3 sm:py-4 border-b border-dashed transition-colors ${
                          active
                            ? "border-cyan-400/60 dark:border-cyan-300/60"
                            : "border-gray-300/40 dark:border-cyan-400/10 hover:border-cyan-400/40 dark:hover:border-cyan-300/40"
                        }`}
                      >
                        <span
                          className={`cyber-num text-xs sm:text-sm w-10 shrink-0 ${
                            active
                              ? "text-fuchsia-500 dark:text-fuchsia-300 dark:[text-shadow:0_0_10px_rgba(255,45,209,0.7)]"
                              : "text-gray-400 dark:text-cyan-400/60"
                          }`}
                        >
                          0{i + 1}
                        </span>

                        <span className="flex-1 flex items-baseline gap-3 min-w-0">
                          <span
                            className={`font-serif text-3xl sm:text-5xl tracking-tight transition-transform duration-300 group-hover:translate-x-1 ${
                              active
                                ? "text-gray-900 dark:text-cyan-100 dark:[text-shadow:0_0_18px_rgba(0,240,255,0.45)]"
                                : "text-gray-800 dark:text-gray-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-200"
                            }`}
                          >
                            {item.label}
                          </span>
                          <span className="cyber-num text-[10px] sm:text-xs uppercase tracking-[0.25em] text-gray-400 dark:text-fuchsia-300/70 truncate">
                            {item.en}
                          </span>
                        </span>

                        <span
                          aria-hidden
                          className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md border transition-all duration-300 ${
                            active
                              ? "border-fuchsia-500/60 text-fuchsia-500 dark:border-fuchsia-400/70 dark:text-fuchsia-300 dark:shadow-[0_0_12px_rgba(255,45,209,0.4)]"
                              : "border-gray-300/60 text-gray-400 dark:border-cyan-400/30 dark:text-cyan-300/80 group-hover:translate-x-0.5 group-hover:border-cyan-500 group-hover:text-cyan-600 dark:group-hover:border-cyan-300 dark:group-hover:text-cyan-200"
                          }`}
                        >
                          <svg
                            className="w-4 h-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5 12h14M13 5l7 7-7 7" />
                          </svg>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* 底部签名 */}
            <div className="flex items-end justify-between gap-4 text-[10px] cyber-num uppercase tracking-[0.3em] text-gray-500 dark:text-cyan-300/60">
              <div className="flex flex-col gap-1.5">
                <span className="text-fuchsia-500 dark:text-fuchsia-300/90">
                  // SIGNAL · ACTIVE
                </span>
                <span>Nocturne — 夜色手稿</span>
              </div>
              <div className="text-right hidden sm:flex flex-col gap-1.5">
                <span>ESC · 关闭</span>
                <span>{new Date().toISOString().slice(0, 10)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 主体 */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-5 sm:px-6 py-6 md:py-16">
        {children}
      </main>

      {/* 页脚 */}
      <footer className="border-t border-gray-200/60 dark:border-cyan-400/10 bg-white/50 dark:bg-black/30">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 flex flex-col items-center gap-3 text-xs text-gray-500 dark:text-cyan-300/60">
          <div className="flex items-center gap-2 cyber-num uppercase tracking-[0.25em]">
            <span className="w-1 h-1 rounded-full bg-cyan-500 dark:bg-cyan-400 dark:shadow-[0_0_6px_rgba(0,240,255,0.9)]" />
            <span>Crafted with Next.js · Markdown</span>
            <span className="w-1 h-1 rounded-full bg-fuchsia-500 dark:bg-fuchsia-400 dark:shadow-[0_0_6px_rgba(255,45,209,0.9)]" />
          </div>
          <div className="flex items-center gap-3">
            <span>© {new Date().getFullYear()} Nocturne</span>
            <span className="w-px h-3 bg-gray-300 dark:bg-cyan-400/20" />
            <a
              href="/rss.xml"
              className="inline-flex items-center gap-1 hover:text-orange-600 dark:hover:text-cyan-200 transition-colors"
              aria-label="RSS"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6.18 17.82a2.18 2.18 0 1 1-4.36 0 2.18 2.18 0 0 1 4.36 0zM4 4.44v3.05a12.51 12.51 0 0 1 12.51 12.51h3.05A15.56 15.56 0 0 0 4 4.44zM4 10.1v3.05a6.85 6.85 0 0 1 6.85 6.85h3.05A9.9 9.9 0 0 0 4 10.1z" />
              </svg>
              RSS
            </a>
            <a
              href="/sitemap.xml"
              className="hover:text-gray-900 dark:hover:text-fuchsia-300 transition-colors"
            >
              Sitemap
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

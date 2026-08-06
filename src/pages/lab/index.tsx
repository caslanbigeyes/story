import Link from "next/link";
import SEO from "@/components/SEO";

interface LabItem {
  slug: string;
  title: string;
  en: string;
  desc: string;
  tags: string[];
  status: "live" | "wip";
}

// 学习项目落地清单：新增只需在此追加一条
const LAB_ITEMS: LabItem[] = [
  {
    slug: "15-minute-webgl-plan",
    title: "15 分钟 WebGL 学习计划",
    en: "15-minute WebGL Training Plan",
    desc: "4 小时冲刺：每 15 分钟一个可运行 demo，覆盖 WebGL、Three.js、交互、配置器和性能。",
    tags: ["Plan", "WebGL", "Three.js"],
    status: "live",
  },
  {
    slug: "webgl-triangle",
    title: "手写 WebGL 三角形",
    en: "Hand-crafted WebGL Triangle",
    desc: "从零开始：着色器、程序对象、缓冲、顶点属性、绘制。图形学的 Hello World。",
    tags: ["WebGL", "Shader", "GLSL"],
    status: "live",
  },
  {
    slug: "three-showcase",
    title: "Three.js 立体 Demo",
    en: "Three.js Showcase · TorusKnot",
    desc: "从裸 WebGL 升级到 three.js：金属三叶纽结、双色点光、OrbitControls 可交互。",
    tags: ["three.js", "3D", "PBR"],
    status: "live",
  },
];

export default function LabIndex() {
  return (
    <>
      <SEO
        title="实验室"
        path="/lab"
        description="学习项目落地清单：从原理到能跑的最小实现。"
      />

      <div className="space-y-12 animate-fade-up">
        {/* 标题区 */}
        <header>
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-cyan-300/80 uppercase tracking-[0.25em] mb-4 cyber-num">
            <span className="w-6 h-px bg-gray-400 dark:bg-cyan-400/70 dark:shadow-[0_0_6px_rgba(0,240,255,0.7)]" />
            Lab · 实验室
          </div>
          <h1 className="font-serif text-3xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            学习项目落地
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-3 text-sm md:text-base leading-relaxed max-w-2xl">
            只信「能跑」的知识。这里放最小可运行的 demo，配一句人话解释。
          </p>
        </header>

        {/* 项目列表 */}
        <ul className="space-y-4">
          {LAB_ITEMS.map((item, i) => (
            <li
              key={item.slug}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <Link
                href={`/lab/${item.slug}`}
                className="group relative block bg-white dark:bg-[#0a0d14]/80 rounded-2xl p-6 md:p-7 border border-gray-200/70 dark:border-cyan-400/15 hover:border-gray-300 dark:hover:border-cyan-400/45 hover:shadow-lg dark:hover:shadow-[0_0_24px_rgba(0,240,255,0.18)] hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-gray-400 dark:text-cyan-300/70 mb-2 cyber-num">
                      <span className="cyber-num">0{i + 1}</span>
                      <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-fuchsia-400/80" />
                      <span
                        className={
                          item.status === "live"
                            ? "text-emerald-600 dark:text-emerald-300"
                            : "text-amber-600 dark:text-amber-300"
                        }
                      >
                        {item.status === "live" ? "● LIVE" : "○ WIP"}
                      </span>
                    </div>

                    <h2 className="font-serif text-xl md:text-2xl font-semibold text-gray-900 dark:text-gray-50 leading-snug tracking-tight mb-1 group-hover:text-blue-600 dark:group-hover:text-cyan-200 dark:group-hover:[text-shadow:0_0_14px_rgba(0,240,255,0.45)] transition-colors">
                      {item.title}
                    </h2>
                    <div className="cyber-num text-[10px] uppercase tracking-[0.25em] text-gray-400 dark:text-fuchsia-300/70 mb-3">
                      {item.en}
                    </div>

                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-4">
                      {item.desc}
                    </p>

                    <div className="flex items-center flex-wrap gap-1.5">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 bg-white/60 dark:bg-cyan-400/5 backdrop-blur text-gray-600 dark:text-cyan-200/80 px-2.5 py-0.5 rounded-full text-xs border border-gray-200/60 dark:border-cyan-400/20"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <span
                    aria-hidden
                    className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300/60 dark:border-cyan-400/30 text-gray-400 dark:text-cyan-300/80 group-hover:translate-x-0.5 group-hover:border-cyan-500 group-hover:text-cyan-600 dark:group-hover:border-cyan-300 dark:group-hover:text-cyan-200 transition-all"
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
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

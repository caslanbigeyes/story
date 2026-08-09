// 在 next build (output: 'export') 完成后，往 out/ 里写 rss.xml 和 sitemap.xml。
// 原来的 rss.xml.tsx / sitemap.xml.tsx 用 getServerSideProps，静态导出禁用，故迁移到独立脚本。
// 用法：npm run build && node scripts/write-feeds.mjs

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, "posts");
const OUT_DIR = path.join(ROOT, "out");

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://gghh.xyz").replace(/\/$/, "");
const SITE_NAME = "llf";
const SITE_DESCRIPTION = "基于 Next.js + Markdown 的个人博客";
const SITE_LANG = "zh-CN";
const SITE_AUTHOR = "llf";

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function loadPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(POSTS_DIR, f), "utf8");
      const { data, content } = matter(raw);
      const slug = f.replace(/\.md$/, "");
      const title = typeof data.title === "string" && data.title ? data.title : slug;
      const date =
        typeof data.date === "string" && data.date ? data.date : new Date().toISOString();
      const excerpt =
        typeof data.excerpt === "string" && data.excerpt.trim()
          ? data.excerpt.trim()
          : content.replace(/\s+/g, " ").slice(0, 140).trim();
      const tags = Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === "string") : [];
      return { slug, title, date, excerpt, tags };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function buildRss(posts) {
  const lastBuildDate = new Date().toUTCString();
  const items = posts
    .map((p) => {
      const url = `${SITE_URL}/posts/${p.slug}/`;
      const pubDate = new Date(p.date).toUTCString();
      const categories = p.tags
        .map((t) => `      <category>${escapeXml(t)}</category>`)
        .join("\n");
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(p.excerpt)}</description>
${categories}
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${SITE_URL}</link>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>${SITE_LANG}</language>
    <managingEditor>${escapeXml(SITE_AUTHOR)}</managingEditor>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

function buildSitemap(posts) {
  const staticPaths = ["", "/admin/"];
  const urls = [
    ...staticPaths.map(
      (p) => `  <url>
    <loc>${SITE_URL}${p}</loc>
    <changefreq>${p === "" ? "daily" : "monthly"}</changefreq>
    <priority>${p === "" ? "1.0" : "0.5"}</priority>
  </url>`,
    ),
    ...posts.map((p) => {
      const lastmod = new Date(p.date).toISOString();
      return `  <url>
    <loc>${SITE_URL}/posts/${p.slug}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }),
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error(`[write-feeds] 未发现 out/ 目录，先跑 next build (output:'export')`);
    process.exit(1);
  }
  const posts = loadPosts();
  fs.writeFileSync(path.join(OUT_DIR, "rss.xml"), buildRss(posts), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "sitemap.xml"), buildSitemap(posts), "utf8");
  console.log(`[write-feeds] wrote rss.xml + sitemap.xml (${posts.length} posts)`);
}

main();

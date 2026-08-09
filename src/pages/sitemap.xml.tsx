import type { GetServerSideProps } from "next";
import { getAllPosts } from "@/lib/posts";
import { SITE_URL } from "@/lib/site";

function buildSitemap(): string {
  const posts = getAllPosts();
  const staticUrls = ["", "/admin"];

  const urls = [
    ...staticUrls.map(
      (p) => `  <url>
    <loc>${SITE_URL}${p}</loc>
    <changefreq>${p === "" ? "daily" : "monthly"}</changefreq>
    <priority>${p === "" ? "1.0" : "0.5"}</priority>
  </url>`
    ),
    ...posts.map((p) => {
      const lastmod = new Date(p.date).toISOString();
      return `  <url>
    <loc>${SITE_URL}/posts/${p.slug}</loc>
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

export default function SitemapXml() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=3600, stale-while-revalidate=86400"
  );
  res.write(buildSitemap());
  res.end();
  return { props: {} };
};

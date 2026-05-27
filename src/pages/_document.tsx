import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="zh-CN">
      <Head>
        {/* 禁止移动端缩放，避免阅读时误触缩放破坏排版 */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="format-detection" content="telephone=no" />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="llf RSS"
          href="/rss.xml"
        />
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
      </Head>
      <body>
        {/* 防 FOUC：在渲染前根据 localStorage / 系统偏好同步设置 dark class */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var r=document.documentElement;if(d)r.classList.add('dark');r.style.colorScheme=d?'dark':'light';}catch(e){}})();`,
          }}
        />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

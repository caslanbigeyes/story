/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // GitHub Pages 静态部署：next build 产出到 out/
  output: "export",
  // 静态导出没有图片优化服务
  images: { unoptimized: true },
  // Pages 服务下带斜杠更兼容，避免刷新 404
  trailingSlash: true,
};

module.exports = nextConfig;

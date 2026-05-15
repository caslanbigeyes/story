# News Crawler · 每日资讯自动抓取 + AI 总结

每小时从 `https://news.likanug.top/api/s/entire` 抓取
**Hacker News / GitHub Trending / V2EX 分享创造 / 掘金 / Product Hunt** 的内容，逐条调用大模型
生成中文 AI 总结，最后通过 **Cloudflare Worker（`worker/`）** 发布到博客仓库
的 `posts/` 目录。

如果第一次执行失败，会自动**休眠 30 分钟**后再尝试一次。

```
GitHub Actions (定时)
  │  Node 20 跑 crawl.mjs
  ▼
news.likanug.top  →  逐条 fetch URL  →  OpenAI 兼容 API 总结
  │
  ▼  POST /  +  Bearer <PUBLISH_TOKEN>
Cloudflare Worker (story-blog-publisher)
  │  GitHub Contents API
  ▼
GitHub repo posts/  →  Vercel / GitHub Pages 自动重建
```

---

## 文件清单

```
.github/workflows/news-crawl.yml   ← GitHub Actions（定时 + 重试）
scripts/news-crawler/
├── crawl.mjs                       ← 爬虫脚本主体（Node 20+，纯原生 fetch）
├── package.json                    ← 仅声明 ESM type
└── README.md                       ← 本文件
```

> 脚本不依赖任何第三方包，使用 Node 20 自带的 `fetch` 即可运行，无需 `npm install`。

---

## 配置（GitHub → Settings → Secrets / Variables）

仓库 `Settings` → `Secrets and variables` → `Actions`：

| 名称                | 类型      | 必填 | 说明                                                              |
| ------------------- | --------- | ---- | ----------------------------------------------------------------- |
| `DEEPSEEK_API_KEY`  | secret    | △    | DeepSeek API Key，选 DeepSeek 模型时使用                          |
| `GLM_API_KEY`       | secret    | △    | GLM / 智谱 API Key，选 GLM 模型时使用                             |
| `OPENAI_API_KEY`    | secret    | ❌   | 通用 OpenAI 兼容 key，作为兜底                                    |
| `NEWS_AI_PROVIDER`  | variable  | ❌   | 定时任务默认 provider，如 `deepseek` / `glm`                      |
| `NEWS_AI_MODEL`     | variable  | ❌   | 定时任务默认模型，如 `deepseek-v4-flash` / `glm-4-long`           |
| `OPENAI_BASE_URL`   | secret    | ❌   | 自定义网关；未配置时会按 provider 自动切换                        |
| `OPENAI_MODEL`      | secret    | ❌   | 兼容旧配置；未设置 `NEWS_AI_MODEL` 时作为回退                     |
| `PUBLISH_ENDPOINT`  | secret    | ✅   | Worker 地址，如 `https://story-blog-publisher.xxx.workers.dev`    |
| `PUBLISH_TOKEN`     | secret    | ✅   | Worker 鉴权 token，本项目当前值：`781650249`                      |
| `MAX_ITEMS_PER_SRC` | variable  | ❌   | 每个源最多处理多少条，默认 `10`                                   |

> 兼容任何 OpenAI 协议的网关，比如：
> - OpenAI 官方：`https://api.openai.com/v1`
> - DeepSeek：`https://api.deepseek.com/v1`（模型可用 `deepseek-v4-flash` / `deepseek-v4-pro`）
> - 智谱：`https://open.bigmodel.cn/api/paas/v4`（模型可用 `glm-4-flash` / `glm-4-long`）
> - 通义千问 OpenAI 兼容模式 / OpenRouter / SiliconFlow 等等

> ⚠️ Worker 端也必须先配好自己的 secrets（详见 `worker/README.md`）：
> `PUBLISH_TOKEN=781650249` / `GITHUB_TOKEN=<PAT>` / `REPO=caslanbigeyes/story`。
> Worker 上的 `PUBLISH_TOKEN` 必须与本仓库 Secrets 里的完全一致。

---

## 本地手动跑

### 1) 调真实 Worker 发布

```bash
cd <repo-root>

OPENAI_API_KEY=sk-xxx \
OPENAI_MODEL=gpt-4o-mini \
PUBLISH_ENDPOINT=https://story-blog-publisher.xxx.workers.dev \
PUBLISH_TOKEN=781650249 \
MAX_ITEMS_PER_SRC=3 \
node scripts/news-crawler/crawl.mjs
```

跑完 Worker 会把 Markdown 提交到 `posts/`，Vercel / Pages 随之自动重建。

### 2) 调试：本地写盘（不连 Worker）

不传 `PUBLISH_ENDPOINT` 时脚本会 fallback 把 Markdown 写到
`posts/news-YYYY-MM-DD-HH.md`，便于看输出格式：

```bash
OPENAI_API_KEY=sk-xxx MAX_ITEMS_PER_SRC=2 \
  node scripts/news-crawler/crawl.mjs
```

---

## 输出示例

发布到 Worker 后，仓库会出现一篇形如 `posts/2026-05-15-mxxxxxx.md` 的文章
（slug 由 Worker 根据标题自动生成；中文标题会 fallback 到「日期-时间戳」）。

frontmatter 由 Worker 注入：

```markdown
---
title: "每日资讯 · 2026/05/15 16:00 抓取"
date: "2026-05-15T08:00:12.345Z"
tags: ["news", "ai-summary"]
---

# 每日资讯聚合 · 2026/05/15 16:00

> 数据采集时间：2026/05/15 16:00:12（中国标准时间）
> 聚合来源：Hacker News / GitHub Trending / V2EX / 掘金 / Product Hunt
> AI 模型：gpt-4o-mini

## Hacker News

### 1. RTX 5090 and M4 MacBook Air: Can It Game?

- 文章来源平台：Hacker News
- 原文链接：<https://news.ycombinator.com/item?id=48137145>
- 热度/摘要：212 points

**AI 总结**

- 文章对比了 RTX 5090 与 M4 MacBook Air 在主流 3A 游戏的实际帧率…
- …
- 结论：桌面级独显仍领先一截，但 M 系列在轻度游戏 / 模拟器场景已经够用。

…
```

---

## 调度策略

- `cron: '0 * * * *'`：每小时执行一次。
- 失败时 `sleep 1800` 后自动二次执行，依然失败则本次跳过。
- `concurrency: news-crawl` 避免重复并发。
- 发布走 Worker → GitHub Contents API；workflow 自身设了
  `permissions: contents: read`，不需要写权限。

---

## 调整频率

修改 `.github/workflows/news-crawl.yml` 中的 cron 表达式即可：

| 想要的频率 | cron 表达式            |
| ---------- | ---------------------- |
| 每 4 小时  | `0 */4 * * *`          |
| 每 6 小时  | `0 */6 * * *`          |
| 每 12 小时 | `0 0,12 * * *`         |
| 每天一次   | `0 0 * * *`            |

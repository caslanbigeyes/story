#!/usr/bin/env node
/**
 * News Crawler
 * --------------------------------
 * 1. 从 https://news.likanug.top/api/s/entire 拉取多个源：
 *    hackernews / github-trending-today / v2ex-share / juejin / producthunt
 * 2. 过滤出包含 url 的条目
 * 3. 逐条抓取 url 内容 → 调用大模型生成 AI 总结
 * 4. 拼装 Markdown，发布到 Cloudflare Worker（POST /），或在没配 Worker
 *    时 fallback 写入本地 posts/news-YYYY-MM-DD-HH.md
 *
 * 环境变量：
 *   AI_PROVIDER       可选，deepseek / glm / openai
 *   OPENAI_API_KEY    可选，大模型 key（兼容 OpenAI 协议）
 *   DEEPSEEK_API_KEY  可选，DeepSeek key
 *   GLM_API_KEY       可选，GLM / 智谱 key
 *   OPENAI_BASE_URL   可选，默认根据 provider 推断
 *   OPENAI_MODEL      可选，默认根据 provider 推断
 *   AI_TIMEOUT_MS     可选，单条 AI 超时，默认 60000
 *   FETCH_TIMEOUT_MS  可选，单条网页抓取超时，默认 20000
 *   MAX_ITEMS_PER_SRC 可选，每个源最多处理多少条，默认 10
 *   NEWS_API_URL      可选，默认 https://news.likanug.top/api/s/entire
 *
 *   ── 发布通道（二选一） ──
 *   PUBLISH_ENDPOINT  Cloudflare Worker 地址，例如
 *                       https://story-blog-publisher.xxx.workers.dev
 *   PUBLISH_TOKEN     Worker 鉴权 token（如 781650249）
 *   POSTS_DIR         未配置 PUBLISH_ENDPOINT 时本地写盘目录，默认 posts
 *
 *   ── 去重（可选） ──
 *   GITHUB_TOKEN      GitHub PAT 或 Actions 自动 token，用于读写 seen-ids
 *   SEEN_REPO         仓库名，格式 owner/repo，默认读 SEEN_PATH 所在仓库
 *   SEEN_PATH         seen-ids 文件路径，默认 data/news-seen.json
 *   MAX_SEEN          最多保留多少条 seen URL，默认 1000
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// ────────────────────────────────────────────────────────────────────
// 配置
// ────────────────────────────────────────────────────────────────────
function inferProvider(model) {
  const normalized = (model || '').toLowerCase();
  if (normalized.startsWith('deepseek-')) return 'deepseek';
  if (normalized.startsWith('glm-')) return 'glm';
  return 'openai';
}

function getDefaultBaseUrl(provider) {
  if (provider === 'deepseek') return 'https://api.deepseek.com/v1';
  if (provider === 'glm') return 'https://open.bigmodel.cn/api/paas/v4';
  return 'https://api.openai.com/v1';
}

function getDefaultModel(provider) {
  if (provider === 'deepseek') return 'deepseek-v4-flash';
  if (provider === 'glm') return 'glm-4-flash';
  return 'gpt-4o-mini';
}

const AI_PROVIDER = (
  process.env.AI_PROVIDER ||
  inferProvider(process.env.OPENAI_MODEL)
).toLowerCase();
const OPENAI_MODEL = process.env.OPENAI_MODEL || getDefaultModel(AI_PROVIDER);
const OPENAI_BASE_URL = (
  process.env.OPENAI_BASE_URL || getDefaultBaseUrl(AI_PROVIDER)
).replace(/\/+$/, '');
const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY ||
  (AI_PROVIDER === 'deepseek'
    ? process.env.DEEPSEEK_API_KEY || ''
    : AI_PROVIDER === 'glm'
      ? process.env.GLM_API_KEY || ''
      : '');
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60000);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 20000);
const MAX_ITEMS_PER_SRC = Number(process.env.MAX_ITEMS_PER_SRC || 10);
const POSTS_DIR = process.env.POSTS_DIR || 'posts';

const PUBLISH_ENDPOINT = (process.env.PUBLISH_ENDPOINT || '').replace(/\/+$/, '');
const PUBLISH_TOKEN = process.env.PUBLISH_TOKEN || '';

// 优先用环境变量；有 Worker 时走代理（避免 GitHub Actions IP 被 Cloudflare 拦截）；最后直连
const NEWS_API_URL =
  process.env.NEWS_API_URL ||
  (PUBLISH_ENDPOINT ? `${PUBLISH_ENDPOINT}/news-proxy` : 'https://news.likanug.top/api/s/entire');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const SEEN_REPO = process.env.SEEN_REPO || '';
const SEEN_PATH = process.env.SEEN_PATH || 'data/news-seen.json';
const MAX_SEEN = Number(process.env.MAX_SEEN || 1000);

const DISPLAY_TIMEZONE = process.env.DISPLAY_TIMEZONE || 'Asia/Shanghai';

const SOURCES = [
  'hackernews',
  'github-trending-today',
  'v2ex-share',
  'juejin',
  'producthunt',
];

const SOURCE_LABEL = {
  hackernews: 'Hacker News',
  'github-trending-today': 'GitHub Trending',
  'v2ex-share': 'V2EX',
  juejin: '掘金',
  producthunt: 'Product Hunt',
};

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

// ────────────────────────────────────────────────────────────────────
// 工具
// ────────────────────────────────────────────────────────────────────
function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// 简易 HTML → 纯文本
function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|tr|h\d|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(s, max = 6000) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function formatDisplayTime(date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatTitleTime(date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function getDisplayTimezoneLabel() {
  if (DISPLAY_TIMEZONE === 'Asia/Shanghai') return '中国标准时间';
  return DISPLAY_TIMEZONE;
}

// ────────────────────────────────────────────────────────────────────
// 拉接口
// ────────────────────────────────────────────────────────────────────
async function fetchNewsList() {
  log('Fetching news list:', NEWS_API_URL);
  const res = await fetchWithTimeout(
    NEWS_API_URL,
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: 'https://news.likanug.top',
        referer: 'https://news.likanug.top/',
        'user-agent': UA,
      },
      body: JSON.stringify({ sources: SOURCES }),
    },
    30000
  );
  if (!res.ok) {
    throw new Error(`News API ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('News API returns non-array payload');
  }
  return data;
}

// ────────────────────────────────────────────────────────────────────
// 抓取 url 内容
// ────────────────────────────────────────────────────────────────────
async function fetchPageText(url) {
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'user-agent': UA,
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      log(`  ! fetch ${url} -> ${res.status}`);
      return '';
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text') && !ct.includes('html') && !ct.includes('json')) {
      log(`  ! skip non-text content: ${ct}`);
      return '';
    }
    const html = await res.text();
    return htmlToText(html);
  } catch (e) {
    log(`  ! fetch error: ${e.message}`);
    return '';
  }
}

// ────────────────────────────────────────────────────────────────────
// 调大模型
// ────────────────────────────────────────────────────────────────────
async function summarize({ title, url, content, sourceLabel }) {
  if (!OPENAI_API_KEY) {
    return '> ⚠️ 未配置可用的大模型 API Key，跳过 AI 总结。';
  }

  const userPrompt = `你是一个资深的技术资讯编辑。请基于下方信息，用简洁的中文写一段 AI 总结。

要求：
1. 输出 3 ~ 6 行要点列表（用「- 」开头），最后 1 行固定写成「- 结论：...」。
2. 突出技术要点、影响、可能的应用场景；避免空话与营销词。
3. 如果原文是英文，请翻译并提炼；如果信息不足，请基于标题做合理推断并明确标注「（基于标题推断）」。
4. 只输出 markdown 列表正文，不要输出标题、链接或额外说明。

【来源】${sourceLabel}
【标题】${title}
【URL】${url}
【正文片段】
${truncate(content, 6000) || '（抓取正文失败，仅根据标题推断）'}
`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              '你是一个中文技术资讯编辑，擅长把英文/技术内容提炼成简洁要点。',
          },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      log(`  ! AI ${res.status}: ${text.slice(0, 200)}`);
      return `> ⚠️ AI 总结失败（HTTP ${res.status}）。`;
    }

    const data = await res.json();
    const summary = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!summary) {
      return '> ⚠️ AI 返回为空。';
    }
    return summary;
  } catch (e) {
    log(`  ! AI error: ${e.message}`);
    return `> ⚠️ AI 总结异常：${e.message}`;
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────
// 处理单条
// ────────────────────────────────────────────────────────────────────
async function processItem(item, sourceLabel, index) {
  const title = (item.title || '').replace(/\s+/g, ' ').trim();
  const url = item.url;
  const info = item.extra?.info || '';
  const hover = item.extra?.hover || '';

  log(`  · ${title}  →  ${url}`);

  const fetched = await fetchPageText(url);
  const contentForAI = fetched || [title, hover].filter(Boolean).join('\n');

  const summary = await summarize({
    title,
    url,
    content: contentForAI,
    sourceLabel,
  });

  const metadataLines = [
    `- 文章来源平台：${sourceLabel}`,
    `- 原文链接：<${url}>`,
  ];
  if (info) metadataLines.push(`- 热度/摘要：${info}`);
  if (hover) metadataLines.push(`- 补充信息：${hover}`);

  const block = [
    `### ${index}. ${title}`,
    '',
    ...metadataLines,
    '',
    '**AI 总结**',
    '',
    summary,
    '',
    '---',
    '',
  ]
    .join('\n');

  return block;
}

// ────────────────────────────────────────────────────────────────────
// 主流程
// ────────────────────────────────────────────────────────────────────
function pad(n) {
  return String(n).padStart(2, '0');
}

function buildSlug(now) {
  const y = now.getUTCFullYear();
  const m = pad(now.getUTCMonth() + 1);
  const d = pad(now.getUTCDate());
  const h = pad(now.getUTCHours());
  return `${y}-${m}-${d}-${h}`;
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

// ────────────────────────────────────────────────────────────────────
// 去重：seen-ids 存储在 GitHub repo 的 data/news-seen.json
// ────────────────────────────────────────────────────────────────────
async function loadSeenUrls() {
  if (!SEEN_REPO) return new Set();
  try {
    const rawUrl = `https://raw.githubusercontent.com/${SEEN_REPO}/main/${SEEN_PATH}`;
    const res = await fetchWithTimeout(rawUrl, {}, 10000);
    if (!res.ok) return new Set();
    const data = await res.json();
    const seen = new Set(Array.isArray(data.seen) ? data.seen : []);
    log(`Seen IDs loaded: ${seen.size} URLs`);
    return seen;
  } catch (e) {
    log(`! loadSeenUrls: ${e.message} (starting fresh)`);
    return new Set();
  }
}

async function saveSeenUrls(seenSet) {
  if (!GITHUB_TOKEN || !SEEN_REPO) return;
  const apiUrl = `https://api.github.com/repos/${SEEN_REPO}/contents/${SEEN_PATH}`;
  const ghHeaders = {
    authorization: `Bearer ${GITHUB_TOKEN}`,
    'content-type': 'application/json',
    'user-agent': 'news-crawler',
    accept: 'application/vnd.github+json',
  };

  // 取现有文件 SHA（PUT 更新时必须提供）
  let sha;
  try {
    const res = await fetchWithTimeout(apiUrl, { headers: ghHeaders }, 10000);
    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
    }
  } catch {}

  // 保留最近 MAX_SEEN 条
  const seen = [...seenSet].slice(-MAX_SEEN);
  const payload = JSON.stringify({ seen, updatedAt: new Date().toISOString() }, null, 2);
  const content = Buffer.from(payload).toString('base64');

  try {
    const res = await fetchWithTimeout(
      apiUrl,
      {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify({
          message: 'chore: update news seen-ids [skip actions]',
          content,
          ...(sha ? { sha } : {}),
        }),
      },
      15000
    );
    if (res.ok) {
      log(`Seen IDs saved: ${seen.length} URLs`);
    } else {
      const t = await res.text().catch(() => '');
      log(`! saveSeenUrls ${res.status}: ${t.slice(0, 100)}`);
    }
  } catch (e) {
    log(`! saveSeenUrls: ${e.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────
// 发布
// ────────────────────────────────────────────────────────────────────
/**
 * 通过 Cloudflare Worker 发布（POST /，Worker 自己拼 frontmatter）
 * content 不要再包含 frontmatter
 */
async function publishToWorker({ title, content, tags }) {
  if (!PUBLISH_TOKEN) {
    throw new Error('PUBLISH_ENDPOINT 已配置但 PUBLISH_TOKEN 为空');
  }
  log(`Publishing to Worker: ${PUBLISH_ENDPOINT}`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);

  try {
    const res = await fetch(PUBLISH_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${PUBLISH_TOKEN}`,
      },
      body: JSON.stringify({ title, content, tags }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok || data?.ok === false || data?.error) {
      throw new Error(
        `Worker ${res.status}: ${data?.error || data?.message || text.slice(0, 200)}`
      );
    }
    log(`Worker OK: slug=${data.slug}  commit=${data.commit?.slice(0, 7)}`);
    log(`URL: ${data.url || '(unknown)'}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fallback：本地写盘（带完整 frontmatter）
 */
async function writeToLocal({ title, content, tags, slug }) {
  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    '..'
  );
  const outDir = path.resolve(repoRoot, POSTS_DIR);
  await ensureDir(outDir);
  const outPath = path.join(outDir, `news-${slug}.md`);

  const frontMatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${JSON.stringify(new Date().toISOString())}`,
    `excerpt: "Hacker News / GitHub Trending / V2EX / 掘金 / Product Hunt 自动聚合 + AI 总结"`,
    `tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]`,
    '---',
    '',
  ].join('\n');

  await fs.writeFile(outPath, frontMatter + content, 'utf8');
  log(`Written: ${outPath}`);
}

async function main() {
  log('=== News Crawler start ===');
  log(`Provider: ${AI_PROVIDER}`);
  log(`Model: ${OPENAI_MODEL} @ ${OPENAI_BASE_URL}`);
  log(`Sources: ${SOURCES.join(', ')}`);
  log(`Max items per source: ${MAX_ITEMS_PER_SRC}`);
  log(
    `Publish channel: ${
      PUBLISH_ENDPOINT ? `worker(${PUBLISH_ENDPOINT})` : `local(${POSTS_DIR}/)`
    }`
  );

  const [list, seenUrls] = await Promise.all([fetchNewsList(), loadSeenUrls()]);

  const buckets = SOURCES.map((srcId) => {
    const block = list.find((b) => b.id === srcId);
    const items = (block?.items || [])
      .filter((it) => it && it.url && /^https?:\/\//i.test(it.url))
      .filter((it) => {
        if (seenUrls.has(it.url)) {
          log(`  ~ skip (seen): ${it.url}`);
          return false;
        }
        return true;
      })
      .slice(0, MAX_ITEMS_PER_SRC);
    return { srcId, label: SOURCE_LABEL[srcId] || srcId, items };
  });

  const totalItems = buckets.reduce((s, b) => s + b.items.length, 0);
  log(`Total items to summarize: ${totalItems}`);
  if (totalItems === 0) {
    log('All items already seen, nothing to publish.');
    return;
  }

  const newUrls = [];
  const sections = [];
  for (const bucket of buckets) {
    if (bucket.items.length === 0) continue;
    log(`>> Source: ${bucket.label} (${bucket.items.length} items)`);
    const blocks = [];
    let itemIndex = 1;
    for (const item of bucket.items) {
      try {
        const md = await processItem(item, bucket.label, itemIndex);
        blocks.push(md);
        newUrls.push(item.url);
        itemIndex += 1;
      } catch (e) {
        log(`  ! processItem error: ${e.message}`);
        blocks.push(
          [
            `### ${itemIndex}. ${item.title}`,
            '',
            `- 文章来源平台：${bucket.label}`,
            `- 原文链接：<${item.url}>`,
            '',
            `> ⚠️ 处理失败：${e.message}`,
            '',
            '---',
            '',
          ].join('\n')
        );
        itemIndex += 1;
      }
    }
    sections.push(
      [
        `## ${bucket.label}`,
        '',
        `> 来源平台：${bucket.label} · 本次收录 ${bucket.items.length} 条`,
        '',
        blocks.join('\n'),
      ].join('\n')
    );
  }

  const now = new Date();
  const slug = buildSlug(now);
  const titleTime = formatTitleTime(now);
  const displayTime = formatDisplayTime(now);
  const timezoneLabel = getDisplayTimezoneLabel();

  // 文章标题 & 标签
  const humanTitle = `每日资讯 · ${titleTime} 抓取`;
  const tags = ['news', 'ai-summary'];

  // 正文（不含 frontmatter，frontmatter 由 Worker 或 writeToLocal 拼）
  const contentHeader = [
    `# 每日资讯聚合 · ${titleTime}`,
    '',
    `> 数据采集时间：${displayTime}（${timezoneLabel}）`,
    `> 聚合来源：${SOURCES.map((source) => SOURCE_LABEL[source] || source).join(' / ')}`,
    `> AI 模型：${OPENAI_MODEL}`,
    '',
  ].join('\n');

  const content = contentHeader + '\n' + sections.join('\n\n');

  if (PUBLISH_ENDPOINT) {
    await publishToWorker({ title: humanTitle, content, tags });
  } else {
    log('PUBLISH_ENDPOINT 未配置，fallback 到本地写盘');
    await writeToLocal({ title: humanTitle, content, tags, slug });
  }

  // 发布成功后更新 seen-ids
  for (const url of newUrls) seenUrls.add(url);
  await saveSeenUrls(seenUrls);

  log('=== News Crawler done ===');
}

main().catch((e) => {
  log('FATAL:', e?.stack || e);
  process.exit(1);
});

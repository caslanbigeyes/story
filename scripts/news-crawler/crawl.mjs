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
 *   AI_PROVIDER       可选，deepseek / glm / gemini / openai / openrouter
 *   OPENAI_API_KEY    可选，大模型 key（兼容 OpenAI 协议）
 *   DEEPSEEK_API_KEY  可选，DeepSeek key
 *   GLM_API_KEY       可选，GLM / 智谱 key
 *   GEMINI_API_KEY    可选，Google Gemini key
 *   OPENROUTER_API_KEY 可选，OpenRouter key（推荐用免费模型，如 z-ai/glm-4.5-air:free）
 *   OPENROUTER_REFERER 可选，OpenRouter 排行榜来源标识（HTTP-Referer 头）
 *   OPENROUTER_TITLE  可选，OpenRouter 排行榜应用名（X-Title 头）
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
 *   IGNORE_SEEN       可选，true/1/yes 时忽略 seen-ids，强制本次重跑
 *   SEEN_REPO         仓库名，格式 owner/repo，默认读 SEEN_PATH 所在仓库
 *   SEEN_PATH         seen-ids 文件路径，默认 data/news-seen.json
 *   MAX_SEEN          最多保留多少条 seen URL，默认 1000
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';

// ────────────────────────────────────────────────────────────────────
// 配置
// ────────────────────────────────────────────────────────────────────
function inferProvider(model) {
  const normalized = (model || '').toLowerCase();
  // OpenRouter 风格：以 ":free" 结尾，或形如 "vendor/model"（且非 gemini）
  if (normalized.endsWith(':free')) return 'openrouter';
  if (normalized.startsWith('openrouter/')) return 'openrouter';
  if (normalized.startsWith('deepseek-')) return 'deepseek';
  if (normalized.startsWith('glm-')) return 'glm';
  if (normalized.startsWith('gemini-')) return 'gemini';
  return 'openai';
}

function getDefaultBaseUrl(provider) {
  if (provider === 'deepseek') return 'https://api.deepseek.com';
  if (provider === 'glm') return 'https://open.bigmodel.cn/api/paas/v4';
  if (provider === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta';
  if (provider === 'openrouter') return 'https://openrouter.ai/api/v1';
  return 'https://api.openai.com/v1';
}

function getDefaultModel(provider) {
  if (provider === 'deepseek') return 'deepseek-v4-flash';
  if (provider === 'glm') return 'glm-4-flash';
  if (provider === 'gemini') return 'gemini-flash-latest';
  // OpenRouter 中文资讯总结优选 GLM-4.5-Air 免费版（对中文友好且免费）
  if (provider === 'openrouter') return 'z-ai/glm-4.5-air:free';
  return 'glm-4-flash';
}

function getExpectedEnvKey(provider) {
  if (provider === 'deepseek') return 'DEEPSEEK_API_KEY';
  if (provider === 'glm') return 'GLM_API_KEY or OPENAI_API_KEY';
  if (provider === 'gemini') return 'GEMINI_API_KEY';
  if (provider === 'openrouter') return 'OPENROUTER_API_KEY';
  return 'OPENAI_API_KEY';
}

const AI_PROVIDER = (
  process.env.AI_PROVIDER ||
  inferProvider(process.env.OPENAI_MODEL)
).toLowerCase();
const OPENAI_MODEL = process.env.OPENAI_MODEL || getDefaultModel(AI_PROVIDER);
const OPENAI_BASE_URL = (
  process.env.OPENAI_BASE_URL || getDefaultBaseUrl(AI_PROVIDER)
).replace(/\/+$/, '');
const AI_API_KEY = (
  AI_PROVIDER === 'deepseek'
    ? process.env.DEEPSEEK_API_KEY || ''
    : AI_PROVIDER === 'glm'
      ? process.env.GLM_API_KEY || process.env.OPENAI_API_KEY || ''
      : AI_PROVIDER === 'gemini'
        ? process.env.GEMINI_API_KEY || ''
      : AI_PROVIDER === 'openrouter'
        ? process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || ''
      : process.env.OPENAI_API_KEY || ''
);

// OpenRouter 排行榜可选标识（不传也能用）
const OPENROUTER_REFERER = process.env.OPENROUTER_REFERER || '';
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || '';
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
const IGNORE_SEEN = /^(1|true|yes|on)$/i.test(process.env.IGNORE_SEEN || '');
const SEEN_REPO = process.env.SEEN_REPO || '';
const SEEN_PATH = process.env.SEEN_PATH || 'data/news-seen.json';
const MAX_SEEN = Number(process.env.MAX_SEEN || 1000);

// 资讯条目（含 AI 读后感）持久化
const NEWS_ITEMS_PATH = process.env.NEWS_ITEMS_PATH || 'data/news-items.json';
const MAX_NEWS_ITEMS = Number(process.env.MAX_NEWS_ITEMS || 500);

// ────────────────────────────────────────────────────────────────────
// 读后感模板（基于 writeSkills.md 的十种结构 + 情绪基调）
// ────────────────────────────────────────────────────────────────────
//
// 设计原则：
// 1. 每个模板把 writeSkills.md 里"卖货式推文"的结构，翻译成
//    "深夜微信发给朋友的读后感"语境下的可执行指令。
// 2. 每个模板搭配一个独立的"情绪基调"，由 picker 滑窗保证
//    连续五篇情绪互不撞车（templates.length=10 > windowSize=5，
//    候选永远非空）。
// 3. 结构指令只描述骨架，不规定字数/格式——硬约束在 generateReflection
//    里集中维护（DRY，避免十处重复同一条规则）。
const REFLECTION_TEMPLATES = [
  {
    id: 'cognitive-flip',
    name: '认知颠覆型',
    mood: '略带抬杠的不服，克制的锐利',
    structure:
      '开头抛出一个看似"大家都默认的"认知，紧接着用一句话把它推翻；之后两到三段用你被这条资讯戳到的具体细节支撑你的反驳；结尾留一句独立可传播的判断句。',
  },
  {
    id: 'personal-trace',
    name: '个人经历拆解型',
    mood: '复盘的平静里藏一丝后怕',
    structure:
      '开头用一个具体的时间或数字锚定一件过去的事；中间复盘两到三个关键转折点，每个转折点配一句具体到地铁/对话/天气的场景；结尾写一句"现在回头看才发现的事"。',
  },
  {
    id: 'framework',
    name: '框架输出型',
    mood: '冷静自信里夹着普通人的克制',
    structure:
      '先点出这条资讯让你在意的那个"判断点"，然后把你脑子里的判断逻辑拆成 3 步小框架（每步一句，像工程师的 checklist）；最后给一个"什么情况下框架失效"的边界条件。',
  },
  {
    id: 'curated-list',
    name: '清单型',
    mood: '实用、带一点强迫症的整理感',
    structure:
      '开头说出你读完这条资讯之后联想到的"自己最近留意/纠结的几件事"，列成 3 条短句，每条配一句具体场景；结尾一句"如果只能选一个，我选 X，原因很简单——"。不要写成 markdown 列表，要混在自然段里。',
  },
  {
    id: 'before-after',
    name: '前后对比型',
    mood: '释然中夹一点自嘲，时间的钝感',
    structure:
      '开头用"半年前 / 一年前的我"和"现在的我"两个具体到场景的速写并列；中间一段写"读到这条资讯我才意识到什么变了"；结尾给一句最反直觉的认知。',
  },
  {
    id: 'in-progress',
    name: '过程透明型',
    mood: '实诚的轻焦虑，自我怀疑',
    structure:
      '把你当下正在做的一件具体小事（带数字/进度）抛出来；用这条资讯当镜子照出你心里某个不安；结尾留一句"下一步打算做什么/不做什么"。',
  },
  {
    id: 'ab-compare',
    name: '对比分析型',
    mood: '中立、拉锯、平和',
    structure:
      '把这条资讯把你卡进去的"A 和 B"两件事摆出来；写出两到三个差异维度（每个维度一句对比句）；结尾给"什么情况下选哪个"，并补一个限定条件避免绝对化。',
  },
  {
    id: 'story-hook',
    name: '故事钩型',
    mood: '怀旧、怔忡、怅然',
    structure:
      '开头是一个有悬念的小场景（具体到地点/光线/谁说了什么）；中间用两到三句话把场景一步步推进；高潮处给一个意外的细节；最后用一句话把这条资讯和这个故事钉在一起，不要解释、不要升华。',
  },
  {
    id: 'how-to',
    name: '教学实操型',
    mood: '沉稳、克制的说教感，干净',
    structure:
      '从"读完这条资讯，我会给当年的自己什么建议"切入；写出三到四步具体可执行的小动作，每步混在段落里讲清楚；结尾留一句"我以前在哪一步踩过坑"。',
  },
  {
    id: 'manifesto',
    name: '观点宣言型',
    mood: '决绝、不退让，略冷',
    structure:
      '第一句就抛出你的明确立场，不含糊、不让步；中间两到三段每段一个支撑论据，用具体场景而不是抽象大词；结尾承认一个边界条件，再用一句话强化立场。',
  },
];

/**
 * 创建读后感模板挑选器。
 *
 * 使用滑动窗口（默认 5）保证"最近 N 篇"的模板与情绪不重复，
 * 完整覆盖一轮后窗口自然滑走，最早的模板重新进入候选。
 *
 * SOLID-S：只负责"挑下一篇用什么模板"，与 prompt 拼装解耦。
 * KISS：候选集 = templates - recent，从中均匀随机取一个。
 *
 * @param {{ windowSize?: number, templates?: typeof REFLECTION_TEMPLATES }} opts
 * @returns {() => typeof REFLECTION_TEMPLATES[number]}
 */
function createReflectionTemplatePicker(opts = {}) {
  const templates = opts.templates || REFLECTION_TEMPLATES;
  const windowSize = Math.max(
    1,
    Math.min(opts.windowSize ?? 5, Math.max(1, templates.length - 1))
  );
  const recent = [];

  return function pick() {
    let pool = templates.filter((t) => !recent.includes(t.id));
    if (pool.length === 0) pool = templates; // 兜底：不该发生，但保证总有候选
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    recent.push(chosen.id);
    while (recent.length > windowSize) recent.shift();
    return chosen;
  };
}

const DISPLAY_TIMEZONE = process.env.DISPLAY_TIMEZONE || 'Asia/Shanghai';

const SOURCES = [
  'hackernews',
  'github-trending-today',
  'v2ex-share',
  'juejin',
  'producthunt',
  'zhihu'
];

const SOURCE_LABEL = {
  hackernews: 'Hacker News',
  'github-trending-today': 'GitHub Trending',
  'v2ex-share': 'V2EX',
  juejin: '掘金',
  producthunt: 'Product Hunt',
  'zhihu':"知乎"
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
//  url 内容
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
// 调大模型（统一封装，summarize / generateReflection 共用）
// ────────────────────────────────────────────────────────────────────
async function callChatModel({ systemPrompt, userPrompt, temperature = 0.4 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);

  try {
    const res =
      AI_PROVIDER === 'gemini'
        ? await fetch(
            `${OPENAI_BASE_URL}/models/${encodeURIComponent(OPENAI_MODEL)}:generateContent`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-goog-api-key': AI_API_KEY,
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      { text: `${systemPrompt}\n\n${userPrompt}` },
                    ],
                  },
                ],
                generationConfig: { temperature },
              }),
              signal: ctrl.signal,
            }
          )
        : await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${AI_API_KEY}`,
              // OpenRouter 排行榜可选头：传了会把本应用列入站点统计
              ...(AI_PROVIDER === 'openrouter' && OPENROUTER_REFERER
                ? { 'HTTP-Referer': OPENROUTER_REFERER }
                : {}),
              ...(AI_PROVIDER === 'openrouter' && OPENROUTER_TITLE
                ? { 'X-Title': OPENROUTER_TITLE }
                : {}),
            },
            body: JSON.stringify({
              model: OPENAI_MODEL,
              temperature,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
            }),
            signal: ctrl.signal,
          });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      log(`  ! AI ${res.status}: ${text.slice(0, 200)}`);
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const out =
      AI_PROVIDER === 'gemini'
        ? (data?.candidates?.[0]?.content?.parts || [])
            .filter((part) => !part?.thought)
            .map((part) => part?.text || '')
            .join('\n')
            .trim()
        : data?.choices?.[0]?.message?.content?.trim() || '';
    return out;
  } finally {
    clearTimeout(timer);
  }
}

async function summarize({ title, url, content, sourceLabel }) {
  if (!AI_API_KEY) {
    return `> ⚠️ 未配置 ${getExpectedEnvKey(AI_PROVIDER)}，跳过 AI 总结。`;
  }

  const systemPrompt =
    '你是一个中文技术资讯编辑，擅长把英文/技术内容提炼成简洁要点。';

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

  try {
    const summary = await callChatModel({ systemPrompt, userPrompt });
    if (!summary) return '> ⚠️ AI 返回为空。';
    return summary;
  } catch (e) {
    if (e.status === 401) {
      return `> ⚠️ AI 总结失败（HTTP 401）：${AI_PROVIDER} 的 API Key 无效、缺失，或与当前服务商不匹配。`;
    }
    if (e.status) return `> ⚠️ AI 总结失败（HTTP ${e.status}）。`;
    log(`  ! AI error: ${e.message}`);
    return `> ⚠️ AI 总结异常：${e.message}`;
  }
}

/**
 * 写"读后感"。
 *
 * 设计要点（依据仓库根目录 readSkills.md + writeSkills.md）：
 *   - 不复述原文、不空话、不强行升华
 *   - 抓一个具体的"刺痛点"，加入具体生活场景，写矛盾感
 *   - 停在情绪里
 *   - 因为完全自动化没有"真实经历"，prompt 明确允许"想象一个普通人的具体场景"，
 *     前端会标注「AI 模拟人写的读后感」避免误导
 *   - template 参数来自 createReflectionTemplatePicker()，决定本篇的
 *     结构骨架与情绪基调；十种模板 + 滑窗保证最近 5 篇不撞车
 *
 * @param {{
 *   title: string,
 *   url: string,
 *   content: string,
 *   sourceLabel: string,
 *   template: typeof REFLECTION_TEMPLATES[number]
 * }} args
 */
async function generateReflection({ title, url, content, sourceLabel, template }) {
  if (!AI_API_KEY) {
    return `> ⚠️ 未配置 ${getExpectedEnvKey(AI_PROVIDER)}，跳过 AI 读后感。`;
  }

  const systemPrompt =
    '你不是在写"标准读后感"。你是在模拟一个普通的、有具体生活的中国成年人，深夜读完一条资讯后随手发给老朋友的微信文字。你说话直白、口语化、允许停顿和短句。同一个人在不同心情下会有不同的表达方式——这次你接到的"情绪 / 结构"要求是任务的一部分，必须落到字里行间，但绝不能把模板名字写出来。';

  const userPrompt = `请基于下方这条资讯，写一段"像人"的读后感。

【本次结构 / 情绪】
- 结构：${template.name}
- 情绪基调：${template.mood}
- 骨架指令：${template.structure}
（重要：以上是写作的隐形骨架，不要在正文里出现"按 xxx 结构""我用 xxx 模板"之类的元说明，也不要写出模板名字。）

【硬性要求】
1. 不要复述原文。绝对不要"作者表达了…""这反映了…""这则新闻告诉我们…"。
2. 不要"深受启发""引人深思""令人感慨""值得我们学习"这类废话。
3. 全文用口语化中文，可短句、可停顿、可自嘲。可以用句号换行制造停顿感。
4. 只抓一个最让你"莫名其妙在意"或者"心里被戳一下"的点，展开。不要面面俱到。
5. 必须加入一个具体生活场景。可以虚构，但要具体：地铁几号线、加班到几点、和谁的一次对话、看着窗外的某个画面。不要"在某个深夜""在某个时刻"这种空话。
6. 写出"矛盾感"：例如「我知道这样不对但还是…」「我都成年了但还是…」「我懂这道理但还是难受」。
7. 不要强行升华。不要给结论。停在一个情绪里就好。
8. 字数控制在 200 ~ 400 字。
9. 输出纯文本段落（可以多段），不要标题、不要 markdown 列表、不要分隔符、不要署名。
10. 情绪基调必须贯穿全文——读者读完应能感受到这一篇和上一篇是不同状态下的同一个人在说话。

【资讯信息】
- 来源：${sourceLabel}
- 标题：${title}
- 链接：${url}
- 上下文片段（可能很少，甚至只有标题）：
${truncate(content, 4000) || '（仅有标题，请基于标题与常识自由联想）'}
`;

  try {
    const text = await callChatModel({
      systemPrompt,
      userPrompt,
      temperature: 0.9, // 模板已经强约束结构，把温度调高一档让情绪基调更鲜明
    });
    if (!text) return '> ⚠️ AI 读后感返回为空。';
    return text;
  } catch (e) {
    if (e.status === 401) {
      return `> ⚠️ AI 读后感失败（HTTP 401）：${AI_PROVIDER} 的 API Key 无效。`;
    }
    if (e.status) return `> ⚠️ AI 读后感失败（HTTP ${e.status}）。`;
    log(`  ! reflection error: ${e.message}`);
    return `> ⚠️ AI 读后感异常：${e.message}`;
  }
}

// ────────────────────────────────────────────────────────────────────
// 处理单条
// ────────────────────────────────────────────────────────────────────
function buildNewsItemId(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 12);
}

async function processItem(item, source, index, pickTemplate) {
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
    sourceLabel: source.label,
  });

  // 每条都从滑动窗口 picker 取一个模板，保证最近 5 条结构/情绪不撞车
  const template = pickTemplate();
  log(`    · reflection template = ${template.name}（${template.mood}）`);

  const reflection = await generateReflection({
    title,
    url,
    content: contentForAI,
    sourceLabel: source.label,
    template,
  });

  const metadataLines = [
    `- 文章来源平台：${source.label}`,
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
  ].join('\n');

  const newsItem = {
    id: buildNewsItemId(url),
    sourceId: source.id,
    sourceLabel: source.label,
    title,
    url,
    info,
    hover,
    reflection,
    // 记录本次模板，便于前端展示"这一篇是哪种调性"，也便于将来做去重/分析
    reflectionTemplate: {
      id: template.id,
      name: template.name,
      mood: template.mood,
    },
    createdAt: new Date().toISOString(),
  };

  return { block, newsItem };
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
  if (IGNORE_SEEN) {
    log('IGNORE_SEEN enabled, skipping seen-ids check.');
    return new Set();
  }
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

/**
 * 合并新旧条目：新条目优先，按 id 去重，按 createdAt 倒序，截断到 MAX_NEWS_ITEMS。
 * 本地写盘与远程 PUT 共用此逻辑，避免重复实现（DRY）。
 */
function mergeNewsItems(existing, newItems) {
  const byId = new Map();
  for (const it of newItems) byId.set(it.id, it);
  for (const it of existing) {
    if (!byId.has(it.id)) byId.set(it.id, it);
  }
  return Array.from(byId.values())
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, MAX_NEWS_ITEMS);
}

/**
 * 本地写盘 fallback：未配 GITHUB_TOKEN / SEEN_REPO 时把读后感写到仓库内
 * data/news-items.json，避免本次跑的产物丢失。
 */
async function saveNewsItemsLocal(newItems) {
  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    '..'
  );
  const outPath = path.resolve(repoRoot, NEWS_ITEMS_PATH);
  await ensureDir(path.dirname(outPath));

  let existing = [];
  try {
    const raw = await fs.readFile(outPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.items)) existing = parsed.items;
  } catch (e) {
    if (e.code !== 'ENOENT') {
      log(`! news-items local: 读取已有文件失败 ${e.message}（视为空）`);
    }
  }

  const merged = mergeNewsItems(existing, newItems);
  const payload = JSON.stringify(
    { items: merged, updatedAt: new Date().toISOString() },
    null,
    2
  );
  await fs.writeFile(outPath, payload, 'utf8');
  log(
    `News items saved locally: +${newItems.length}, total ${merged.length} → ${outPath}`
  );
}

/**
 * 把本次新增的资讯条目（含读后感）合并写回 data/news-items.json。
 * 优先走 GitHub contents API（CI 场景）；未配 GitHub 凭据时走本地写盘 fallback。
 *
 * 文件格式：
 *   { items: NewsItem[], updatedAt: ISO }
 * items 按 createdAt 倒序保留最近 MAX_NEWS_ITEMS 条，按 id 去重。
 */
async function saveNewsItems(newItems) {
  if (newItems.length === 0) return;
  if (!GITHUB_TOKEN || !SEEN_REPO) {
    log('! news-items: 缺 GITHUB_TOKEN 或 SEEN_REPO，改走本地写盘 fallback。');
    await saveNewsItemsLocal(newItems);
    return;
  }

  const apiUrl = `https://api.github.com/repos/${SEEN_REPO}/contents/${NEWS_ITEMS_PATH}`;
  const ghHeaders = {
    authorization: `Bearer ${GITHUB_TOKEN}`,
    'content-type': 'application/json',
    'user-agent': 'news-crawler',
    accept: 'application/vnd.github+json',
  };

  // 拉已有文件
  let sha;
  let existing = [];
  try {
    const res = await fetchWithTimeout(apiUrl, { headers: ghHeaders }, 10000);
    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
      try {
        const decoded = Buffer.from(data.content || '', 'base64').toString(
          'utf8'
        );
        const parsed = JSON.parse(decoded);
        if (Array.isArray(parsed.items)) existing = parsed.items;
      } catch (e) {
        log(`! news-items: 解析已有文件失败：${e.message}（视为空）`);
      }
    } else if (res.status !== 404) {
      log(`! news-items: GET ${res.status}`);
    }
  } catch (e) {
    log(`! news-items: GET 异常 ${e.message}`);
  }

  const merged = mergeNewsItems(existing, newItems);

  const payload = JSON.stringify(
    { items: merged, updatedAt: new Date().toISOString() },
    null,
    2
  );
  const content = Buffer.from(payload).toString('base64');

  try {
    const res = await fetchWithTimeout(
      apiUrl,
      {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify({
          message: `chore: update news-items (+${newItems.length}) [skip actions]`,
          content,
          ...(sha ? { sha } : {}),
        }),
      },
      15000
    );
    if (res.ok) {
      log(`News items saved: +${newItems.length}, total ${merged.length}`);
    } else {
      const t = await res.text().catch(() => '');
      log(`! news-items PUT ${res.status}: ${t.slice(0, 120)}`);
    }
  } catch (e) {
    log(`! news-items PUT 异常 ${e.message}`);
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

  const sourceSummary = SOURCES.map((s) => SOURCE_LABEL[s] || s).join(' / ');
  const frontMatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${JSON.stringify(new Date().toISOString())}`,
    `excerpt: ${JSON.stringify(`${sourceSummary} 自动聚合 + AI 总结`)}`,
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
  log(`Expected key env: ${getExpectedEnvKey(AI_PROVIDER)}`);
  log(`Sources: ${SOURCES.join(', ')}`);
  log(`Max items per source: ${MAX_ITEMS_PER_SRC}`);
  log(`Ignore seen URLs: ${IGNORE_SEEN ? 'yes' : 'no'}`);
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
  const newNewsItems = [];
  const sections = [];
  // 整个 main 共享一个 picker：滑动窗口跨 bucket 持续生效，
  // 避免"换了一个来源就重新洗牌"导致同一情绪连续两次出现。
  const pickReflectionTemplate = createReflectionTemplatePicker({ windowSize: 5 });
  for (const bucket of buckets) {
    if (bucket.items.length === 0) continue;
    log(`>> Source: ${bucket.label} (${bucket.items.length} items)`);
    const blocks = [];
    let itemIndex = 1;
    for (const item of bucket.items) {
      try {
        const { block, newsItem } = await processItem(
          item,
          { id: bucket.srcId, label: bucket.label },
          itemIndex,
          pickReflectionTemplate
        );
        blocks.push(block);
        newUrls.push(item.url);
        newNewsItems.push(newsItem);
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
  const humanTitle = `  ${titleTime}`;
  const tags = ['news', 'ai-summary'];

  // 正文（不含 frontmatter，frontmatter 由 Worker 或 writeToLocal 拼）
  const contentHeader = [
    `# 每日资讯聚合 · ${titleTime}`,
    '',
    `> 采集时间：${displayTime}（${timezoneLabel}）`,
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

  // 发布成功后更新 seen-ids 和 news-items
  for (const url of newUrls) seenUrls.add(url);
  await saveSeenUrls(seenUrls);
  await saveNewsItems(newNewsItems);

  log('=== News Crawler done ===');
}

main().catch((e) => {
  log('FATAL:', e?.stack || e);
  process.exit(1);
});

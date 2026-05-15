/**
 * Cloudflare Worker：博客发布服务
 *
 * 路由：
 *   OPTIONS *           CORS preflight
 *   GET  /              健康检查
 *   POST /              发布单篇文章
 *   GET  /list          列出 posts/ 目录所有文章（管理用）
 *   POST /delete        批量删除文章 { slugs: string[] }
 *   POST /crawl/trigger 触发 GitHub Actions 的 News Crawl workflow（手动跑一次）
 *
 * 绑定变量：
 *   PUBLISH_TOKEN   —— 后台口令
 *   GITHUB_TOKEN    —— GitHub PAT
 *   REPO            —— owner/repo
 *   ALLOWED_ORIGIN  —— 可选，允许的前端域名
 */

export interface Env {
  PUBLISH_TOKEN: string;
  GITHUB_TOKEN: string;
  REPO: string;
  ALLOWED_ORIGIN?: string;
}

interface PublishBody {
  title?: string;
  content?: string;
  tags?: string[];
}

interface DeleteBody {
  slugs?: string[];
}

interface GithubErrorPayload {
  message?: string;
  documentation_url?: string;
}

interface GithubPutPayload extends GithubErrorPayload {
  content?: { html_url?: string; sha?: string };
  commit?: { sha?: string; html_url?: string };
}

interface GithubFilePayload {
  sha?: string;
  name?: string;
  path?: string;
  html_url?: string;
  download_url?: string;
}

interface DeleteResultItem {
  slug: string;
  ok: boolean;
  message?: string;
  commit?: string;
}

// ---------- 工具函数 ----------

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Expose-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}

function slugifyAscii(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function buildSlug(title: string): string {
  const datePrefix = new Date().toISOString().slice(0, 10);
  const asciiSlug = slugifyAscii(title);
  if (asciiSlug) {
    return `${datePrefix}-${asciiSlug.slice(0, 60)}`;
  }
  return `${datePrefix}-${Date.now().toString(36)}`;
}

function hintFromStatus(status: number, repo: string): string | undefined {
  if (status === 401) return "GITHUB_TOKEN 无效或过期";
  if (status === 403)
    return "GITHUB_TOKEN 权限不足，Fine-grained PAT 需要 Contents: Read and write";
  if (status === 404)
    return `仓库 ${repo} 不存在，或文件不存在 / Token 无访问权限`;
  if (status === 422) return "并发冲突或 sha 不匹配";
  return undefined;
}

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** 解析 base64 后的内容（用于读取 GitHub contents 接口返回的 md） */
function fromBase64Utf8(b64: string): string {
  const cleaned = b64.replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function pickOrigin(request: Request, env: Env): string {
  const requestOrigin = request.headers.get("Origin") || "";
  const configured = env.ALLOWED_ORIGIN?.trim();

  if (!configured || configured === "*") {
    return requestOrigin || "*";
  }

  const whitelist = configured
    .split(",")
    .map((s) => normalizeOrigin(s))
    .filter(Boolean);

  if (whitelist.length === 0) {
    return requestOrigin || "*";
  }

  const normalizedRequest = normalizeOrigin(requestOrigin);
  if (normalizedRequest && whitelist.includes(normalizedRequest)) {
    return requestOrigin;
  }
  return whitelist[0];
}

/** 校验 token + 必要 env，返回 null 表示通过，否则返回错误 Response */
function authGuard(
  request: Request,
  env: Env,
  origin: string
): Response | null {
  const { PUBLISH_TOKEN, GITHUB_TOKEN, REPO } = env;
  if (!PUBLISH_TOKEN || !GITHUB_TOKEN || !REPO) {
    return json(
      {
        error: "Worker 未配置必要的环境变量",
        hint: "请用 `npx wrangler secret put PUBLISH_TOKEN|GITHUB_TOKEN|REPO` 设置",
      },
      500,
      origin
    );
  }
  if (request.headers.get("Authorization") !== `Bearer ${PUBLISH_TOKEN}`) {
    return json({ error: "Unauthorized" }, 401, origin);
  }
  return null;
}

function buildGithubHeaders(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "story-blog-worker",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// ---------- 业务 handler ----------

async function handlePublish(
  request: Request,
  env: Env,
  origin: string
): Promise<Response> {
  let body: PublishBody;
  try {
    body = await request.json<PublishBody>();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }

  const { title, content, tags } = body;
  if (!title?.trim() || !content?.trim()) {
    return json({ error: "标题和内容不能为空" }, 400, origin);
  }

  const slug = buildSlug(title);

  const frontmatter: string[] = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `date: ${JSON.stringify(new Date().toISOString())}`,
  ];
  if (Array.isArray(tags) && tags.length > 0) {
    const safeTags = tags.filter((t): t is string => typeof t === "string");
    if (safeTags.length > 0) {
      frontmatter.push(
        `tags: [${safeTags.map((t) => JSON.stringify(t)).join(", ")}]`
      );
    }
  }
  frontmatter.push("---", "");

  const md = `${frontmatter.join("\n")}\n${content}\n`;
  const base64 = toBase64Utf8(md);
  const filePath = `posts/${slug}.md`;
  const apiUrl = `https://api.github.com/repos/${env.REPO}/contents/${filePath}`;
  const githubHeaders = buildGithubHeaders(env);

  // 查询 sha
  let existingSha: string | undefined;
  try {
    const checkResp = await fetch(apiUrl, { headers: githubHeaders });
    if (checkResp.status === 200) {
      existingSha = (await checkResp.json<GithubFilePayload>()).sha;
    } else if (checkResp.status !== 404) {
      const err = await checkResp
        .json<GithubErrorPayload>()
        .catch<GithubErrorPayload>(() => ({}));
      return json(
        {
          error: `GitHub 查询失败（${checkResp.status}）：${err.message || "未知"}`,
          hint: hintFromStatus(checkResp.status, env.REPO),
          docs: err.documentation_url,
        },
        checkResp.status,
        origin
      );
    }
  } catch (err) {
    return json(
      { error: "GitHub 查询请求失败", detail: String(err) },
      502,
      origin
    );
  }

  // PUT
  try {
    const putResp = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...githubHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: existingSha ? `update post: ${title}` : `add post: ${title}`,
        content: base64,
        sha: existingSha,
      }),
    });
    const data = await putResp
      .json<GithubPutPayload>()
      .catch<GithubPutPayload>(() => ({}));

    if (!putResp.ok) {
      return json(
        {
          error: `GitHub 提交失败（${putResp.status}）：${data.message || "未知"}`,
          hint: hintFromStatus(putResp.status, env.REPO),
          docs: data.documentation_url,
        },
        putResp.status,
        origin
      );
    }

    return json(
      {
        ok: true,
        slug,
        url: data.content?.html_url,
        commit: data.commit?.sha,
      },
      200,
      origin
    );
  } catch (err) {
    return json(
      { error: "GitHub 提交请求失败", detail: String(err) },
      502,
      origin
    );
  }
}

interface ListedPost {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  sha: string;
  htmlUrl?: string;
}

/** 简易解析 frontmatter（够用即可，不引入依赖） */
function parseFrontmatter(md: string): {
  title?: string;
  date?: string;
  tags?: string[];
} {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm: { title?: string; date?: string; tags?: string[] } = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();
    if (key === "tags") {
      const arr = value.match(/\[(.*)\]/);
      if (arr) {
        fm.tags = arr[1]
          .split(",")
          .map((s) => s.trim().replace(/^"(.*)"$/, "$1"))
          .filter(Boolean);
      }
    } else {
      value = value.replace(/^"(.*)"$/, "$1");
      if (key === "title") fm.title = value;
      if (key === "date") fm.date = value;
    }
  }
  return fm;
}

async function handleList(env: Env, origin: string): Promise<Response> {
  const apiUrl = `https://api.github.com/repos/${env.REPO}/contents/posts`;
  const githubHeaders = buildGithubHeaders(env);

  try {
    const resp = await fetch(apiUrl, { headers: githubHeaders });

    if (resp.status === 404) {
      // posts/ 目录还不存在
      return json({ ok: true, posts: [] }, 200, origin);
    }
    if (!resp.ok) {
      const err = await resp
        .json<GithubErrorPayload>()
        .catch<GithubErrorPayload>(() => ({}));
      return json(
        {
          error: `列表查询失败（${resp.status}）：${err.message || "未知"}`,
          hint: hintFromStatus(resp.status, env.REPO),
        },
        resp.status,
        origin
      );
    }

    const files = await resp.json<
      Array<{
        name: string;
        path: string;
        sha: string;
        type: string;
        html_url?: string;
        download_url?: string;
      }>
    >();

    const mdFiles = files.filter(
      (f) => f.type === "file" && f.name.endsWith(".md")
    );

    // 并行拉每个文件的内容来解析 frontmatter（最多 30 篇并发）
    const posts: ListedPost[] = await Promise.all(
      mdFiles.map(async (f) => {
        const slug = f.name.replace(/\.md$/, "");
        let fm: { title?: string; date?: string; tags?: string[] } = {};
        if (f.download_url) {
          try {
            const raw = await fetch(f.download_url, {
              headers: { "User-Agent": "story-blog-worker" },
            });
            if (raw.ok) {
              const text = await raw.text();
              fm = parseFrontmatter(text);
            }
          } catch {
            // ignore
          }
        }
        return {
          slug,
          title: fm.title || slug,
          date: fm.date || "",
          tags: fm.tags || [],
          sha: f.sha,
          htmlUrl: f.html_url,
        };
      })
    );

    posts.sort((a, b) => (a.date < b.date ? 1 : -1));
    return json({ ok: true, posts }, 200, origin);
  } catch (err) {
    return json(
      { error: "列表查询请求失败", detail: String(err) },
      502,
      origin
    );
  }
}

async function handleDelete(
  request: Request,
  env: Env,
  origin: string
): Promise<Response> {
  let body: DeleteBody;
  try {
    body = await request.json<DeleteBody>();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }

  const slugs = (body.slugs || []).filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0
  );
  if (slugs.length === 0) {
    return json({ error: "slugs 不能为空" }, 400, origin);
  }
  if (slugs.length > 50) {
    return json({ error: "单次最多删除 50 篇" }, 400, origin);
  }

  const githubHeaders = buildGithubHeaders(env);

  const results: DeleteResultItem[] = await Promise.all(
    slugs.map(async (slug): Promise<DeleteResultItem> => {
      const filePath = `posts/${slug}.md`;
      const apiUrl = `https://api.github.com/repos/${env.REPO}/contents/${filePath}`;

      // 先查 sha
      let sha: string | undefined;
      try {
        const checkResp = await fetch(apiUrl, { headers: githubHeaders });
        if (checkResp.status === 404) {
          return { slug, ok: false, message: "文件不存在" };
        }
        if (!checkResp.ok) {
          const err = await checkResp
            .json<GithubErrorPayload>()
            .catch<GithubErrorPayload>(() => ({}));
          return {
            slug,
            ok: false,
            message: `查询失败：${err.message || checkResp.status}`,
          };
        }
        sha = (await checkResp.json<GithubFilePayload>()).sha;
      } catch (err) {
        return { slug, ok: false, message: `查询异常：${String(err)}` };
      }

      if (!sha) {
        return { slug, ok: false, message: "未拿到 sha" };
      }

      // DELETE
      try {
        const delResp = await fetch(apiUrl, {
          method: "DELETE",
          headers: { ...githubHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `delete post: ${slug}`,
            sha,
          }),
        });
        const data = await delResp
          .json<GithubPutPayload>()
          .catch<GithubPutPayload>(() => ({}));

        if (!delResp.ok) {
          return {
            slug,
            ok: false,
            message: `删除失败（${delResp.status}）：${data.message || "未知"}`,
          };
        }
        return { slug, ok: true, commit: data.commit?.sha };
      } catch (err) {
        return { slug, ok: false, message: `删除异常：${String(err)}` };
      }
    })
  );

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  return json(
    {
      ok: failed === 0,
      total: results.length,
      succeeded,
      failed,
      results,
    },
    200,
    origin
  );
}

// ---------- News API 代理 ----------

/**
 * POST /news-proxy
 * 代理 news.likanug.top/api/s/entire，解决 GitHub Actions IP 被 Cloudflare 拦截的问题。
 * Worker 运行在 Cloudflare 网络内，可正常访问同网络的服务。
 * 此接口无需鉴权（代理的是公开数据）。
 */
async function handleNewsProxy(request: Request, origin: string): Promise<Response> {
  let body: unknown = {
    sources: [
      "hackernews",
      "github-trending-today",
      "v2ex-share",
      "juejin",
      "producthunt",
    ],
  };
  try {
    body = await request.json();
  } catch {
    // 允许空 body，使用默认 sources
  }

  try {
    const resp = await fetch('https://news.likanug.top/api/s/entire', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: 'https://news.likanug.top',
        referer: 'https://news.likanug.top/',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: {
        'content-type': resp.headers.get('content-type') || 'application/json',
        ...corsHeaders(origin),
      },
    });
  } catch (err) {
    return json({ error: 'News API proxy failed', detail: String(err) }, 502, origin);
  }
}

// ---------- News Crawl 触发 ----------

interface CrawlTriggerBody {
  workflow?: string;
  ref?: string;
  aiProvider?: "deepseek" | "glm";
  aiModel?: string;
}

/**
 * POST /crawl/trigger
 * 调用 GitHub Actions 的 workflow_dispatch 接口，触发 news-crawl workflow。
 * 请求体（可选）：
 *   { "workflow": "news-crawl.yml", "ref": "main" }
 * 需要 GITHUB_TOKEN 具备 `actions: write` 权限。
 */
async function handleCrawlTrigger(
  request: Request,
  env: Env,
  origin: string
): Promise<Response> {
  let body: CrawlTriggerBody = {};
  if (request.headers.get("content-length")) {
    try {
      body = await request.json<CrawlTriggerBody>();
    } catch {
      // 允许空 body
    }
  }

  const workflow = body.workflow?.trim() || "news-crawl.yml";
  const ref = body.ref?.trim() || "main";
  const aiProvider = body.aiProvider?.trim();
  const aiModel = body.aiModel?.trim();

  const apiUrl = `https://api.github.com/repos/${env.REPO}/actions/workflows/${encodeURIComponent(
    workflow
  )}/dispatches`;

  try {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        ...buildGithubHeaders(env),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref,
        inputs: {
          ...(aiProvider ? { ai_provider: aiProvider } : {}),
          ...(aiModel ? { ai_model: aiModel } : {}),
        },
      }),
    });

    // 204 是 GitHub 对 dispatch 成功的标准响应（无 body）
    if (resp.status === 204) {
      return json(
        {
          ok: true,
          message: `已触发 ${workflow} @ ${ref}${aiModel ? ` · ${aiModel}` : ""}`,
          actionsUrl: `https://github.com/${env.REPO}/actions/workflows/${workflow}`,
        },
        200,
        origin
      );
    }

    // 失败：把 GitHub 的错误转给前端
    const text = await resp.text();
    let payload: GithubErrorPayload = {};
    try {
      payload = JSON.parse(text);
    } catch {
      // 忽略，使用 text
    }
    return json(
      {
        ok: false,
        error: `触发失败（${resp.status}）：${payload.message || text || "未知"}`,
        hint:
          resp.status === 404
            ? `找不到 workflow 文件 ${workflow}，或 PAT 无权限访问 ${env.REPO}`
            : resp.status === 403 || resp.status === 401
            ? "GITHUB_TOKEN 没有 actions:write 权限（Fine-grained PAT 需勾选 Actions: Read and write）"
            : hintFromStatus(resp.status, env.REPO),
        docs: payload.documentation_url,
      },
      resp.status,
      origin
    );
  } catch (err) {
    return json(
      { ok: false, error: "GitHub 触发请求失败", detail: String(err) },
      502,
      origin
    );
  }
}

// ---------- Worker 入口 ----------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = pickOrigin(request, env);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // 健康检查
    if (method === "GET" && path === "/") {
      return json(
        {
          ok: true,
          service: "story-blog-publisher",
          time: new Date().toISOString(),
        },
        200,
        origin
      );
    }

    // news-proxy：无需鉴权（代理公开数据，Worker 网络内可访问）
    if (method === "POST" && path === "/news-proxy") {
      return handleNewsProxy(request, origin);
    }

    // 以下接口都需要认证
    const authError = authGuard(request, env, origin);
    if (authError) return authError;

    if (method === "POST" && path === "/") {
      return handlePublish(request, env, origin);
    }

    if (method === "GET" && path === "/list") {
      return handleList(env, origin);
    }

    if (method === "POST" && path === "/delete") {
      return handleDelete(request, env, origin);
    }

    if (method === "POST" && path === "/crawl/trigger") {
      return handleCrawlTrigger(request, env, origin);
    }

    return json(
      {
        error: "Not Found",
        hint: "支持的路由：POST /、GET /list、POST /delete、POST /crawl/trigger、POST /news-proxy",
      },
      404,
      origin
    );
  },
} satisfies ExportedHandler<Env>;

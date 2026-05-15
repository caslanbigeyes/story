import type { NextApiRequest, NextApiResponse } from "next";

/**
 * POST /api/publish/crawl/trigger
 *
 * 触发 GitHub Actions 上的 News Crawl workflow（与 Worker 的同名路由等价）。
 *
 * 请求头：
 *   Authorization: Bearer <PUBLISH_TOKEN>
 * 请求体（可选）：
 *   { workflow?: "news-crawl.yml", ref?: "main" }
 *
 * 需要的环境变量（.env.local）：
 *   PUBLISH_TOKEN  后台口令
 *   GITHUB_TOKEN   GitHub PAT（需 Actions: Read and write）
 *   REPO           owner/repo
 */

interface TriggerBody {
  workflow?: string;
  ref?: string;
  aiProvider?: "deepseek" | "glm";
  aiModel?: string;
}

interface GithubErrorPayload {
  message?: string;
  documentation_url?: string;
}

function hintFromStatus(status: number, repo: string): string | undefined {
  if (status === 401) return "GITHUB_TOKEN 无效或过期";
  if (status === 403)
    return "GITHUB_TOKEN 没有 actions:write 权限（Classic PAT 勾选 workflow scope，Fine-grained PAT 勾选 Actions: Read and write）";
  if (status === 404)
    return `找不到 workflow 文件，或 PAT 无权限访问 ${repo}（确认 .github/workflows/news-crawl.yml 已 push 到默认分支）`;
  if (status === 422) return "ref 不存在或不可触发";
  return undefined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expectedToken = process.env.PUBLISH_TOKEN;
  const githubToken = process.env.GITHUB_TOKEN;
  const repo = process.env.REPO;

  if (!expectedToken || !githubToken || !repo) {
    return res.status(500).json({
      error: "服务端未配置 PUBLISH_TOKEN / GITHUB_TOKEN / REPO",
      hint: "本地：在 .env.local 配齐；Vercel：在 Project Settings → Environment Variables 配齐并重新部署",
    });
  }

  if (req.headers.authorization !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body || {}) as TriggerBody;
  const workflow = body.workflow?.trim() || "news-crawl.yml";
  const ref = body.ref?.trim() || "main";
  const aiProvider = body.aiProvider?.trim();
  const aiModel = body.aiModel?.trim();

  const apiUrl = `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(
    workflow
  )}/dispatches`;

  try {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "story-blog-next-api",
        "X-GitHub-Api-Version": "2022-11-28",
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

    // GitHub 对 dispatch 成功返回 204 No Content
    if (resp.status === 204) {
      return res.status(200).json({
        ok: true,
        message: `已触发 ${workflow} @ ${ref}${aiModel ? ` · ${aiModel}` : ""}`,
        actionsUrl: `https://github.com/${repo}/actions/workflows/${workflow}`,
      });
    }

    const text = await resp.text();
    let payload: GithubErrorPayload = {};
    try {
      payload = JSON.parse(text);
    } catch {
      // 忽略
    }
    return res.status(resp.status).json({
      ok: false,
      error: `触发失败（${resp.status}）：${payload.message || text || "未知"}`,
      hint: hintFromStatus(resp.status, repo),
      docs: payload.documentation_url,
    });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: "GitHub 触发请求失败",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

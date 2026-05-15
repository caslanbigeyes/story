import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";

type Status = "idle" | "publishing" | "success" | "error";
type Mode = "compose" | "manage" | "news";
type NewsModelProvider = "deepseek" | "glm";

interface NewsModelOption {
  provider: NewsModelProvider;
  value: string;
  label: string;
  description: string;
}

interface ManagedPost {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  sha: string;
  htmlUrl?: string;
}

interface DeleteResultItem {
  slug: string;
  ok: boolean;
  message?: string;
}

const TOKEN_STORAGE_KEY = "story_publish_token";
const NEWS_MODEL_STORAGE_KEY = "story_news_model";

const NEWS_MODEL_OPTIONS: NewsModelOption[] = [
  {
    provider: "deepseek",
    value: "deepseek-v4-flash",
    label: "deepseek-v4-flash",
    description: "DeepSeek · 速度优先",
  },
  {
    provider: "deepseek",
    value: "deepseek-v4-pro",
    label: "deepseek-v4-pro",
    description: "DeepSeek · 效果优先",
  },
  {
    provider: "glm",
    value: "glm-4-flash",
    label: "GLM-4-Flash (免费)",
    description: "GLM · 低成本快速",
  },
  {
    provider: "glm",
    value: "glm-4-long",
    label: "GLM-4-Long (超长文本)",
    description: "GLM · 长上下文",
  },
];

function getEndpoint(): string {
  return process.env.NEXT_PUBLIC_PUBLISH_ENDPOINT || "/api/publish";
}

/** 把 base endpoint 和路径拼接：考虑结尾斜杠 */
function joinEndpoint(base: string, suffix: string): string {
  if (!base) return suffix;
  const cleanBase = base.replace(/\/+$/, "");
  // 如果 base 是 Next.js 自带 /api/publish，则只支持发布；list/delete 走 worker 才有意义
  // 这里直接返回 base + suffix，假设用户配置的是 worker 根 URL
  return `${cleanBase}${suffix}`;
}

export default function Admin() {
  const [mode, setMode] = useState<Mode>("compose");
  const [token, setToken] = useState("");
  const [newsModel, setNewsModel] = useState<string>("deepseek-v4-flash");

  // 写作态
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  // 管理态
  const [posts, setPosts] = useState<ManagedPost[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");

  // News Crawl 试运行态
  const [triggering, setTriggering] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState("");
  const [triggerStatus, setTriggerStatus] = useState<Status>("idle");

  const endpoint = getEndpoint();

  // token 持久化（方便切 tab 不丢）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (saved) setToken(saved);
    const savedModel = window.localStorage.getItem(NEWS_MODEL_STORAGE_KEY);
    if (
      savedModel &&
      NEWS_MODEL_OPTIONS.some((option) => option.value === savedModel)
    ) {
      setNewsModel(savedModel);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(NEWS_MODEL_STORAGE_KEY, newsModel);
  }, [newsModel]);

  const selectedNewsModel = useMemo(
    () =>
      NEWS_MODEL_OPTIONS.find((option) => option.value === newsModel) ||
      NEWS_MODEL_OPTIONS[0],
    [newsModel]
  );

  const allSelected = useMemo(
    () => posts.length > 0 && selected.size === posts.length,
    [posts, selected]
  );

  // ---------- 写作 ----------

  const publish = async () => {
    if (!title.trim() || !content.trim()) {
      setStatus("error");
      setMessage("标题和内容不能为空");
      return;
    }
    if (!token.trim()) {
      setStatus("error");
      setMessage("请输入发布 Token");
      return;
    }

    setStatus("publishing");
    setMessage("正在发布到 GitHub...");

    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          content,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const parts = [data.error || `发布失败（${resp.status}）`];
        if (data.hint) parts.push(`提示：${data.hint}`);
        if (data.docs) parts.push(`文档：${data.docs}`);
        throw new Error(parts.join("\n"));
      }

      setStatus("success");
      const successParts = [`✓ 发布成功：${data.slug}`];
      if (data.localSynced) {
        successParts.push("本地已同步，返回首页即可看到 ✨");
      } else {
        successParts.push("已提交到 GitHub，等待部署完成后上线");
      }
      if (data.url) {
        successParts.push(`GitHub: ${data.url}`);
      }
      setMessage(successParts.join("\n"));
      setTitle("");
      setTags("");
      setContent("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "发布失败");
    }
  };

  // ---------- 管理 ----------

  const loadList = useCallback(async () => {
    if (!token.trim()) {
      setListError("请先输入 Token 才能加载文章列表");
      return;
    }
    setLoadingList(true);
    setListError("");
    setDeleteMessage("");
    try {
      const url = joinEndpoint(endpoint, "/list");
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `加载失败（${resp.status}）`);
      }
      setPosts(Array.isArray(data.posts) ? data.posts : []);
      setSelected(new Set());
    } catch (err) {
      setListError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoadingList(false);
    }
  }, [endpoint, token]);

  // 进入管理 tab 时自动加载
  useEffect(() => {
    if (mode === "manage" && posts.length === 0 && !loadingList && !listError) {
      void loadList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const toggleOne = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === posts.length ? new Set() : new Set(posts.map((p) => p.slug))
    );
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!token.trim()) {
      setDeleteMessage("请输入 Token");
      return;
    }
    const slugs = Array.from(selected);
    const confirmed = window.confirm(
      `确认删除以下 ${slugs.length} 篇文章？此操作会直接 commit 到 GitHub，不可撤销：\n\n${slugs
        .slice(0, 10)
        .map((s) => `· ${s}`)
        .join("\n")}${slugs.length > 10 ? `\n...等共 ${slugs.length} 篇` : ""}`
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteMessage("正在删除...");

    try {
      const url = joinEndpoint(endpoint, "/delete");
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slugs }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `删除失败（${resp.status}）`);
      }

      const failed: DeleteResultItem[] = (data.results || []).filter(
        (r: DeleteResultItem) => !r.ok
      );
      const lines = [
        `✓ 完成：成功 ${data.succeeded} 篇 / 失败 ${data.failed} 篇`,
      ];
      if (failed.length > 0) {
        lines.push("失败详情：");
        failed.forEach((f) => lines.push(`· ${f.slug} → ${f.message}`));
      }
      setDeleteMessage(lines.join("\n"));

      // 重新加载列表
      await loadList();
    } catch (err) {
      setDeleteMessage(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  // ---------- News Crawl 试运行 ----------

  const triggerCrawl = async () => {
    if (!token.trim()) {
      setTriggerStatus("error");
      setTriggerMessage("请先输入 Token");
      return;
    }
    setTriggering(true);
    setTriggerStatus("publishing");
    setTriggerMessage("正在请求 GitHub Actions 触发 workflow...");
    try {
      const url = joinEndpoint(endpoint, "/crawl/trigger");
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          aiProvider: selectedNewsModel.provider,
          aiModel: selectedNewsModel.value,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) {
        const parts = [data.error || `触发失败（${resp.status}）`];
        if (data.hint) parts.push(`提示：${data.hint}`);
        if (data.docs) parts.push(`文档：${data.docs}`);
        throw new Error(parts.join("\n"));
      }
      setTriggerStatus("success");
      const lines = [
        `✓ ${data.message || "已触发"}`,
        `本次模型：${selectedNewsModel.label}`,
        "GitHub Actions 已开始排队，约 10~20 秒后开始执行。",
      ];
      if (data.actionsUrl) {
        lines.push(`运行详情：${data.actionsUrl}`);
      }
      setTriggerMessage(lines.join("\n"));
    } catch (err) {
      setTriggerStatus("error");
      setTriggerMessage(err instanceof Error ? err.message : "触发失败");
    } finally {
      setTriggering(false);
    }
  };

  // ---------- 渲染 ----------

  return (
    <>
      <Head>
        <title>后台 · My Blog</title>
      </Head>

      <section className="space-y-6">
        <header className="border-b border-gray-200 pb-6">
          <h1 className="text-3xl font-bold tracking-tight">后台</h1>
          <p className="text-sm text-gray-500 mt-2">
            写作发布到 GitHub，或管理已有文章
          </p>
        </header>

        {/* Tab 切换 */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-full w-fit">
          {(
            [
              { key: "compose", label: "写作" },
              { key: "manage", label: "管理" },
              { key: "news", label: "资讯爬虫" },
            ] as Array<{ key: Mode; label: string }>
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMode(t.key)}
              className={`px-5 py-1.5 text-sm rounded-full transition-colors ${
                mode === t.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Token 输入区（共用） */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Token（一次输入，本地缓存）
          </label>
          <input
            type="password"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="后台口令（PUBLISH_TOKEN）"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>

        {mode === "news" ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
            <div>
              <label className="block text-sm font-medium mb-1">
                资讯爬虫模型
              </label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newsModel}
                onChange={(e) => setNewsModel(e.target.value)}
              >
                <optgroup label="DeepSeek">
                  {NEWS_MODEL_OPTIONS.filter(
                    (option) => option.provider === "deepseek"
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="GLM">
                  {NEWS_MODEL_OPTIONS.filter(
                    (option) => option.provider === "glm"
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-6 text-gray-600">
              <div className="font-medium text-gray-900">
                当前：{selectedNewsModel.label}
              </div>
              <div>{selectedNewsModel.description}</div>
              <div className="mt-1">
                手动试运行会把模型选择传给 GitHub Actions；定时任务仍按仓库默认配置执行。
              </div>
            </div>
          </div>
        ) : null}

        {/* —— 写作面板 —— */}
        {mode === "compose" ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">标题</label>
              <input
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="文章标题"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                标签（逗号分隔，可选）
              </label>
              <input
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="tech, life, note"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                正文（Markdown）
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={20}
                placeholder={
                  "# 标题\n\n正文，可插入代码块：\n\n```ts\nconst x = 1;\n```\n"
                }
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={publish}
              disabled={status === "publishing"}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {status === "publishing" ? "发布中..." : "发布"}
            </button>

            {message ? (
              <div
                className={`p-3 rounded-md text-sm whitespace-pre-wrap ${
                  status === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : status === "error"
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                }`}
              >
                {message}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* —— 管理面板 —— */}
        {mode === "manage" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={loadList}
                  disabled={loadingList}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 transition"
                >
                  {loadingList ? "加载中..." : "刷新"}
                </button>
                {posts.length > 0 ? (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition"
                  >
                    {allSelected ? "取消全选" : "全选"}
                  </button>
                ) : null}
                <span className="text-xs text-gray-500">
                  {posts.length > 0
                    ? `共 ${posts.length} 篇 · 已选 ${selected.size}`
                    : null}
                </span>
              </div>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || selected.size === 0}
                className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {deleting ? "删除中..." : `删除选中（${selected.size}）`}
              </button>
            </div>

            {listError ? (
              <div className="p-3 rounded-md text-sm bg-red-50 text-red-700 border border-red-200">
                {listError}
              </div>
            ) : null}

            {deleteMessage ? (
              <div className="p-3 rounded-md text-sm whitespace-pre-wrap bg-blue-50 text-blue-700 border border-blue-200">
                {deleteMessage}
              </div>
            ) : null}

            {!loadingList && posts.length === 0 && !listError ? (
              <div className="py-12 text-center text-sm text-gray-400">
                暂无文章
              </div>
            ) : null}

            {posts.length > 0 ? (
              <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
                {posts.map((p) => {
                  const isChecked = selected.has(p.slug);
                  return (
                    <li
                      key={p.slug}
                      className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                        isChecked ? "bg-blue-50/50" : "hover:bg-gray-50"
                      }`}
                    >
                      <label className="flex items-center pt-0.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(p.slug)}
                          className="w-4 h-4 accent-blue-600 cursor-pointer"
                        />
                      </label>

                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {p.title || p.slug}
                        </div>
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                          <span className="font-mono">{p.slug}</span>
                          {p.date ? (
                            <>
                              <span className="w-1 h-1 rounded-full bg-gray-300" />
                              <time>
                                {new Date(p.date).toLocaleDateString("zh-CN")}
                              </time>
                            </>
                          ) : null}
                          {p.tags.length > 0 ? (
                            <>
                              <span className="w-1 h-1 rounded-full bg-gray-300" />
                              <span className="flex items-center gap-1">
                                {p.tags.map((t) => (
                                  <span
                                    key={t}
                                    className="bg-gray-100 px-1.5 py-0.5 rounded"
                                  >
                                    #{t}
                                  </span>
                                ))}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <a
                          href={`/posts/${p.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-500 hover:text-gray-900"
                        >
                          查看
                        </a>
                        {p.htmlUrl ? (
                          <a
                            href={p.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-gray-500 hover:text-gray-900"
                          >
                            源文件
                          </a>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className="text-xs text-gray-400">
              注：管理功能需要 Cloudflare Worker 后端，请确保
              <code className="mx-1 px-1 bg-gray-100 rounded">
                NEXT_PUBLIC_PUBLISH_ENDPOINT
              </code>
              已配置为 Worker URL（不是 /api/publish）
            </div>
          </div>
        ) : null}

        {/* —— 资讯爬虫面板 —— */}
        {mode === "news" ? (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-2">
              <div className="font-medium text-gray-900">News Crawl · 每 8 小时一次</div>
              <p>
                自动抓取 <code className="px-1 bg-white border border-gray-200 rounded">Hacker News</code> /{" "}
                <code className="px-1 bg-white border border-gray-200 rounded">GitHub Trending</code> /{" "}
                <code className="px-1 bg-white border border-gray-200 rounded">V2EX 分享创造</code>，
                对每条链接调用大模型生成 AI 总结，最后通过本 Worker 提交到{" "}
                <code className="px-1 bg-white border border-gray-200 rounded">posts/</code>。
              </p>
              <p className="text-xs text-gray-500">
                workflow 文件：
                <code className="mx-1 px-1 bg-white border border-gray-200 rounded">
                  .github/workflows/news-crawl.yml
                </code>
                · 调度：
                <code className="mx-1 px-1 bg-white border border-gray-200 rounded">
                  cron 0 * * * *
                </code>
                · 失败会自动 sleep 30min 重试一次
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={triggerCrawl}
                disabled={triggering}
                className="px-5 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {triggering ? "触发中..." : "▶ 试运行一次"}
              </button>

              <a
                href={`https://github.com/${
                  process.env.NEXT_PUBLIC_GISCUS_REPO || "caslanbigeyes/story"
                }/actions/workflows/news-crawl.yml`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition"
              >
                打开 Actions 运行日志 ↗
              </a>
            </div>

            {triggerMessage ? (
              <div
                className={`p-3 rounded-md text-sm whitespace-pre-wrap ${
                  triggerStatus === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : triggerStatus === "error"
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                }`}
              >
                {triggerMessage}
              </div>
            ) : null}

            <div className="text-xs text-gray-400 leading-relaxed">
              · 触发成功只代表 GitHub 已收到指令，真正的运行需要约 10 ~ 20 秒后才会出现在 Actions 列表里
              <br />· 需要 Worker 端 <code className="px-1 bg-gray-100 rounded">GITHUB_TOKEN</code> 拥有
              <code className="mx-1 px-1 bg-gray-100 rounded">actions: write</code> 权限
              <br />· 仓库 Secrets 还需配
              <code className="mx-1 px-1 bg-gray-100 rounded">DEEPSEEK_API_KEY</code> /
              <code className="mx-1 px-1 bg-gray-100 rounded">GLM_API_KEY</code> /
              <code className="mx-1 px-1 bg-gray-100 rounded">PUBLISH_ENDPOINT</code> /
              <code className="mx-1 px-1 bg-gray-100 rounded">PUBLISH_TOKEN</code>
              <br />· 定时任务默认模型可通过仓库 Variable
              <code className="mx-1 px-1 bg-gray-100 rounded">NEWS_AI_PROVIDER</code> /
              <code className="mx-1 px-1 bg-gray-100 rounded">NEWS_AI_MODEL</code>
              调整
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}

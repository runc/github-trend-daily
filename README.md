# GitHub Trending Daily RAG

一个基于 GitHub Trending 的 AI 知识库。pnpm monorepo:每日抓取 trending,通过 MCP 调 DeepWiki 取仓库上下文,再用 LLM (默认 DeepSeek,OpenAI 兼容) 生成中文摘要 / 标签 / 分类,最后构建为带全文搜索的静态站。

## 技术栈

- **Astro + Tailwind + Pagefind** — 静态站；卡片级 **关键词全文 + ternlight 向量检索**，浏览器端 RRF 融合
- **`@ternlight/base`** — 端上 WASM embedding（~7MB），无需 API
- **`@modelcontextprotocol/sdk`** — 直连 `mcp.deepwiki.com`,取每个仓库的 wiki 概览
- **Vercel AI SDK (`ai` + `@ai-sdk/openai`)** — OpenAI 兼容模式,默认指向 DeepSeek
- **pnpm workspace** — 多包管理,共享类型
- **GitHub Actions** — 每日 UTC 04:00 / 16:00 触发,采集 → 提交数据 → 构建部署

## 目录结构

```
apps/
  web/                          # Astro 站点
    src/
      components/               # RepoCard, Filter
      data/                     # 采集产物 (snapshot JSON + index.json)
      layouts/, pages/, styles/
packages/
  shared/                       # 共享类型 (TrendingRepo / EnrichedRepo / ...)
  collector/                    # 抓取 + DeepWiki + LLM 增强
    src/
      fetch-trending.ts         # 抓 trending,写原始 snapshot
      deepwiki.ts               # MCP client → mcp.deepwiki.com
      enrich.ts                 # AI SDK 调 LLM,输出 summary/tags/category
      enrich-snapshots.ts       # 对存量 snapshot 跑增强
      index.ts                  # 主编排: fetch → enrich → 写 EnrichedSnapshot
.github/workflows/
  fetch-and-deploy.yml
pnpm-workspace.yaml
tsconfig.base.json
```

## 本地开发

需要 Node ≥ 20、pnpm 9。

```bash
pnpm install
cp .env.example .env          # 填 OPENAI_API_KEY (DeepSeek 或其他 OpenAI 兼容服务)

pnpm fetch                    # 抓取 + DeepWiki + LLM 增强,写入 apps/web/src/data
pnpm dev                      # 启动 web 开发服务器
pnpm build                    # 构建 + 生成 Pagefind 索引
pnpm preview                  # 预览构建产物
```

只想跑某一步:

```bash
pnpm fetch:trending           # 只抓 trending(无 LLM)
pnpm fetch:enrich             # 对已有 snapshot 补跑增强
```

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `TREND_SINCE` | 周期 | `daily,weekly,monthly` |
| `TREND_LANGUAGES` | 语言列表(逗号分隔,空表示全语言) | (CI 内置常见 6 个) |
| `TREND_SPOKEN_LANGUAGES` | 自然语言过滤 | 空 |
| `OPENAI_BASE_URL` | OpenAI 兼容 baseURL | `https://api.deepseek.com` |
| `OPENAI_API_KEY` | API key | (必填,否则跳过 LLM) |
| `OPENAI_MODEL` | 模型名 | `deepseek-chat` |
| `SUMMARY_LANG` | 摘要输出语言 | `中文` |
| `DEEPWIKI_MCP_URL` | DeepWiki MCP 端点 | `https://mcp.deepwiki.com/sse` |
| `ENRICH_CONCURRENCY` | LLM 并发数 | `4` |
| `ENRICH_LIMIT_PER_SNAPSHOT` | 每快照最多增强多少个 repo | `25` |

## CI/CD

`.github/workflows/fetch-and-deploy.yml`:

1. UTC 04:00 / 16:00 自动触发(也支持 `workflow_dispatch` 手动)
2. `pnpm install` → `pnpm fetch` → 把 `apps/web/src/data/` 提交回主分支
3. 重新 checkout → `pnpm build` → 部署到 GitHub Pages

需要在仓库 Settings → Pages → Source 选 **GitHub Actions**。
另外在 Secrets 里配置:

- `OPENAI_API_KEY` — DeepSeek / OpenAI 的 key(必填才能跑 LLM)
- `OPENAI_BASE_URL` — 可选,默认 DeepSeek
- `OPENAI_MODEL` — 可选,默认 `deepseek-chat`
- `DEEPWIKI_MCP_URL` — 可选,默认官方端点

## 备注

- DeepWiki MCP 对公开仓库免费、无需认证;私有仓库或未收录仓库会自动 fallback 到 description。
- 抓取脚本走的是公开的 github-trending 镜像 API,如不稳定可自行替换为本地爬 `github.com/trending` 的逻辑。
- `apps/web/astro.config.mjs` 里 `site` / `base` 按实际域名和仓库路径改。
- Pagefind 索引在 `pnpm build` 末尾自动生成,搜索框由 `index.astro` 里的 `#search` 挂载。

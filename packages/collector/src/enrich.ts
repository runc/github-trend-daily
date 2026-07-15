import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { EnrichedRepo, TrendingRepo } from '@github-trend-daily/shared';
import { getRepoSummary } from './deepwiki.ts';

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'deepseek-chat';

const SUMMARY_LANG = process.env.SUMMARY_LANG || '中文';

const schema = z.object({
  summary: z.string().min(20).max(200),
  tags: z.array(z.string()).min(2).max(6),
  category: z.string().min(1).max(20),
});

let clientCache: ReturnType<typeof createOpenAI> | null = null;
function llmClient() {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for enrichment');
  if (!clientCache) clientCache = createOpenAI({ baseURL: OPENAI_BASE_URL, apiKey: OPENAI_API_KEY });
  return clientCache;
}

function systemPrompt(): string {
  return [
    'You are an analyst who writes concise repo digests for a GitHub trending aggregator.',
    `Write the summary in ${SUMMARY_LANG}.`,
    'summary: 40-100 chars, plain text, what the project is + core value, no fluff, no markdown.',
    'tags: 3-6 lowercase short tags (English), no # prefix.',
    'category: one short label, e.g. CLI / DevTool / AI / Data / Web / Infra / Library / App.',
    'Return JSON only.',
  ].join(' ');
}

function userPrompt(repo: TrendingRepo, deepwikiOverview: string): string {
  return [
    `Repo: ${repo.fullName}`,
    repo.description ? `Description: ${repo.description}` : 'Description: (none)',
    repo.language ? `Primary language: ${repo.language}` : '',
    repo.topics.length ? `Topics: ${repo.topics.join(', ')}` : '',
    `Stars: ${repo.stars}, forks: ${repo.forks}, +${repo.starsToday} today.`,
    deepwikiOverview ? `\nDeepWiki context:\n${deepwikiOverview}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function enrichRepo(repo: TrendingRepo): Promise<EnrichedRepo> {
  const dw = await getRepoSummary(repo.fullName);

  let summary = '';
  let tags: string[] = [];
  let category = 'Unknown';

  if (!OPENAI_API_KEY) {
    console.warn(`[enrich] OPENAI_API_KEY unset — skipping LLM for ${repo.fullName}`);
    summary = repo.description || `${repo.fullName} — see repo.`;
    tags = (repo.topics.length ? repo.topics : [repo.language].filter(Boolean) as string[]).slice(0, 4);
    category = repo.language ? guessCategoryFromLang(repo.language) : 'Unknown';
  } else {
    try {
      const { object } = await generateObject({
        model: llmClient()(OPENAI_MODEL),
        schema,
        system: systemPrompt(),
        prompt: userPrompt(repo, dw.overview),
        temperature: 0.4,
        maxRetries: 2,
      });
      summary = object.summary;
      tags = object.tags;
      category = object.category;
    } catch (err) {
      console.warn(`[enrich] LLM failed for ${repo.fullName}: ${(err as Error).message}`);
      summary = repo.description || `${repo.fullName}.`;
      tags = (repo.topics.length ? repo.topics : [repo.language].filter(Boolean) as string[]).slice(0, 4);
      category = guessCategoryFromLang(repo.language || '');
    }
  }

  return {
    ...repo,
    summary,
    tags: Array.from(new Set([...tags.map(t => t.toLowerCase()), ...(repo.topics || [])])).slice(0, 6),
    category,
    enrichedAt: new Date().toISOString(),
    deepwikiAvailable: dw.available,
  };
}

function guessCategoryFromLang(lang: string): string {
  switch (lang.toLowerCase()) {
    case 'typescript':
    case 'javascript':
      return 'Web';
    case 'python':
      return 'AI';
    case 'go':
    case 'rust':
      return 'Infra';
    case 'shell':
      return 'CLI';
    default:
      return lang || 'Unknown';
  }
}

export async function enrichRepos(
  repos: TrendingRepo[],
  concurrency = Number(process.env.ENRICH_CONCURRENCY || 4),
): Promise<EnrichedRepo[]> {
  const out: EnrichedRepo[] = new Array(repos.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, repos.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= repos.length) break;
      out[i] = await enrichRepo(repos[i]);
      console.log(`[enrich] ${i + 1}/${repos.length} ${repos[i].fullName}`);
    }
  });
  await Promise.all(workers);
  return out;
}

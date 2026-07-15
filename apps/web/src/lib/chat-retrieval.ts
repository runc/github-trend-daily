import {
  embedCorpus,
  hybridSearch,
  loadEmbeddingEngine,
  type SearchDoc,
} from './hybrid-search';

export interface RetrievedRepo {
  id: string;
  fullName: string;
  summary: string;
  description: string;
  tags: string[];
  category: string;
  language: string | null;
  url: string;
  score: number;
}

function textOf(card: HTMLElement): string {
  return (card.dataset.embedText || (card.textContent || '').replace(/\s+/g, ' ').trim());
}

function field(card: HTMLElement, name: string): string {
  const raw = card.getAttribute(`data-field-${name}`);
  return (raw || '').trim();
}

/**
 * Collect currently-visible repo cards, embed them, and return top-K
 * most relevant to `query` using the existing hybrid (keyword+vector) search.
 *
 * For chat we intentionally lower the vector similarity floor — Chinese↔English
 * cross-lingual matches (e.g. "视频编辑器" vs "video editor") produce modest
 * cosine scores, but their relative ranking is still signal. We fuse via RRF
 * and trust the relative order rather than absolute threshold.
 */
export async function retrieveRepos(
  query: string,
  opts: { topK?: number; cardSelector?: string; listSelector?: string; minVectorSim?: number } = {},
): Promise<RetrievedRepo[]> {
  const topK = opts.topK ?? 5;
  const list = document.querySelector<HTMLElement>(opts.listSelector ?? '#repo-list');
  if (!list) return [];

  const selector = opts.cardSelector ?? 'article[data-repo-id]';
  const cards = Array.from(list.querySelectorAll<HTMLElement>(selector)).filter(
    c => !c.classList.contains('hidden'),
  );
  if (cards.length === 0) return [];

  const docs: SearchDoc[] = cards.map(c => ({
    id: c.dataset.repoId || c.dataset.searchId || '',
    text: textOf(c),
  }));

  let vectors: Float32Array[] | null = null;
  try {
    await loadEmbeddingEngine();
    vectors = embedCorpus(docs);
  } catch {
    // keyword-only fallback
  }

  const fused = hybridSearch(query, docs, vectors, {
    topK,
    minVectorSim: opts.minVectorSim ?? 0.12,
  });

  const byId = new Map(cards.map(c => [c.dataset.repoId || '', c] as const));
  return fused
    .map(hit => {
      const card = byId.get(hit.id);
      if (!card) return null;
      const repo: RetrievedRepo = {
        id: hit.id,
        fullName: hit.id,
        summary: field(card, 'summary'),
        description: field(card, 'description'),
        tags: (field(card, 'tags') || '').split(',').map(s => s.trim()).filter(Boolean),
        category: field(card, 'category'),
        language: field(card, 'language') || null,
        url: card.querySelector('a[href]')?.getAttribute('href') || '',
        score: hit.score,
      };
      return repo;
    })
    .filter((r): r is RetrievedRepo => r !== null)
    .slice(0, topK);
}

export function buildContextString(repos: RetrievedRepo[]): string {
  if (repos.length === 0) return '(no relevant repos retrieved)';
  return repos
    .map((r, i) => {
      const bits = [
        `[${i + 1}] ${r.fullName}`,
        r.summary && `摘要: ${r.summary}`,
        r.description && r.description !== r.summary && `描述: ${r.description}`,
        r.category && `分类: ${r.category}`,
        r.language && `语言: ${r.language}`,
        r.tags.length > 0 && `标签: ${r.tags.join(', ')}`,
        r.url && `链接: ${r.url}`,
      ].filter(Boolean);
      return bits.join('\n    ');
    })
    .join('\n\n');
}

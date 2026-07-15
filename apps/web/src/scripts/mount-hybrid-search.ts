import {
  embedCorpus,
  hybridSearch,
  loadEmbeddingEngine,
  type SearchDoc,
} from '../lib/hybrid-search';

export interface MountHybridSearchOptions {
  mountSelector?: string;
  listSelector?: string;
  cardSelector?: string;
  noMatchSelector?: string;
  placeholder?: string;
  /** Extra predicate: return false to force-hide a card (e.g. category filter). */
  isEligible?: (card: HTMLElement) => boolean;
  onReady?: (status: 'keyword-only' | 'hybrid') => void;
}

function collectDocs(cards: HTMLElement[]): SearchDoc[] {
  return cards.map(card => {
    const id = card.dataset.searchId || card.dataset.repoId || '';
    const text = card.dataset.embedText || (card.textContent || '').replace(/\s+/g, ' ').trim();
    return { id, text };
  });
}

function applyOrder(
  list: HTMLElement,
  cards: HTMLElement[],
  orderedIds: string[],
  eligible: (card: HTMLElement) => boolean,
  noMatch: HTMLElement | null,
): void {
  const byId = new Map(cards.map(c => [c.dataset.searchId || c.dataset.repoId || '', c]));
  const hit = new Set(orderedIds);
  let visible = 0;

  for (const id of orderedIds) {
    const card = byId.get(id);
    if (!card || !eligible(card)) continue;
    card.classList.remove('hidden');
    list.appendChild(card);
    visible++;
  }

  for (const card of cards) {
    const id = card.dataset.searchId || card.dataset.repoId || '';
    if (!hit.has(id) || !eligible(card)) {
      card.classList.add('hidden');
    }
  }

  if (noMatch) noMatch.classList.toggle('hidden', visible !== 0);
}

/**
 * Mount a hybrid (keyword FTS + ternlight vector + RRF) search box.
 * Lazy-loads the WASM engine on first focus / first non-empty query.
 */
export function mountHybridSearch(opts: MountHybridSearchOptions = {}): void {
  const mount = document.querySelector(opts.mountSelector ?? '#search');
  const list = document.querySelector(opts.listSelector ?? '#repo-list');
  const noMatch = document.querySelector(opts.noMatchSelector ?? '#no-match');
  if (!mount || !list) return;

  const cardSelector = opts.cardSelector ?? '[data-search-id], [data-repo-id]';
  const cards = Array.from(list.querySelectorAll<HTMLElement>(cardSelector));
  if (cards.length === 0) return;

  const originalOrder = cards.map(c => c.dataset.searchId || c.dataset.repoId || '');
  const docs = collectDocs(cards);
  let vectors: Float32Array[] | null = null;
  let engineStatus: 'pending' | 'ready' | 'failed' = 'pending';

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = opts.placeholder ?? 'Search (keyword + semantic)…';
  input.className =
    'w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-label', 'Hybrid search');

  const hint = document.createElement('p');
  hint.className = 'mt-1.5 text-[11px] text-slate-400 dark:text-slate-500';
  hint.textContent = 'Keyword + on-device semantic search (RRF)';

  mount.replaceChildren(input, hint);

  const eligible = opts.isEligible ?? (() => true);
  const listEl = list as HTMLElement;
  const noMatchEl = noMatch as HTMLElement | null;

  async function ensureVectors(): Promise<void> {
    if (vectors || engineStatus === 'failed') return;
    try {
      hint.textContent = 'Loading embedding model…';
      await loadEmbeddingEngine();
      vectors = embedCorpus(docs);
      engineStatus = 'ready';
      hint.textContent = 'Keyword + on-device semantic search (RRF)';
      opts.onReady?.('hybrid');
    } catch (err) {
      console.warn('[hybrid-search] vector engine unavailable, keyword-only', err);
      engineStatus = 'failed';
      vectors = null;
      hint.textContent = 'Keyword search (semantic model unavailable)';
      opts.onReady?.('keyword-only');
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  async function runSearch(): Promise<void> {
    const q = input.value.trim();
    const my = ++seq;

    if (!q) {
      applyOrder(listEl, cards, originalOrder, eligible, noMatchEl);
      return;
    }

    if (engineStatus === 'pending') await ensureVectors();
    if (my !== seq) return;

    const fused = hybridSearch(q, docs, vectors, { minVectorSim: 0.22 });
    if (my !== seq) return;

    applyOrder(listEl, cards, fused.map(x => x.id), eligible, noMatchEl);
  }

  input.addEventListener('focus', () => {
    void ensureVectors();
  }, { once: true });

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void runSearch();
    }, 120);
  });

  // Expose for category filters etc. to re-apply after external filter changes.
  (window as unknown as { __hybridResearch?: () => void }).__hybridResearch = () => {
    void runSearch();
  };
}

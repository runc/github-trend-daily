import { reciprocalRankFusion } from './rrf';

export interface SearchDoc {
  id: string;
  text: string;
}

export interface HybridSearchOptions {
  /** Max docs kept after fusion when query is non-empty. Default: all with score. */
  topK?: number;
  rrfK?: number;
  /** Minimum cosine similarity to include a vector hit in its rank list. */
  minVectorSim?: number;
}

type EmbedFn = (text: string) => Float32Array;
type CosineFn = (a: Float32Array, b: Float32Array) => number;

let embedFn: EmbedFn | null = null;
let cosineFn: CosineFn | null = null;
let enginePromise: Promise<void> | null = null;

export function loadEmbeddingEngine(): Promise<void> {
  if (embedFn && cosineFn) return Promise.resolve();
  if (!enginePromise) {
    enginePromise = import('@ternlight/base').then(m => {
      embedFn = m.embed;
      cosineFn = m.cosineSim;
    });
  }
  return enginePromise;
}

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s/_.\-:,;|]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

/** Keyword / full-text style ranking over doc text (client-side FTS leg). */
export function keywordRank(query: string, docs: SearchDoc[]): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return docs.map(d => d.id);

  const tokens = tokenize(q);
  const scored = docs
    .map(d => {
      const text = d.text.toLowerCase();
      const id = d.id.toLowerCase();
      let score = 0;
      if (text.includes(q)) score += 5;
      if (id.includes(q)) score += 4;
      for (const t of tokens) {
        if (id.includes(t)) score += 2;
        if (text.includes(t)) score += 1;
      }
      return { id: d.id, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map(x => x.id);
}

export function embedCorpus(docs: SearchDoc[]): Float32Array[] {
  if (!embedFn) throw new Error('Embedding engine not loaded');
  return docs.map(d => embedFn!(d.text));
}

export function vectorRank(
  query: string,
  docs: SearchDoc[],
  vectors: Float32Array[],
  minSim = 0.25,
): string[] {
  if (!embedFn || !cosineFn) throw new Error('Embedding engine not loaded');
  const q = embedFn(query);
  return docs
    .map((d, i) => ({ id: d.id, sim: cosineFn!(q, vectors[i]) }))
    .filter(x => x.sim >= minSim)
    .sort((a, b) => b.sim - a.sim)
    .map(x => x.id);
}

/**
 * Fuse keyword FTS ranks with vector ranks via RRF.
 * If the engine is not ready, falls back to keyword-only.
 */
export function hybridSearch(
  query: string,
  docs: SearchDoc[],
  vectors: Float32Array[] | null,
  opts: HybridSearchOptions = {},
): { id: string; score: number }[] {
  const q = query.trim();
  if (!q) {
    return docs.map(d => ({ id: d.id, score: 0 }));
  }

  const fts = keywordRank(q, docs);
  const lists: string[][] = [fts];

  if (vectors && embedFn && cosineFn && vectors.length === docs.length) {
    lists.push(vectorRank(q, docs, vectors, opts.minVectorSim ?? 0.25));
  }

  let fused = reciprocalRankFusion(lists, opts.rrfK ?? 60);
  if (opts.topK != null) fused = fused.slice(0, opts.topK);
  return fused;
}

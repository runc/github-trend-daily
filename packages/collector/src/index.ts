import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnrichedRepo, EnrichedSnapshot, IndexEntry, TrendingRepo, TrendingSnapshot } from '@github-trend-daily/shared';
import { dedupeReposByFullName } from './dedupe-repos.ts';
import { enrichRepos } from './enrich.ts';
import { fetchAndWriteTrending } from './fetch-trending.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', '..', 'apps', 'web', 'src', 'data');

async function writeJSON(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isEnriched(repo: EnrichedRepo): boolean {
  return Boolean(repo.enrichedAt);
}

function mergeTrendingWithEnrichment(trending: TrendingRepo, enriched: EnrichedRepo): EnrichedRepo {
  return {
    ...enriched,
    ...trending,
    summary: enriched.summary,
    tags: enriched.tags,
    category: enriched.category,
    enrichedAt: enriched.enrichedAt,
    deepwikiAvailable: enriched.deepwikiAvailable,
  };
}

function toUnenriched(repo: TrendingRepo): EnrichedRepo {
  return {
    ...repo,
    summary: repo.description || `${repo.fullName}.`,
    tags: repo.topics,
    category: repo.language || 'Unknown',
    enrichedAt: '',
    deepwikiAvailable: false,
  };
}

async function loadSnapshot(file: string): Promise<EnrichedSnapshot | TrendingSnapshot | null> {
  try {
    const txt = await readFile(join(DATA_DIR, file), 'utf8');
    return JSON.parse(txt) as EnrichedSnapshot | TrendingSnapshot;
  } catch {
    return null;
  }
}

/** Preserve enriched repos from today's snapshots before fetch overwrites raw trending data. */
async function loadEnrichedCache(date: string): Promise<Map<string, Map<string, EnrichedRepo>>> {
  const cache = new Map<string, Map<string, EnrichedRepo>>();
  try {
    const txt = await readFile(join(DATA_DIR, 'index.json'), 'utf8');
    const entries = JSON.parse(txt) as IndexEntry[];
    for (const entry of entries.filter(e => e.date === date)) {
      const snap = await loadSnapshot(entry.file);
      if (!snap || !('enrichedAt' in snap) || !snap.enrichedAt) continue;

      const byName = new Map<string, EnrichedRepo>();
      for (const repo of snap.repos) {
        if (isEnriched(repo)) byName.set(repo.fullName, repo);
      }
      if (byName.size) cache.set(entry.file, byName);
    }
  } catch {
    // index.json may not exist on first run
  }
  return cache;
}

async function buildEnrichedSnapshot(
  matched: TrendingSnapshot,
  entry: IndexEntry,
  enrichCache: Map<string, Map<string, EnrichedRepo>>,
  maxPerSnapshot: number,
): Promise<EnrichedSnapshot> {
  const repos = dedupeReposByFullName(matched.repos);
  const cached = enrichCache.get(entry.file) ?? new Map<string, EnrichedRepo>();

  const head = repos.slice(0, maxPerSnapshot);
  const needEnrich = head.filter(r => !cached.has(r.fullName));
  console.log(
    `[orchestrate] enriching ${needEnrich.length}/${head.length} new repos (${cached.size} cached) for ${entry.since}/${entry.language || 'all'}/${entry.date}`,
  );

  const enrichedNew = await enrichRepos(needEnrich);
  const enrichedByName = new Map(cached);
  for (const repo of enrichedNew) enrichedByName.set(repo.fullName, repo);

  const enrichedHead: EnrichedRepo[] = head.map(repo => {
    const existing = enrichedByName.get(repo.fullName);
    return existing ? mergeTrendingWithEnrichment(repo, existing) : toUnenriched(repo);
  });

  const rest = repos.slice(maxPerSnapshot).map(repo => {
    const existing = cached.get(repo.fullName);
    return existing ? mergeTrendingWithEnrichment(repo, existing) : toUnenriched(repo);
  });

  return {
    date: matched.date,
    since: matched.since,
    language: matched.language,
    fetchedAt: matched.fetchedAt,
    enrichedAt: new Date().toISOString(),
    repos: dedupeReposByFullName([...enrichedHead, ...rest]),
  };
}

async function main(): Promise<void> {
  const date = todayISO();
  const enrichCache = await loadEnrichedCache(date);
  const { entries, snapshots } = await fetchAndWriteTrending();

  const maxPerSnapshot = Number(process.env.ENRICH_LIMIT_PER_SNAPSHOT || 25);
  const updated: IndexEntry[] = [];

  for (const entry of entries) {
    const matched = snapshots.find(s => s.date === entry.date && s.since === entry.since && s.language === entry.language);
    if (!matched) {
      updated.push(entry);
      continue;
    }

    const enrichedSnapshot = await buildEnrichedSnapshot(matched, entry, enrichCache, maxPerSnapshot);
    await writeJSON(join(DATA_DIR, entry.file), enrichedSnapshot);
    console.log(`[orchestrate] wrote ${entry.file} (${enrichedSnapshot.repos.length} repos)`);
    updated.push({ ...entry, count: enrichedSnapshot.repos.length });
  }

  await writeJSON(join(DATA_DIR, 'index.json'), updated);
  console.log('[orchestrate] done');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

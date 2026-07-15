import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnrichedRepo, EnrichedSnapshot, IndexEntry, TrendingSnapshot } from '@github-trend-daily/shared';
import { enrichRepos } from './enrich.ts';
import { fetchAndWriteTrending } from './fetch-trending.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', '..', 'apps', 'web', 'src', 'data');

async function writeJSON(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

async function main(): Promise<void> {
  const { entries, snapshots } = await fetchAndWriteTrending();

  const maxPerSnapshot = Number(process.env.ENRICH_LIMIT_PER_SNAPSHOT || 25);
  const updated: IndexEntry[] = [];

  for (const entry of entries) {
    const matched = snapshots.find(s => s.date === entry.date && s.since === entry.since && s.language === entry.language);
    if (!matched) {
      updated.push(entry);
      continue;
    }

    const toEnrich = matched.repos.slice(0, maxPerSnapshot);
    console.log(`[orchestrate] enriching ${toEnrich.length}/${matched.repos.length} repos for ${entry.since}/${entry.language || 'all'}/${entry.date}`);

    const enriched: EnrichedRepo[] = await enrichRepos(toEnrich);
    const rest = matched.repos.slice(maxPerSnapshot).map(r => ({
      ...r,
      summary: r.description || `${r.fullName}.`,
      tags: r.topics,
      category: r.language || 'Unknown',
      enrichedAt: '',
      deepwikiAvailable: false,
    }));

    const enrichedSnapshot: EnrichedSnapshot = {
      date: matched.date,
      since: matched.since,
      language: matched.language,
      fetchedAt: matched.fetchedAt,
      enrichedAt: new Date().toISOString(),
      repos: [...enriched, ...rest],
    };

    await writeJSON(join(DATA_DIR, entry.file), enrichedSnapshot);
    console.log(`[orchestrate] wrote ${entry.file}`);
    updated.push(entry);
  }

  await writeJSON(join(DATA_DIR, 'index.json'), updated);
  console.log('[orchestrate] done');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

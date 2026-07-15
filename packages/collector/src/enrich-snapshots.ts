import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnrichedRepo, EnrichedSnapshot, TrendingSnapshot } from '@github-trend-daily/shared';
import { enrichRepos } from './enrich.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', '..', 'apps', 'web', 'src', 'data');

async function main(): Promise<void> {
  const files = (await readdir(DATA_DIR)).filter(f => f.endsWith('.json') && f !== 'index.json' && f !== 'sample.json');
  if (!files.length) {
    console.log('[enrich-snapshots] no snapshot files found');
    return;
  }

  const maxPerSnapshot = Number(process.env.ENRICH_LIMIT_PER_SNAPSHOT || 25);

  for (const file of files) {
    const path = join(DATA_DIR, file);
    const txt = await readFile(path, 'utf8');
    const snap = JSON.parse(txt) as TrendingSnapshot | EnrichedSnapshot;

    const alreadyEnriched = 'enrichedAt' in snap && Boolean(snap.enrichedAt);
    if (alreadyEnriched) {
      console.log(`[enrich-snapshots] ${file} already enriched, skip`);
      continue;
    }

    const trending = snap as TrendingSnapshot;
    const toEnrich = trending.repos.slice(0, maxPerSnapshot);
    console.log(`[enrich-snapshots] enriching ${toEnrich.length} repos in ${file}`);

    const enriched: EnrichedRepo[] = await enrichRepos(toEnrich);
    const rest = trending.repos.slice(maxPerSnapshot).map(r => ({
      ...r,
      summary: r.description || `${r.fullName}.`,
      tags: r.topics,
      category: r.language || 'Unknown',
      enrichedAt: '',
      deepwikiAvailable: false,
    }));

    const out: EnrichedSnapshot = {
      date: trending.date,
      since: trending.since,
      language: trending.language,
      fetchedAt: trending.fetchedAt,
      enrichedAt: new Date().toISOString(),
      repos: [...enriched, ...rest],
    };

    await writeFile(path, JSON.stringify(out, null, 2));
    console.log(`[enrich-snapshots] wrote ${file}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

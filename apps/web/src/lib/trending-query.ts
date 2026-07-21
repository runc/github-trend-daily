import type { EnrichedRepo, EnrichedSnapshot, IndexEntry, Since } from '~/types';

export interface TrendingQuery {
  since: Since;
  language: string;
  year: string;
}

export function yearsFromEntries(entries: IndexEntry[]): string[] {
  return Array.from(new Set(entries.map(e => e.date.slice(0, 4)))).sort((a, b) => b.localeCompare(a));
}

export function filterIndexEntries(entries: IndexEntry[], query: TrendingQuery): IndexEntry[] {
  return entries.filter(entry => {
    if (entry.since !== query.since) return false;
    if (query.language && entry.language !== query.language) return false;
    if (query.year && !entry.date.startsWith(query.year)) return false;
    return true;
  });
}

/** Dedupe by fullName across snapshots; prefer latest fetchedAt, order from newest snapshot first. */
export function mergeReposFromSnapshots(snapshots: EnrichedSnapshot[]): EnrichedRepo[] {
  if (snapshots.length === 0) return [];

  const byFetchedDesc = [...snapshots].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  const latest = byFetchedDesc[0];
  const repoByName = new Map<string, EnrichedRepo>();

  for (const snap of byFetchedDesc) {
    for (const repo of snap.repos) {
      const prev = repoByName.get(repo.fullName);
      if (!prev) {
        repoByName.set(repo.fullName, repo);
        continue;
      }
      repoByName.set(repo.fullName, {
        ...prev,
        ...repo,
        summary: prev.summary || repo.summary,
        tags: prev.tags.length ? prev.tags : repo.tags,
        category: prev.category || repo.category,
        enrichedAt: prev.enrichedAt || repo.enrichedAt,
        deepwikiAvailable: prev.deepwikiAvailable || repo.deepwikiAvailable,
      });
    }
  }

  const ordered: EnrichedRepo[] = [];
  const seen = new Set<string>();

  for (const repo of latest.repos) {
    const merged = repoByName.get(repo.fullName);
    if (!merged || seen.has(repo.fullName)) continue;
    ordered.push(merged);
    seen.add(repo.fullName);
  }

  for (const snap of byFetchedDesc) {
    for (const repo of snap.repos) {
      if (seen.has(repo.fullName)) continue;
      const merged = repoByName.get(repo.fullName);
      if (!merged) continue;
      ordered.push(merged);
      seen.add(repo.fullName);
    }
  }

  return ordered;
}

export function snapshotDateRange(entries: IndexEntry[]): string | null {
  if (entries.length === 0) return null;
  const dates = entries.map(e => e.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first === last ? first : `${first} ~ ${last}`;
}

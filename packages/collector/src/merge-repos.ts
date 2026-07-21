import { dedupeReposByFullName } from './dedupe-repos.ts';

/** Merge a fresh trending list into an existing one: fresh order first, then historical-only repos. */
export function mergeReposByFullName<T extends { fullName: string }>(
  fresh: T[],
  existing: T[],
): T[] {
  const freshNames = new Set(fresh.map(r => r.fullName));
  const merged = [...fresh];
  for (const repo of existing) {
    if (!freshNames.has(repo.fullName)) merged.push(repo);
  }
  return dedupeReposByFullName(merged);
}

/** Keep first occurrence per repo fullName (GitHub owner/name). */
export function dedupeReposByFullName<T extends { fullName: string }>(repos: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const repo of repos) {
    if (seen.has(repo.fullName)) continue;
    seen.add(repo.fullName);
    out.push(repo);
  }
  return out;
}

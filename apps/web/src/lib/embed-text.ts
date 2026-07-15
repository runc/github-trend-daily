/** Build a short string for ternlight (≤128 tokens). Prefer dense semantic fields. */
export function repoEmbedText(repo: {
  fullName: string;
  summary?: string;
  description?: string;
  tags?: string[];
  topics?: string[];
  category?: string;
  language?: string | null;
}): string {
  const tags = (repo.tags?.length ? repo.tags : repo.topics || []).slice(0, 8).join(', ');
  const parts = [
    repo.fullName,
    repo.summary || '',
    repo.description || '',
    tags,
    repo.category || '',
    repo.language || '',
  ].filter(Boolean);
  return parts.join('. ').replace(/\s+/g, ' ').trim();
}

export function freeAiEmbedText(item: {
  title: string;
  summary?: string;
  provider?: string;
  category?: string;
  tags?: string[];
  freeQuota?: string;
}): string {
  const tags = (item.tags || []).slice(0, 8).join(', ');
  const parts = [
    item.title,
    item.summary || '',
    item.provider || '',
    item.category || '',
    tags,
    item.freeQuota || '',
  ].filter(Boolean);
  return parts.join('. ').replace(/\s+/g, ' ').trim();
}

export type {
  EnrichedRepo,
  EnrichedSnapshot,
  IndexEntry,
  RepoAuthor,
  Since,
  TrendingRepo,
  TrendingSnapshot,
} from '@github-trend-daily/shared';

export interface FreeAIItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  provider: string;
  category: string;
  freeQuota: string;
  score: number;
  tags: string[];
  updatedAt: string;
}

export interface FreeAICollection {
  fetchedAt: string;
  items: FreeAIItem[];
}

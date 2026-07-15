export type Since = 'daily' | 'weekly' | 'monthly';

export interface RepoAuthor {
  name: string;
  avatar: string;
  url: string;
}

export interface TrendingRepo {
  name: string;
  fullName: string;
  url: string;
  description: string;
  language: string | null;
  languageColor: string | null;
  stars: number;
  forks: number;
  starsToday: number;
  starsThisWeek?: number;
  starsThisMonth?: number;
  topics: string[];
  author: RepoAuthor;
}

export interface EnrichedRepo extends TrendingRepo {
  summary: string;
  tags: string[];
  category: string;
  enrichedAt: string;
  deepwikiAvailable: boolean;
}

export interface TrendingSnapshot {
  date: string;
  since: Since;
  language: string;
  fetchedAt: string;
  repos: TrendingRepo[];
}

export interface EnrichedSnapshot {
  date: string;
  since: Since;
  language: string;
  fetchedAt: string;
  enrichedAt: string;
  repos: EnrichedRepo[];
}

export interface IndexEntry {
  date: string;
  since: Since;
  language: string;
  count: number;
  file: string;
}

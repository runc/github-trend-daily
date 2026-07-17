import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IndexEntry, Since, TrendingRepo, TrendingSnapshot } from '@github-trend-daily/shared';
import { dedupeReposByFullName } from './dedupe-repos.ts';
import './proxy.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', '..', 'apps', 'web', 'src', 'data');

const LANGUAGES = (process.env.TREND_LANGUAGES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const SINCE_OPTIONS = (process.env.TREND_SINCE || 'daily')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean) as Since[];
const SPOKEN_LANGUAGES = (process.env.TREND_SPOKEN_LANGUAGES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  Dart: '#00B4AB',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function pickColor(lang: string | null): string | null {
  if (!lang) return null;
  return LANGUAGE_COLORS[lang] ?? null;
}

interface RawRepo {
  author: string;
  name: string;
  avatar: string;
  url: string;
  description: string | null;
  language: string | null;
  languageColor: string | null;
  stars: number;
  forks: number;
  currentPeriodStars: number;
}

function strip(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function parseNumber(s: string): number {
  const t = s.toLowerCase().replace(/,/g, '').trim();
  const m = t.match(/^([\d.]+)\s*(k|m)?$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return m[2] === 'k' ? Math.round(n * 1000) : m[2] === 'm' ? Math.round(n * 1_000_000) : n;
}

function parseArticle(html: string): RawRepo | null {
  const h2 = html.match(/<h2 class="h3[^"]*"[^>]*>[\s\S]*?<a[^>]*href="\/([^/]+)\/([^/"]+)"/);
  if (!h2) return null;
  const author = h2[1];
  const name = h2[2];
  if (!author || !name || author === 'trending' || author === 'login') return null;

  const descMatch = html.match(/<p class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  const description = descMatch ? strip(descMatch[1]) : null;

  const langMatch = html.match(/<span[^>]*itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/);
  const language = langMatch ? strip(langMatch[1]) : null;

  const langColorMatch = html.match(/<span class="repo-language-color"[^>]*style="background-color:\s*([^;"]+)"/);
  const languageColor = langColorMatch ? langColorMatch[1].trim() : null;

  const avatarMatch = html.match(/<img class="avatar[^"]*"[^>]*src="([^"]+)"/);
  const avatar = avatarMatch ? avatarMatch[1] : '';

  const starsBlock = html.match(/href="\/[^/]+\/[^/]+\/stargazers"[\s\S]*?<\/svg>\s*([\d.,kKmM]+)/);
  const stars = starsBlock ? parseNumber(starsBlock[1]) : 0;

  const forksBlock = html.match(/href="\/[^/]+\/[^/]+\/forks"[\s\S]*?<\/svg>\s*([\d.,kKmM]+)/);
  const forks = forksBlock ? parseNumber(forksBlock[1]) : 0;

  const todayMatch = html.match(/([\d.,]+)\s*stars\s*(today|this week|this month)/i);
  const currentPeriodStars = todayMatch ? parseNumber(todayMatch[1]) : 0;

  return { author, name, avatar, url: `https://github.com/${author}/${name}`, description, language, languageColor, stars, forks, currentPeriodStars };
}

async function fetchTrending(since: Since, language: string, spoken: string): Promise<TrendingRepo[]> {
  const params = new URLSearchParams();
  params.set('since', since);
  if (language) params.set('language', language);
  if (spoken) params.set('spoken_language_code', spoken);

  const url = `https://github.com/trending?${params.toString()}`;
  console.log(`[fetch] ${url}`);

  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) {
    console.warn(`[fetch] non-200 (${res.status}) for ${url}`);
    return [];
  }
  const html = await res.text();
  const articles = html.match(/<article class="Box-row">[\s\S]*?<\/article>/g) || [];

  const seen = new Set<string>();
  const out: RawRepo[] = [];
  for (const art of articles) {
    const r = parseArticle(art);
    if (!r) continue;
    const key = `${r.author}/${r.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }

  return out.map(r => ({
    name: r.name,
    fullName: `${r.author}/${r.name}`,
    url: r.url,
    description: r.description ?? '',
    language: r.language,
    languageColor: r.languageColor ?? pickColor(r.language),
    stars: r.stars,
    forks: r.forks,
    starsToday: r.currentPeriodStars,
    topics: [],
    author: { name: r.author, avatar: r.avatar, url: `https://github.com/${r.author}` },
  }));
}

async function writeJSON(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

async function loadIndex(): Promise<IndexEntry[]> {
  try {
    const f = await import('node:fs/promises');
    const txt = await f.readFile(join(DATA_DIR, 'index.json'), 'utf8');
    return JSON.parse(txt) as IndexEntry[];
  } catch {
    return [];
  }
}

export async function fetchAndWriteTrending(): Promise<{ entries: IndexEntry[]; snapshots: TrendingSnapshot[] }> {
  const date = todayISO();
  const fetchedAt = new Date().toISOString();
  const existing = await loadIndex().then(es => es.filter(e => e.date !== date));
  const indexEntries: IndexEntry[] = [...existing];
  const snapshots: TrendingSnapshot[] = [];

  const langList = LANGUAGES.length ? LANGUAGES : [''];
  const spokenList = SPOKEN_LANGUAGES.length ? SPOKEN_LANGUAGES : [''];

  for (const since of SINCE_OPTIONS) {
    for (const lang of langList) {
      for (const spoken of spokenList) {
        const repos = dedupeReposByFullName(await fetchTrending(since, lang, spoken));
        const langSlug = lang || 'all';
        const spokenSlug = spoken || 'all';
        const fileName = `${date}__${since}__${langSlug}__${spokenSlug}.json`;
        const snapshot: TrendingSnapshot = { date, since, language: lang, fetchedAt, repos };
        await writeJSON(join(DATA_DIR, fileName), snapshot);
        console.log(`[write] ${fileName} (${repos.length} repos)`);
        snapshots.push(snapshot);
        indexEntries.push({ date, since, language: lang, count: repos.length, file: fileName });
      }
    }
  }

  await writeJSON(join(DATA_DIR, 'index.json'), indexEntries);
  console.log(`[done] ${snapshots.length} snapshots, date=${date}`);
  return { entries: indexEntries, snapshots };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchAndWriteTrending().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

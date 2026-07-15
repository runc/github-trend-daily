import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const DEFAULT_URL = process.env.DEEPWIKI_MCP_URL || 'https://mcp.deepwiki.com/mcp';

export interface DeepWikiSummary {
  available: boolean;
  overview: string;
  topTopics: string[];
}

function repoSlug(fullName: string): string {
  return fullName.toLowerCase();
}

async function withClient<T>(
  url: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const isSSE = url.includes('/sse');
  const transport = isSSE
    ? new SSEClientTransport(new URL(url))
    : new StreamableHTTPClientTransport(new URL(url));

  const client = new Client({ name: 'github-trend-daily-collector', version: '0.2.0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function getRepoSummary(fullName: string): Promise<DeepWikiSummary> {
  const slug = repoSlug(fullName);

  try {
    return await withClient(DEFAULT_URL, async client => {
      let overview = '';
      const topTopics: string[] = [];

      try {
        const structure = (await client.callTool({
          name: 'read_wiki_structure',
          arguments: { repoName: slug },
        })) as { content?: Array<{ type: string; text?: string }> };

        const text = (structure.content || []).map(c => c.text || '').join('\n');
        const docsRoot = findFirstJsonField(text, 'root') || findFirstJsonField(text, 'rootTitle');
        overview = docsRoot || text.slice(0, 2000);
      } catch (err) {
        console.warn(`[deepwiki] structure failed for ${slug}: ${(err as Error).message}`);
      }

      try {
        const ask = (await client.callTool({
          name: 'ask_question',
          arguments: {
            repoName: slug,
            question: 'In one or two sentences, what does this project do and who is it for? List 5 key technical keywords.',
          },
        })) as { content?: Array<{ type: string; text?: string }> };

        const ans = (ask.content || []).map(c => c.text || '').join('\n');
        overview = overview || ans;
        const kwMatch = ans.match(/keywords?[:：]\s*(.+)$/im);
        if (kwMatch) {
          topTopics.push(
            ...kwMatch[1]
              .split(/[,、;\n]/)
              .map(s => s.trim().replace(/^[-*\d.\s]+/, '').replace(/[`*]/g, ''))
              .filter(Boolean)
              .slice(0, 8),
          );
        }
      } catch (err) {
        console.warn(`[deepwiki] ask_question failed for ${slug}: ${(err as Error).message}`);
      }

      if (!overview) return { available: false, overview: '', topTopics: [] };
      return { available: true, overview: overview.slice(0, 4000), topTopics };
    });
  } catch (err) {
    console.warn(`[deepwiki] unavailable for ${slug}: ${(err as Error).message}`);
    return { available: false, overview: '', topTopics: [] };
  }
}

function findFirstJsonField(text: string, field: string): string | null {
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === 'object' && field in obj) return String((obj as Record<string, unknown>)[field]);
  } catch {
    // text is not JSON; ignore
  }
  return null;
}

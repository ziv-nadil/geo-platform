/**
 * AI crawler user-agent classification (docs/research/ai-engine-methodology.md section 7.1).
 * Match on UA token substrings, case-insensitively. UA is spoofable: these rows are "claimed" bot
 * traffic until verified against vendor IP lists (not done in the hourly poll).
 */

export type BotPurpose = 'training' | 'search' | 'user_fetch' | 'classic_search' | 'data';

export interface BotInfo {
  bot: string;
  operator: string;
  purpose: BotPurpose;
}

/** Order matters: more specific tokens first ("Claude-SearchBot" before "ClaudeBot"). */
export const BOTS: ReadonlyArray<BotInfo & { tokens: readonly string[] }> = [
  { bot: 'OAI-SearchBot', operator: 'OpenAI', purpose: 'search', tokens: ['oai-searchbot', 'oaisearchbot'] },
  { bot: 'ChatGPT-User', operator: 'OpenAI', purpose: 'user_fetch', tokens: ['chatgpt-user'] },
  { bot: 'GPTBot', operator: 'OpenAI', purpose: 'training', tokens: ['gptbot'] },
  { bot: 'Claude-SearchBot', operator: 'Anthropic', purpose: 'search', tokens: ['claude-searchbot'] },
  { bot: 'Claude-User', operator: 'Anthropic', purpose: 'user_fetch', tokens: ['claude-user'] },
  { bot: 'ClaudeBot', operator: 'Anthropic', purpose: 'training', tokens: ['claudebot', 'anthropic-ai'] },
  { bot: 'Perplexity-User', operator: 'Perplexity', purpose: 'user_fetch', tokens: ['perplexity-user'] },
  { bot: 'PerplexityBot', operator: 'Perplexity', purpose: 'search', tokens: ['perplexitybot'] },
  { bot: 'Google-CloudVertexBot', operator: 'Google', purpose: 'user_fetch', tokens: ['google-cloudvertexbot'] },
  { bot: 'Googlebot', operator: 'Google', purpose: 'classic_search', tokens: ['googlebot'] },
  { bot: 'Bingbot', operator: 'Microsoft', purpose: 'classic_search', tokens: ['bingbot'] },
  { bot: 'Applebot-Extended', operator: 'Apple', purpose: 'training', tokens: ['applebot-extended'] },
  { bot: 'Applebot', operator: 'Apple', purpose: 'classic_search', tokens: ['applebot'] },
  { bot: 'Meta-ExternalAgent', operator: 'Meta', purpose: 'training', tokens: ['meta-externalagent'] },
  { bot: 'Meta-ExternalFetcher', operator: 'Meta', purpose: 'user_fetch', tokens: ['meta-externalfetcher'] },
  { bot: 'CCBot', operator: 'Common Crawl', purpose: 'data', tokens: ['ccbot'] },
  { bot: 'Bytespider', operator: 'ByteDance', purpose: 'training', tokens: ['bytespider'] },
  { bot: 'Amazonbot', operator: 'Amazon', purpose: 'data', tokens: ['amazonbot'] },
  { bot: 'DuckAssistBot', operator: 'DuckDuckGo', purpose: 'user_fetch', tokens: ['duckassistbot'] },
  { bot: 'MistralAI-User', operator: 'Mistral', purpose: 'user_fetch', tokens: ['mistralai-user'] },
];

export function classifyBot(userAgent: string): BotInfo | null {
  const ua = userAgent.toLowerCase();
  for (const b of BOTS) if (b.tokens.some((t) => ua.includes(t))) return { bot: b.bot, operator: b.operator, purpose: b.purpose };
  return null;
}

/** GraphQL `userAgent_like` filters for every token (Cloudflare matches with SQL LIKE). */
export function userAgentFilters(): Array<{ userAgent_like: string }> {
  // Case sensitivity of LIKE in Cloudflare GraphQL is unverified: send canonical and lowercase forms.
  const patterns = new Set<string>();
  for (const b of BOTS) {
    patterns.add(`%${b.bot}%`);
    patterns.add(`%${b.tokens[0]}%`);
  }
  return [...patterns].map((p) => ({ userAgent_like: p }));
}

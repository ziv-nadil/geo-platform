import 'server-only';
import type { TxSql } from '../db';
import { allowlistedFetch } from '../../engines/http';
import { analyzePage, summarizeResearch, type BenchSource, type PageStructure } from '../../content/analyze';
import { safeFetch } from '../net/safe-fetch';

export interface ResearchSource { url: string; kind: 'cited' | 'serp'; rank: number | null; title: string | null; citations: number | null; structure: PageStructure | null; error?: string }
export interface ResearchResult { status: 'ready' | 'partial' | 'failed'; sources: ResearchSource[]; summary: ReturnType<typeof summarizeResearch>; notes: string[] }

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** Pages AI engines cited for the gap's prompts in the last 60 days (client's own domain excluded). */
async function citedUrls(sql: TxSql, orgId: string, promptIds: string[], ownDomain: string | null, limit: number) {
  if (!promptIds.length) return [];
  const rows = await sql`
    select c.url, max(c.title) as title, count(*)::int as n
    from public.citations c join public.prompt_runs pr on pr.id = c.prompt_run_id
    where c.org_id = ${orgId} and pr.prompt_id = any(${promptIds}::uuid[]) and c.created_at > now() - interval '60 days'
    group by c.url order by n desc limit ${limit + 6}`;
  return rows.filter((r) => !ownDomain || host(r.url as string) !== ownDomain).slice(0, limit).map((r) => ({ url: r.url as string, title: (r.title as string | null) ?? null, n: r.n as number }));
}

/** Top organic Google results via DataForSEO. not_configured degrades to a note, never a fake result. */
export async function serpTop(keyword: string, limit: number): Promise<{ items: { url: string; title: string | null; rank: number }[]; note?: string }> {
  const login = process.env.DATAFORSEO_LOGIN?.trim(), pass = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !pass) return { items: [], note: 'SERP skipped: DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not configured' };
  try {
    const f = allowlistedFetch('dataforseo', { timeoutMs: 60_000 });
    const res = await f('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${login}:${pass}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify([{ keyword: keyword.slice(0, 700), location_code: 2840, language_code: 'en', device: 'desktop', depth: 10 }]),
    });
    if (!res.ok) return { items: [], note: `SERP failed: DataForSEO HTTP ${res.status}` };
    const json = (await res.json()) as { tasks?: { result?: { items?: { type?: string; url?: string; title?: string; rank_absolute?: number }[] }[] }[] };
    const items = (json.tasks?.[0]?.result?.[0]?.items ?? []).filter((i) => i.type === 'organic' && i.url).slice(0, limit)
      .map((i) => ({ url: i.url!, title: i.title ?? null, rank: i.rank_absolute ?? 0 }));
    return { items };
  } catch { return { items: [], note: 'SERP failed: network error' }; }
}

async function fetchStructure(url: string): Promise<{ structure: PageStructure | null; error?: string }> {
  try {
    const res = await safeFetch(url, { integration: 'scrape', timeoutMs: 12_000, maxBytes: 3_000_000, headers: { accept: 'text/html', 'user-agent': 'BeaconGEO-Research/1.0 (+content research)' } });
    if (!res.ok) return { structure: null, error: `HTTP ${res.status}` };
    if (!/html/i.test(res.headers.get('content-type') ?? '')) return { structure: null, error: 'not html' };
    return { structure: analyzePage(await res.text()) };
  } catch (e) { return { structure: null, error: e instanceof Error ? e.message.slice(0, 80) : 'fetch failed' }; }
}

export type Runner = <T>(fn: (sql: TxSql) => Promise<T>) => Promise<T>;

export async function runResearch(run: Runner, o: { orgId: string; promptIds: string[]; promptText: string; ownDomain: string | null }): Promise<ResearchResult> {
  const notes: string[] = [];
  const cited = await run((sql) => citedUrls(sql, o.orgId, o.promptIds, o.ownDomain, 6));
  if (!cited.length) notes.push('No AI citations recorded for this prompt yet');
  const serp = await serpTop(o.promptText, 8);
  if (serp.note) notes.push(serp.note);
  const seen = new Set<string>();
  const queue: ResearchSource[] = [];
  for (const c of cited) if (!seen.has(c.url)) { seen.add(c.url); queue.push({ url: c.url, kind: 'cited', rank: null, title: c.title, citations: c.n, structure: null }); }
  for (const s of serp.items) if (!seen.has(s.url) && host(s.url) !== o.ownDomain) { seen.add(s.url); queue.push({ url: s.url, kind: 'serp', rank: s.rank, title: s.title, citations: null, structure: null }); }
  const out: ResearchSource[] = [];
  for (let i = 0; i < queue.length; i += 4) {
    out.push(...await Promise.all(queue.slice(i, i + 4).map(async (s) => { const r = await fetchStructure(s.url); return { ...s, structure: r.structure, error: r.error }; })));
  }
  const bench: BenchSource[] = out.map((s) => ({ kind: s.kind, structure: s.structure }));
  const summary = summarizeResearch(bench);
  if (out.length && summary.analysed < out.length) notes.push(`${out.length - summary.analysed} of ${out.length} pages could not be analysed`);
  return { status: !out.length ? 'failed' : summary.analysed === out.length ? 'ready' : 'partial', sources: out, summary, notes };
}

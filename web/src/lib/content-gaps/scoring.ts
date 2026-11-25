/**
 * Content-gap scoring (pure). A gap is a group of prompts (same topic / persona / funnel stage)
 * where at least one competitor is mentioned or cited and the client is neither mentioned nor cited.
 *
 *   prompt score = importance × competitor presence × source authority
 *   gap score    = Σ prompt scores
 *
 * competitor presence (0..1.5): share of runs showing any competitor, +0.1 per additional distinct
 *   competitor (max +0.5), so a prompt all rivals win outranks one a single rival wins.
 * source authority (0..1): citation-weighted mean of the cited domains' authority. Authority comes
 *   from the domain's category (source_domains.category); with no citations, a neutral 0.4.
 */
export const DEFAULT_AUTHORITY = 0.4;

const CATEGORY_AUTHORITY: Record<string, number> = {
  institutional: 1, reference: 0.9, earned_media: 0.85, review_aggregator: 0.8, video: 0.6,
  marketplace_ecom: 0.55, competitor: 0.5, ugc_social: 0.4, other: 0.35, owned: 0.35,
};

export function domainAuthority(category: string | null | undefined): number {
  return CATEGORY_AUTHORITY[category ?? 'other'] ?? CATEGORY_AUTHORITY.other;
}

export interface PromptSignal {
  promptId: string;
  text: string;
  topicId: string | null;
  topicName: string | null;
  personaId: string | null;
  personaName: string | null;
  funnel: string | null;
  importance: number;
  runs: number;
  brandRuns: number; // runs where the brand is mentioned or cited
  competitorRuns: number; // runs where any competitor is mentioned or cited
  competitors: { id: string; name: string; mentions: number; citations: number }[];
  domains: { domain: string; category: string | null; citations: number }[];
}

export interface PromptScore {
  importance: number;
  presence: number;
  authority: number;
  score: number;
}

export const isGapPrompt = (p: PromptSignal) => p.runs > 0 && p.brandRuns === 0 && p.competitorRuns > 0;

export function competitorPresence(p: Pick<PromptSignal, 'runs' | 'competitorRuns' | 'competitors'>): number {
  if (p.runs <= 0 || p.competitorRuns <= 0) return 0;
  const share = Math.min(1, p.competitorRuns / p.runs);
  const extra = Math.min(0.5, Math.max(0, p.competitors.length - 1) * 0.1);
  return share + extra;
}

export function sourceAuthority(domains: PromptSignal['domains']): number {
  const total = domains.reduce((s, d) => s + d.citations, 0);
  if (total <= 0) return DEFAULT_AUTHORITY;
  return domains.reduce((s, d) => s + domainAuthority(d.category) * d.citations, 0) / total;
}

export function scorePrompt(p: PromptSignal): PromptScore {
  const importance = p.importance > 0 ? p.importance : 1;
  const presence = competitorPresence(p);
  const authority = sourceAuthority(p.domains);
  return { importance, presence, authority, score: importance * presence * authority };
}

export interface Gap {
  groupKey: string;
  topicId: string | null;
  personaId: string | null;
  funnel: string | null;
  label: string;
  promptIds: string[];
  samplePrompts: string[];
  competitors: { id: string; name: string; mentions: number; citations: number }[];
  topDomains: { domain: string; category: string | null; citations: number; authority: number }[];
  score: number;
  parts: { importance: number; presence: number; authority: number };
}

const keyOf = (p: PromptSignal) => `${p.topicId ?? '-'}|${p.personaId ?? '-'}|${p.funnel ?? '-'}`;

/** Group gap prompts and rank groups by score (desc, then key for stable order). */
export function buildGaps(signals: PromptSignal[], opts: { maxDomains?: number; maxSamples?: number } = {}): Gap[] {
  const groups = new Map<string, PromptSignal[]>();
  for (const s of signals.filter(isGapPrompt)) {
    const k = keyOf(s);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const gaps: Gap[] = [];
  for (const [groupKey, ps] of groups) {
    const scored = ps.map((p) => ({ p, s: scorePrompt(p) })).sort((a, b) => b.s.score - a.s.score);
    const comp = new Map<string, Gap['competitors'][number]>();
    const dom = new Map<string, { category: string | null; citations: number }>();
    for (const { p } of scored) {
      for (const c of p.competitors) {
        const e = comp.get(c.id) ?? { id: c.id, name: c.name, mentions: 0, citations: 0 };
        e.mentions += c.mentions;
        e.citations += c.citations;
        comp.set(c.id, e);
      }
      for (const d of p.domains) {
        const e = dom.get(d.domain) ?? { category: d.category, citations: 0 };
        e.citations += d.citations;
        dom.set(d.domain, e);
      }
    }
    const n = scored.length;
    const first = scored[0].p;
    const label = [first.topicName ?? 'General', first.personaName, first.funnel].filter(Boolean).join(' · ');
    gaps.push({
      groupKey, topicId: first.topicId, personaId: first.personaId, funnel: first.funnel, label,
      promptIds: scored.map((x) => x.p.promptId),
      samplePrompts: scored.slice(0, opts.maxSamples ?? 5).map((x) => x.p.text),
      competitors: [...comp.values()].sort((a, b) => b.mentions + b.citations - (a.mentions + a.citations)),
      topDomains: [...dom.entries()]
        .map(([domain, v]) => ({ domain, category: v.category, citations: v.citations, authority: domainAuthority(v.category) }))
        .sort((a, b) => b.citations - a.citations).slice(0, opts.maxDomains ?? 8),
      score: scored.reduce((s, x) => s + x.s.score, 0),
      parts: {
        importance: scored.reduce((s, x) => s + x.s.importance, 0) / n,
        presence: scored.reduce((s, x) => s + x.s.presence, 0) / n,
        authority: scored.reduce((s, x) => s + x.s.authority, 0) / n,
      },
    });
  }
  return gaps.sort((a, b) => b.score - a.score || a.groupKey.localeCompare(b.groupKey));
}

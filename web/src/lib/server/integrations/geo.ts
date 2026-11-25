import 'server-only';
import { runAndSaveForOrg } from '../geo-audit/run';
import { result, type Tester } from './types';

/** Onboarding step "geo_readiness": runs the full audit; each audit category becomes a live-test check. */
export const test: Tester = async (ctx) => {
  const a = await runAndSaveForOrg(ctx.orgId, null);
  if ('error' in a) return result([], ['website_url']);
  const cats = new Map<string, { score: number; w: number; bad: string[] }>();
  for (const c of a.checks.filter((c) => c.status !== 'info')) {
    const e = cats.get(c.category) ?? { score: 0, w: 0, bad: [] };
    e.score += c.score * c.weight; e.w += c.weight;
    if (c.status !== 'pass') e.bad.push(c.label);
    cats.set(c.category, e);
  }
  const checks = [{ id: 'geo_score', label: 'GEO readiness score', ok: a.score >= 70, detail: `${a.score}/100, ${a.fixes.length} fix(es) recommended` }, ...[...cats].map(([cat, e]) => ({ id: `geo_${cat.toLowerCase().replace(/\W+/g, '_')}`, label: cat, ok: e.score / e.w >= 70, detail: e.bad.length ? `Needs work: ${e.bad.join(', ')}` : 'All good' }))];
  return result(checks);
};

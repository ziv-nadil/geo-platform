import 'server-only';
import type { Sql } from '../db';
import { citationKey, detectCrawlerBlocks, newCompetitorCitations, visibilityDrop } from '@/lib/reports/alerts';
import { previousPeriod } from '@/lib/reports/aggregate';
import { windowKpis } from '../reports/collect';
import { sendSlack } from './slack';

type Alert = { kind: 'visibility_drop' | 'competitor_citation' | 'crawler_block'; key: string; text: string; payload: Record<string, unknown> };
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Alerts for one org. `minDrop` is the visibility-drop floor in points (orgs.settings.alert_min_drop, default 5). */
export async function evaluateOrgAlerts(sql: Sql, orgId: string, now = new Date()): Promise<Alert[]> {
  const out: Alert[] = [];
  const today = iso(now);

  const [o] = await sql`select name, coalesce((settings->>'alert_min_drop')::float8, 5) as min_drop from public.organizations where id = ${orgId}`;
  const name = o.name as string;

  // 1. Visibility drop: last 7 days vs the 7 before.
  const to = iso(new Date(now.getTime() - 86_400_000));
  const from = iso(new Date(now.getTime() - 7 * 86_400_000));
  const prev = previousPeriod(from, to);
  const [cur, before] = await Promise.all([windowKpis(sql, orgId, from, to), windowKpis(sql, orgId, prev.from, prev.to)]);
  const d = visibilityDrop({ visibility: cur.visibility, scoredRuns: cur.scoredRuns }, { visibility: before.visibility, scoredRuns: before.scoredRuns }, { minDrop: Number(o.min_drop) });
  if (d.fire) {
    out.push({ kind: 'visibility_drop', key: `visibility_drop:${today}`, payload: { from, to, current: cur.visibility, previous: before.visibility, drop: d.drop, threshold: d.threshold },
      text: `:chart_with_downwards_trend: *${name}*: visibility fell ${d.drop} pts (${before.visibility} → ${cur.visibility}) over the last 7 days, beyond the ${d.threshold}-pt noise threshold.` });
  }

  // 2. New competitor citations in the last 24h whose (competitor, domain) was never cited before.
  const recent = await sql`
    select distinct on (c.competitor_id, c.domain) c.competitor_id, comp.name, c.domain, c.url
    from public.citations c join public.competitors comp on comp.id = c.competitor_id
    where c.org_id = ${orgId} and c.competitor_id is not null and c.created_at >= now() - interval '24 hours'
    order by c.competitor_id, c.domain, c.created_at desc`;
  if (recent.length) {
    const ids = recent.map((r) => r.competitor_id as string);
    const seen = await sql`
      select distinct competitor_id, domain from public.citations
      where org_id = ${orgId} and competitor_id = any(${ids}::uuid[]) and created_at < now() - interval '24 hours'`;
    const fresh = newCompetitorCitations(
      recent.map((r) => ({ competitorId: r.competitor_id as string, competitorName: r.name as string, domain: r.domain as string, url: r.url as string })),
      new Set(seen.map((r) => citationKey(r.competitor_id as string, r.domain as string))),
    );
    for (const c of fresh.slice(0, 10)) {
      out.push({ kind: 'competitor_citation', key: `competitor_citation:${citationKey(c.competitorId, c.domain)}`, payload: { ...c },
        text: `:mag: *${name}*: ${c.competitorName} is now cited from ${c.domain} (${c.url})` });
    }
  }

  // 3. Crawler blocks in the last 24h.
  const hits = await sql`select bot, status, sum(hits)::int as hits from public.crawler_hits where org_id = ${orgId} and ts >= now() - interval '24 hours' group by bot, status`;
  for (const b of detectCrawlerBlocks(hits.map((h) => ({ bot: h.bot as string, status: h.status as number | null, hits: Number(h.hits) })))) {
    out.push({ kind: 'crawler_block', key: `crawler_block:${b.bot}:${today}`, payload: b,
      text: `:no_entry: *${name}*: ${b.bot} is being blocked (${b.blocked}/${b.total} requests denied in 24h). AI engines may not be able to read your site.` });
  }
  return out;
}

/** Evaluate every active org, de-duplicate via alert_events, and post to Slack. Returns counts only. */
export async function runAlerts(sql: Sql, now = new Date()) {
  const orgs = await sql`select id from public.organizations where status in ('active', 'onboarding')`;
  const summary = { orgs: orgs.length, fired: 0, delivered: 0, skipped: 0 };
  for (const o of orgs) {
    const orgId = o.id as string;
    let alerts: Alert[];
    try { alerts = await evaluateOrgAlerts(sql, orgId, now); } catch { continue; }
    for (const a of alerts) {
      const [row] = await sql`
        insert into public.alert_events (org_id, kind, dedupe_key, payload) values (${orgId}, ${a.kind}, ${a.key}, ${sql.json(a.payload as never)})
        on conflict (org_id, dedupe_key) do nothing returning id`;
      if (!row) { summary.skipped++; continue; }
      summary.fired++;
      const r = await sendSlack(orgId, a.text);
      if (r.status === 'sent') {
        summary.delivered++;
        await sql`update public.alert_events set delivered = true where id = ${row.id}`;
      }
    }
  }
  return summary;
}

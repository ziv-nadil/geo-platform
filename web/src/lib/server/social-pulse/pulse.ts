import 'server-only';
import { withService, type TxSql } from '../db';
import { readSecret } from '../secrets/broker';
import { analyzeSocial } from './analyze';
import { runActor } from './apify';
import { checkBudget } from './budget';
import { ACTORS, DEFAULT_MAX_ITEMS, MAX_KEYWORDS, PLATFORMS, killSwitchOn, type Platform } from './config';
import { prepareItems, type SocialItem } from './normalize';
import { ensureChannel, postInsight } from './slack';

export interface PulseSettings { enabled: boolean; platforms: Platform[]; extraKeywords: string[]; maxItems: number; maxRuns: number; monthlyBudgetUsd: number; slackChannel: string | null; slackChannelId: string | null; lastRunOn: string | null }

export async function loadPulseSettings(sql: TxSql, orgId: string): Promise<PulseSettings> {
  const [s] = await sql`select enabled, platforms, extra_keywords, max_items_per_platform, max_runs_per_day, monthly_budget_usd, slack_channel, slack_channel_id, last_run_on::text as last_run_on from public.social_pulse_settings where org_id = ${orgId}`;
  return {
    enabled: !!s?.enabled, platforms: ((s?.platforms as string[] | undefined) ?? PLATFORMS).filter((p): p is Platform => (PLATFORMS as string[]).includes(p)),
    extraKeywords: (s?.extra_keywords as string[] | undefined) ?? [], maxItems: (s?.max_items_per_platform as number | undefined) ?? DEFAULT_MAX_ITEMS, maxRuns: (s?.max_runs_per_day as number | undefined) ?? 3,
    monthlyBudgetUsd: Number(s?.monthly_budget_usd ?? 10), slackChannel: (s?.slack_channel as string | null) ?? null, slackChannelId: (s?.slack_channel_id as string | null) ?? null, lastRunOn: (s?.last_run_on as string | null) ?? null,
  };
}

/** Inputs: brand, user keywords, tracked topics, competitors and the tracked prompts. */
export async function loadPulseInputs(sql: TxSql, orgId: string) {
  const [org] = await sql`select o.name, p.display_name from public.organizations o left join public.brand_profiles p on p.org_id = o.id where o.id = ${orgId}`;
  const topics = await sql`select name from public.topics where org_id = ${orgId} order by created_at limit 8`;
  const comps = await sql`select name from public.competitors where org_id = ${orgId} and active order by name limit 6`;
  const prompts = await sql`select text from public.prompts where org_id = ${orgId} and active order by created_at desc limit 20`;
  const settings = await loadPulseSettings(sql, orgId);
  const brand = ((org?.display_name as string | null) || (org?.name as string | null) || '').trim();
  const queries = [...new Map([brand, ...settings.extraKeywords, ...topics.map((t) => t.name as string)].map((q) => q.trim()).filter(Boolean).map((q) => [q.toLowerCase(), q])).values()].slice(0, MAX_KEYWORDS);
  return { brand: brand || 'The brand', queries, competitors: comps.map((c) => c.name as string), prompts: prompts.map((p) => p.text as string), settings };
}

export type PulseResult = { status: 'ok'; insights: number; items: number; costUsd: number; notes: string[]; slack?: string } | { status: 'skipped' | 'not_configured' | 'error'; message: string; missing?: string[] };

export async function runPulseForOrg(orgId: string, opts: { force?: boolean } = {}): Promise<PulseResult> {
  if (killSwitchOn()) return { status: 'skipped', message: 'Global kill switch is on (SOCIAL_PULSE_DISABLED).' };
  if (!process.env.APIFY_TOKEN?.trim()) return { status: 'not_configured', message: 'Set APIFY_TOKEN.', missing: ['APIFY_TOKEN'] };
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return { status: 'not_configured', message: 'Set ANTHROPIC_API_KEY.', missing: ['ANTHROPIC_API_KEY'] };
  const inp = await withService((sql) => loadPulseInputs(sql, orgId));
  const st = inp.settings;
  if (!st.enabled && !opts.force) return { status: 'skipped', message: 'Social pulse is off for this organization.' };
  if (inp.queries.length === 0) return { status: 'skipped', message: 'No keywords or topics to research yet.' };

  const notes: string[] = [];
  let costUsd = 0;
  const collected: SocialItem[] = [];
  for (const platform of st.platforms) {
    const state = await withService(async (sql) => {
      const [m] = await sql`select coalesce(sum(cost_usd), 0)::float8 as spent from public.social_pulse_runs where org_id = ${orgId} and created_at >= date_trunc('month', now())`;
      const [d] = await sql`select count(*)::int as n from public.social_pulse_runs where org_id = ${orgId} and created_at >= date_trunc('day', now()) and status <> 'skipped'`;
      return { spent: m.spent as number, runs: d.n as number };
    });
    const verdict = checkBudget({ killSwitch: killSwitchOn(), monthSpentUsd: state.spent, monthlyBudgetUsd: st.monthlyBudgetUsd, runsToday: state.runs, maxRunsPerDay: st.maxRuns }, platform, st.maxItems);
    if (!verdict.ok) { notes.push(`${ACTORS[platform].label}: ${verdict.message}`); continue; }
    const [row] = await withService((sql) => sql`insert into public.social_pulse_runs (org_id, platform, actor_id) values (${orgId}, ${platform}, ${ACTORS[platform].id}) returning id`);
    const r = await runActor(platform, inp.queries, { maxItems: st.maxItems, maxTotalChargeUsd: verdict.maxTotalChargeUsd });
    if (r.status === 'not_configured') return { status: 'not_configured', message: 'Set APIFY_TOKEN.', missing: r.missing };
    const cost = r.status === 'ok' ? r.costUsd : (r.costUsd ?? 0);
    costUsd += cost;
    await withService((sql) => sql`update public.social_pulse_runs set status = ${r.status === 'ok' ? 'succeeded' : 'failed'}, apify_run_id = ${('runId' in r && r.runId) || null}, items = ${r.status === 'ok' ? r.items.length : 0}, cost_usd = ${cost}, message = ${r.status === 'error' ? r.message : null} where id = ${row.id}`);
    if (r.status === 'ok') collected.push(...r.items); else notes.push(`${ACTORS[platform].label}: ${r.message}`);
  }

  const seen = await withService(async (sql) => {
    const rows = await sql`select platform, external_id from public.social_pulse_seen where org_id = ${orgId} and seen_at > now() - interval '14 days'`;
    return new Set(rows.map((r) => `${r.platform}:${r.external_id}`));
  });
  const items = prepareItems(collected, { seen, maxItems: st.maxItems * st.platforms.length });
  if (items.length) {
    await withService((sql) => sql`insert into public.social_pulse_seen (org_id, platform, external_id) select ${orgId}, p, e from unnest(${items.map((i) => i.platform)}::text[], ${items.map((i) => i.id)}::text[]) as t(p, e) on conflict do nothing`);
  }
  await withService((sql) => sql`insert into public.social_pulse_settings (org_id, last_run_on) values (${orgId}, current_date) on conflict (org_id) do update set last_run_on = current_date`);
  if (items.length === 0) return { status: 'ok', insights: 0, items: 0, costUsd, notes: [...notes, 'No new discussions in the last 24 hours.'] };

  const a = await analyzeSocial({ orgId, brand: inp.brand, keywords: inp.queries, prompts: inp.prompts, competitors: inp.competitors, items });
  if (a.status === 'not_configured') return { status: 'not_configured', message: 'Set ANTHROPIC_API_KEY.', missing: a.missing };
  if (a.status === 'error') return { status: 'error', message: a.message };
  await withService(async (sql) => {
    for (const i of a.insights) {
      const [ins] = await sql`
        insert into public.social_insights (org_id, title, summary, sentiment, platforms, sources, model)
        values (${orgId}, ${i.title}, ${i.summary}, ${i.sentiment}, ${[...new Set(i.sources.map((s) => s.platform))]}::text[], ${sql.json(i.sources as never)}, 'claude-haiku-5-5') returning id`;
      for (const t of i.titles) await sql`insert into public.title_suggestions (org_id, insight_id, title, rationale, prompt_text) values (${orgId}, ${ins.id}, ${t.title}, ${t.rationale}, ${t.prompt}) on conflict do nothing`;
    }
  });
  const slack = await postPulseToSlack(orgId).catch(() => ({ posted: 0, message: 'Slack post failed' }));
  return { status: 'ok', insights: a.insights.length, items: items.length, costUsd, notes, slack: slack.message };
}

/** Post today's not-yet-posted insights to the org's dedicated channel: one message per insight, a thread with the 3 titles and Approve buttons. */
export async function postPulseToSlack(orgId: string): Promise<{ posted: number; message: string }> {
  if (killSwitchOn()) return { posted: 0, message: 'Global kill switch is on.' };
  const ctx = { orgId, purpose: 'job' as const, worker: 'beacon-social-pulse' };
  const tok = await readSecret(ctx, { stepId: 'chat', fieldId: 'slack_bot_token' });
  if (tok.status === 'not_configured') return { posted: 0, message: `Slack not configured: ${tok.missing.join(', ')}` };
  if (tok.status !== 'ok') return { posted: 0, message: 'Slack bot token missing (finish the Slack step in onboarding).' };
  const st = await withService((sql) => loadPulseSettings(sql, orgId));
  if (!st.slackChannel && !st.slackChannelId) return { posted: 0, message: 'Set a Slack channel name first.' };
  let channelId = st.slackChannelId;
  if (!channelId) {
    const ch = await ensureChannel(tok.value, st.slackChannel!);
    if (!ch.ok) return { posted: 0, message: `Slack channel: ${ch.error}` };
    channelId = ch.channelId;
    await withService((sql) => sql`update public.social_pulse_settings set slack_channel_id = ${channelId} where org_id = ${orgId}`);
  }
  const rows = await withService((sql) => sql`select id, title, summary, sentiment, sources from public.social_insights where org_id = ${orgId} and pulse_date = current_date and slack_ts is null order by created_at limit 5`);
  let posted = 0;
  for (const r of rows) {
    const titles = await withService((sql) => sql`select id, title, rationale from public.title_suggestions where insight_id = ${r.id} and status = 'suggested' order by created_at`);
    const res = await postInsight(tok.value, channelId!, { title: r.title as string, summary: r.summary as string, sentiment: r.sentiment as 'neutral', sources: r.sources as never }, titles.map((t) => ({ id: t.id as string, title: t.title as string, rationale: t.rationale as string })));
    if (!res.ok) return { posted, message: `Slack: ${res.error}` };
    await withService((sql) => sql`update public.social_insights set slack_ts = ${res.ts} where id = ${r.id}`);
    posted++;
  }
  return { posted, message: posted ? `Posted ${posted} insight(s) to Slack.` : 'Nothing new to post.' };
}

import 'server-only';
import type { TxSql } from '../db';
import { createArticle, type StepResult } from '../content-pipeline/run';

export type Runner = <T>(fn: (sql: TxSql) => Promise<T>) => Promise<T>;
export interface Decider { via: 'app' | 'slack'; by: string | null }
export interface ClaimedTitle { id: string; title: string; promptText: string | null; label: string }

/** Persistence + pipeline steps, injectable so the flow is testable without a database or model. */
export interface ApproveDeps {
  /** Atomically move suggested -> approved. Returns null when it was already decided (double click, Slack retry, other channel). */
  claim(id: string, who: Decider): Promise<ClaimedTitle | null>;
  /** A content gap row the existing pipeline can build on. */
  makeGap(t: ClaimedTitle): Promise<string>;
  create(gapId: string, t: ClaimedTitle): Promise<StepResult<{ itemId: string; words: number; notes: string[] }>>;
  finish(id: string, r: { status: 'created' | 'failed'; gapId: string; itemId?: string; error?: string }): Promise<void>;
}
export type ApproveOutcome = { status: 'created'; itemId: string } | { status: 'already_decided' } | { status: 'failed'; error: string; notConfigured?: string[] };

/** Approving a title (in the app or in Slack) runs the full content pipeline: research, brief, article, images, draft. First decision wins. */
export async function approveSuggestion(deps: ApproveDeps, id: string, who: Decider): Promise<ApproveOutcome> {
  const t = await deps.claim(id, who);
  if (!t) return { status: 'already_decided' };
  let gapId = '';
  try {
    gapId = await deps.makeGap(t);
    const r = await deps.create(gapId, t);
    if (!r.ok) { await deps.finish(id, { status: 'failed', gapId, error: r.error }); return { status: 'failed', error: r.error, notConfigured: r.notConfigured }; }
    await deps.finish(id, { status: 'created', gapId, itemId: r.data.itemId });
    return { status: 'created', itemId: r.data.itemId };
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 200) : 'Content creation failed';
    await deps.finish(id, { status: 'failed', gapId, error }).catch(() => undefined);
    return { status: 'failed', error };
  }
}

export function dbApproveDeps(run: Runner, orgId: string, words?: number): ApproveDeps {
  return {
    claim: (id, who) => run(async (sql) => {
      const [r] = await sql`
        update public.title_suggestions s set status = 'approved', decided_via = ${who.via}, decided_by = ${who.by}
        from public.social_insights i
        where s.id = ${id} and s.org_id = ${orgId} and s.status = 'suggested' and i.id = s.insight_id
        returning s.id, s.title, s.prompt_text, i.title as insight_title`;
      return r ? { id: r.id as string, title: r.title as string, promptText: (r.prompt_text as string | null) ?? null, label: `Social pulse: ${r.insight_title as string}`.slice(0, 200) } : null;
    }),
    makeGap: (t) => run(async (sql) => {
      const [g] = await sql`
        insert into public.content_gaps (org_id, group_key, label, sample_prompts, status)
        values (${orgId}, ${`social:${t.id}`}, ${t.label}, ${t.promptText ? [t.promptText] : []}::text[], 'open')
        on conflict (org_id, group_key) do update set label = excluded.label returning id`;
      return g.id as string;
    }),
    create: (gapId, t) => createArticle(run, { orgId, gapId, title: t.title, promptText: t.promptText ?? t.title, words }),
    finish: (id, r) => run(async (sql) => {
      await sql`update public.title_suggestions set status = ${r.status}, gap_id = ${r.gapId || null}, item_id = ${r.itemId ?? null}, error = ${r.error ?? null} where id = ${id} and org_id = ${orgId}`;
      if (r.status === 'failed' && r.gapId) await sql`update public.content_gaps set status = 'dismissed' where id = ${r.gapId} and org_id = ${orgId} and status = 'open'`;
    }),
  };
}

export async function rejectSuggestion(run: Runner, orgId: string, id: string, who: Decider): Promise<boolean> {
  return run(async (sql) => (await sql`update public.title_suggestions set status = 'rejected', decided_via = ${who.via}, decided_by = ${who.by} where id = ${id} and org_id = ${orgId} and status = 'suggested' returning id`).length > 0);
}

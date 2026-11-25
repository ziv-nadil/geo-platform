import 'server-only';
import { getPlanLimits, getUsage } from '../../billing/limits';
import { orgQuery } from './_run';
import type { QueryResult } from './types';

export interface SuggestionRow {
  id: string; text: string; cluster: string; topic: string | null; persona: string | null; funnel: string | null;
  sources: string[]; volume: number | null; intent: number; competitorPresence: number; score: number;
}
export interface SuggestionsData { rows: SuggestionRow[]; remaining: number | null; limit: number | null }

export async function listSuggestions(orgId: string): Promise<QueryResult<SuggestionsData>> {
  return orgQuery(orgId, async (sql) => {
    const rows = await sql`select * from public.prompt_suggestions where org_id = ${orgId} and status = 'new' order by score desc limit 100`;
    const [limits, usage] = await Promise.all([getPlanLimits(sql, orgId), getUsage(sql, orgId)]);
    return {
      rows: rows.map((r) => ({ id: r.id, text: r.text, cluster: r.cluster_key, topic: r.topic_name, persona: r.persona_name, funnel: r.funnel_stage, sources: r.sources, volume: r.volume, intent: Number(r.intent), competitorPresence: Number(r.competitor_presence), score: Number(r.score) })),
      limit: limits.prompts, remaining: limits.prompts === null ? null : Math.max(0, limits.prompts - usage.prompts),
    };
  });
}

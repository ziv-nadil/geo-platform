import 'server-only';
import { day, iso, num, orgQuery, window } from './_run';
import type { Filters, QueryResult, Sentiment, SentimentReport } from './types';

/** Sentiment of brand mentions. */
export async function getSentiment(orgId: string, filters: Filters = {}): Promise<QueryResult<SentimentReport>> {
  const w = window(filters);
  return orgQuery(orgId, async (sql) => {
    const eng = w.engines ? sql`and pr.engine_id = any(${w.engines}::text[])` : sql``;
    const topic = w.topicId ? sql`and p.topic_id = ${w.topicId}` : sql``;
    const base = sql`
      from public.mentions m
      join public.prompt_runs pr on pr.id = m.prompt_run_id
      join public.prompts p on p.id = pr.prompt_id
      where m.org_id = ${orgId} and m.entity_type = 'brand'
        and pr.run_at >= ${w.from}::date and pr.run_at < ${w.to}::date + 1 ${eng} ${topic}`;
    const cols = sql`
      count(*) filter (where m.sentiment = 'positive')::int as positive,
      count(*) filter (where m.sentiment = 'neutral')::int as neutral,
      count(*) filter (where m.sentiment = 'negative')::int as negative,
      round(avg(m.sentiment_score), 3)::float8 as average`;
    const [totals] = await sql`select ${cols} ${base}`;
    const series = await sql`select (pr.run_at at time zone 'utc')::date as day, ${cols} ${base} group by 1 order by 1`;
    const byEngine = await sql`select pr.engine_id, ${cols} ${base} group by 1 order by 1`;
    const samples = await sql`
      select m.snippet, m.sentiment::text as sentiment, pr.engine_id, p.text as prompt_text, pr.run_at
      ${base} and m.snippet is not null and m.sentiment is not null
      order by abs(coalesce(m.sentiment_score, 0)) desc, pr.run_at desc limit 12`;
    const pack = (r: Record<string, unknown>) => ({ positive: Number(r.positive), neutral: Number(r.neutral), negative: Number(r.negative), average: num(r.average) });
    return {
      totals: pack(totals),
      series: series.map((r) => ({ day: day(r.day), ...pack(r) })),
      byEngine: byEngine.map((r) => ({ engineId: r.engine_id as string, ...pack(r) })),
      samples: samples.map((r) => ({ snippet: r.snippet, sentiment: r.sentiment as Sentiment, engineId: r.engine_id, promptText: r.prompt_text, runAt: iso(r.run_at)! })),
    };
  });
}

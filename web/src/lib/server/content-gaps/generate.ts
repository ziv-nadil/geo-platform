import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { allowlistedFetch } from '../../engines/http';
import { buildJsonLd } from '../../content-gaps/jsonld';
import { LISTICLE_SCHEMA, parseListicle, renderMarkdown, type ListicleDoc } from '../../content-gaps/listicle';
import type { TxSql } from '../db';

export const LISTICLE_MODEL = 'claude-sonnet-5-5';

export interface BrandContext {
  name: string; domain: string | null; description: string | null; tagline: string | null;
  say: string[]; dontSay: { term: string; replacement: string | null }[];
  messaging: { kind: string; title: string | null; content: string }[]; // pillars, claims (claimed numbers), proof points
  competitors: { name: string; domain: string | null }[];
  tone: unknown;
}

export async function loadBrandContext(sql: TxSql, orgId: string): Promise<BrandContext> {
  const [org] = await sql`select o.name, o.website from public.organizations o where o.id = ${orgId}`;
  const [p] = await sql`select display_name, tagline, description from public.brand_profiles where org_id = ${orgId}`;
  const [kit] = await sql`select style from public.brand_kits where org_id = ${orgId}`;
  const voice = await sql`select kind::text as kind, term, replacement from public.brand_voice_terms where org_id = ${orgId}`;
  const messaging = await sql`select kind::text as kind, title, content from public.brand_messaging where org_id = ${orgId} and kind in ('pillar','claim','proof_point','faq') order by sort_order`;
  const comps = await sql`select name, domain from public.competitors where org_id = ${orgId} and active order by name`;
  return {
    name: (p?.display_name as string) || (org?.name as string) || 'The brand', domain: (org?.website as string | null) ?? null,
    description: (p?.description as string | null) ?? null, tagline: (p?.tagline as string | null) ?? null,
    say: voice.filter((v) => v.kind === 'use').map((v) => v.term as string),
    dontSay: voice.filter((v) => v.kind === 'avoid').map((v) => ({ term: v.term as string, replacement: (v.replacement as string | null) ?? null })),
    messaging: messaging.map((m) => ({ kind: m.kind as string, title: m.title as string | null, content: m.content as string })),
    competitors: comps.map((c) => ({ name: c.name as string, domain: c.domain as string | null })), tone: kit?.style?.tone ?? null,
  };
}

export interface GapInput { label: string; samplePrompts: string[]; competitors: { name: string }[]; topDomains: { domain: string; citations: number }[]; }

export function buildPrompt(gap: GapInput, b: BrandContext): { system: string; user: string } {
  const system =
    'You write honest, useful "Top N" listicles that the brand publishes on its OWN website. Rules: ' +
    `(1) include ${b.name} as one item with is_client=true, positioned truthfully, never ranked #1 unless it genuinely best fits the stated criteria; credit competitors where they are stronger and state real cons for every item including ${b.name}. ` +
    '(2) Use ONLY facts in the brand context for claims about the brand, and only numbers listed under claims/proof_points; never invent statistics, awards, prices or customers. For other products, state only widely known facts and mark uncertain details as "check current pricing". ' +
    '(3) Follow the brand voice: prefer the "say" terms, never use the "don\'t say" terms. ' +
    '(4) Add a comparison table with 3-5 factual columns, 4-6 FAQ entries answering the sample prompts, and citations only with URLs you are given or that are official product sites. Leave url empty when unknown. ' +
    '(5) Disclose in methodology that the page is published by the brand.';
  const user = JSON.stringify({
    task: 'Write the listicle for this content gap.',
    gap: { topic_persona_funnel: gap.label, prompts_people_ask_ai: gap.samplePrompts, competitors_ai_recommends_instead: gap.competitors.map((c) => c.name), sources_ai_cites: gap.topDomains },
    brand_context: { name: b.name, website: b.domain, tagline: b.tagline, description: b.description, say: b.say, dont_say: b.dontSay, tone: b.tone, messaging: b.messaging, known_competitors: b.competitors },
  });
  return { system, user };
}

export type GenerateResult =
  | { status: 'ok'; doc: ListicleDoc; markdown: string; jsonLd: ReturnType<typeof buildJsonLd>; model: string; usage: { input: number; output: number } }
  | { status: 'not_configured'; missing: string[] }
  | { status: 'error'; message: string };

export async function generateListicle(gap: GapInput, brand: BrandContext): Promise<GenerateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { status: 'not_configured', missing: ['ANTHROPIC_API_KEY'] };
  const { system, user } = buildPrompt(gap, brand);
  try {
    const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 180_000, fetch: allowlistedFetch('anthropic', { timeoutMs: 180_000 }) });
    const msg = await client.messages.create({
      model: LISTICLE_MODEL, max_tokens: 12_000, system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: LISTICLE_SCHEMA as unknown as Record<string, unknown> } },
    });
    if (msg.stop_reason === 'refusal') return { status: 'error', message: 'The model declined this request.' };
    if (msg.stop_reason === 'max_tokens') return { status: 'error', message: 'The draft was cut off. Try again.' };
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const doc = parseListicle(JSON.parse(text));
    if (!doc) return { status: 'error', message: 'The model returned an unusable draft. Try again.' };
    return { status: 'ok', doc, markdown: renderMarkdown(doc), jsonLd: buildJsonLd(doc, null), model: LISTICLE_MODEL, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message.slice(0, 200) : 'Generation failed' };
  }
}

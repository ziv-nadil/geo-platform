import 'server-only';
import type { TxSql } from '../db';
import { createSupabaseAdminClient } from '../supabase/admin';
import { loadBrandContext, type BrandContext } from '../content-gaps/generate';

export interface ClientContext {
  brand: BrandContext;
  profile: { industry: string | null; valueProps: string[]; differentiators: string[]; products: unknown; targetMarkets: string[] };
  personas: { name: string; role: string | null; pains: string[]; goals: string[] }[];
  kitStyle: unknown;
  docs: { filename: string; excerpt: string }[];
}

const TEXT_MIME = /^(text\/|application\/(json|xml)|application\/x-yaml)/;

/** Brand book + kit + personas + competitors + messaging + claimed numbers + say/don't-say (via loadBrandContext) + readable uploaded docs. */
export async function loadClientContext(sql: TxSql, orgId: string): Promise<ClientContext> {
  const brand = await loadBrandContext(sql, orgId);
  const [p] = await sql`select industry, value_props, differentiators, products, target_markets from public.brand_profiles where org_id = ${orgId}`;
  const [kit] = await sql`select style from public.brand_kits where org_id = ${orgId}`;
  const personas = await sql`select name, role_title, pain_points, goals from public.brand_personas where org_id = ${orgId} order by sort_order limit 6`;
  const assets = await sql`select storage_path, filename, mime_type from public.brand_assets where org_id = ${orgId} and (mime_type ~ '^text/' or filename ~* '\\.(md|txt|csv|json)$') order by created_at desc limit 5`;
  const docs: ClientContext['docs'] = [];
  const admin = assets.length ? createSupabaseAdminClient() : null;
  if (admin) {
    for (const a of assets) {
      if (a.mime_type && !TEXT_MIME.test(a.mime_type as string)) continue;
      const { data } = await admin.storage.from('brand-assets').download(a.storage_path as string);
      if (data) docs.push({ filename: a.filename as string, excerpt: (await data.text()).slice(0, 6000) });
    }
  }
  return {
    brand, kitStyle: kit?.style ?? null, docs,
    profile: { industry: (p?.industry as string | null) ?? null, valueProps: (p?.value_props as string[]) ?? [], differentiators: (p?.differentiators as string[]) ?? [], products: p?.products ?? [], targetMarkets: (p?.target_markets as string[]) ?? [] },
    personas: personas.map((r) => ({ name: r.name as string, role: (r.role_title as string | null) ?? null, pains: ((r.pain_points as string[]) ?? []).slice(0, 4), goals: ((r.goals as string[]) ?? []).slice(0, 4) })),
  };
}

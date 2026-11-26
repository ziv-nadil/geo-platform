/**
 * Idempotently create Stripe products + monthly/annual prices for every paid plan in public.plans
 * and write the ids back (plans.stripe_product_id / stripe_price_id / stripe_price_id_annual).
 *
 *   STRIPE_SECRET_KEY=sk_... DATABASE_URL=postgres://... node --experimental-strip-types scripts/stripe-setup.ts
 *
 * Re-runs are safe: products are matched by metadata.beacon_plan_id, prices by lookup_key
 * (beacon_<plan>_<month|year>); a price whose amount changed is replaced via transfer_lookup_key.
 * Without STRIPE_SECRET_KEY it prints { status: "not_configured" } and exits 0.
 */
import { createRequire } from 'node:module';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const Stripe = require('stripe');
const postgres = require('postgres');

const PLAN_IDS = ['starter', 'growth', 'agency'];
const missing = ['STRIPE_SECRET_KEY', 'DATABASE_URL'].filter((n) => !process.env[n]);
if (missing.length) {
  console.log(JSON.stringify({ status: 'not_configured', missing }));
  process.exit(0);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { appInfo: { name: 'beacon-geo-setup' } });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const fmt = (n: number | null, one: string) => (n === null ? `Unlimited ${one}s` : `${n} ${one}${n === 1 ? '' : 's'}`);

try {
  const plans = await sql`select * from public.plans where id = any(${PLAN_IDS}) and active order by sort_order`;
  const existing = new Map<string, any>();
  for await (const p of stripe.products.list({ active: true, limit: 100 })) if (p.metadata?.beacon_plan_id) existing.set(p.metadata.beacon_plan_id, p);

  for (const plan of plans) {
    const params = {
      name: `ASO Engine ${plan.name}`,
      description: plan.description ?? undefined,
      metadata: { beacon_plan_id: plan.id, seat_limit: String(plan.seat_limit ?? 'unlimited'), prompt_limit: String(plan.prompt_limit ?? 'unlimited'), engine_limit: String(plan.engine_limit ?? 'unlimited') },
      marketing_features: [{ name: fmt(plan.seat_limit, 'seat') }, { name: fmt(plan.prompt_limit, 'tracked prompt') }, { name: fmt(plan.engine_limit, 'AI engine') }],
    };
    const product = existing.has(plan.id) ? await stripe.products.update(existing.get(plan.id).id, params) : await stripe.products.create(params);

    const ids: Record<string, string> = {};
    for (const [interval, cents] of [['month', plan.monthly_price_cents], ['year', plan.annual_price_cents ?? plan.monthly_price_cents * 10]] as const) {
      const lookup = `beacon_${plan.id}_${interval}`;
      const [found] = (await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 })).data;
      if (found && found.unit_amount === cents && found.product === product.id) ids[interval] = found.id;
      else {
        const price = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: cents, recurring: { interval }, lookup_key: lookup, transfer_lookup_key: true });
        ids[interval] = price.id;
      }
    }
    await sql`update public.plans set stripe_product_id = ${product.id}, stripe_price_id = ${ids.month}, stripe_price_id_annual = ${ids.year},
              annual_price_cents = ${plan.annual_price_cents ?? plan.monthly_price_cents * 10} where id = ${plan.id}`;
    console.log(`${plan.id}: product ${product.id} month ${ids.month} year ${ids.year}`);
  }
} finally {
  await sql.end();
}

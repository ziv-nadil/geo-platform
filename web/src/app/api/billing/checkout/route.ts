import { billingEnabled } from '@/lib/server/env';
import { auditEvent, checkOrigin, json, notConfiguredResponse, requireOrgAccess } from '@/lib/server/auth';
import { withService } from '@/lib/server/db';
import { getStripe } from '@/lib/server/stripe';

/** POST /api/billing/checkout  body { orgId, planId, interval: 'month' | 'year' } (admin+) -> { url } of a Stripe Checkout Session. */
export async function POST(request: Request) {
  if (!billingEnabled()) return json({ error: 'billing_disabled' }, 404);
  const bad = checkOrigin(request);
  if (bad) return bad;
  const body = (await request.json().catch(() => null)) as { orgId?: string; planId?: string; interval?: string } | null;
  const orgId = body?.orgId ?? '';
  const planId = body?.planId ?? '';
  const interval = body?.interval === 'year' ? 'year' : body?.interval === 'month' ? 'month' : null;
  if (!planId || !interval) return json({ error: 'invalid_request' }, 400);
  // requireOrgAccess enforces membership, role and the MFA rule (aal2 when a factor/org policy demands it).
  const auth = await requireOrgAccess(orgId, 'admin');
  if (!auth.ok) return auth.response;
  const stripe = getStripe();
  if (!stripe) return notConfiguredResponse(['STRIPE_SECRET_KEY']);

  const found = await withService(async (sql) => {
    const [org] = await sql`select id, slug, name, stripe_customer_id from public.organizations where id = ${orgId}`;
    const [plan] = await sql`select id, stripe_price_id, stripe_price_id_annual from public.plans where id = ${planId} and active`;
    const [sub] = await sql`select 1 as x from public.subscriptions where org_id = ${orgId} and status in ('active', 'trialing', 'past_due')`;
    return { org, plan, hasSub: !!sub };
  });
  if (!found.org || !found.plan) return json({ error: 'not_found' }, 404);
  const price = interval === 'year' ? found.plan.stripe_price_id_annual : found.plan.stripe_price_id;
  if (!price) return notConfiguredResponse(['stripe prices (run scripts/stripe-setup.ts)']);
  if (found.hasSub) return json({ error: 'already_subscribed', hint: 'Use the billing portal to change plan.' }, 409);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  try {
    let customer = found.org.stripe_customer_id as string | null;
    if (!customer) {
      const c = await stripe.customers.create({ name: found.org.name as string, metadata: { org_id: orgId } }, { idempotencyKey: `beacon-cust-${orgId}` });
      customer = c.id;
      await withService((sql) => sql`update public.organizations set stripe_customer_id = ${customer} where id = ${orgId} and stripe_customer_id is null`);
    }
    const back = `${base}/app/${found.org.slug}/settings`;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: orgId,
      line_items: [{ price: price as string, quantity: 1 }],
      subscription_data: { metadata: { org_id: orgId, plan_id: found.plan.id as string } },
      metadata: { org_id: orgId, plan_id: found.plan.id as string },
      allow_promotion_codes: true,
      success_url: `${back}?checkout=success`,
      cancel_url: `${back}?checkout=cancelled`,
    });
    await auditEvent({ orgId, caller: auth, action: 'billing.checkout_started', targetType: 'plan', targetId: found.plan.id as string, metadata: { interval } });
    return json({ url: session.url });
  } catch {
    return json({ error: 'stripe_error' }, 502);
  }
}

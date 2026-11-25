import 'server-only';
import Stripe from 'stripe';
import { withService } from './db';

/** Stripe client (null when STRIPE_SECRET_KEY is missing). Pinned to the SDK's API version. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: 'beacon-geo' } }) : null;
}

type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused';
const ts = (n: number | null | undefined) => (n ? new Date(n * 1000).toISOString() : null);

/**
 * Mirror a subscription into public.subscriptions. Always re-fetches from the Stripe API
 * (never trusts the webhook payload for entitlements, security.md §6.2). The org is resolved
 * from subscription.metadata.org_id or organizations.stripe_customer_id.
 */
export async function syncSubscription(stripe: Stripe, subscriptionId: string): Promise<{ orgId: string | null }> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] });
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  return withService(async (sql) => {
    const metaOrg = sub.metadata?.org_id ?? null;
    const [org] = metaOrg
      ? await sql`select id from public.organizations where id = ${metaOrg}`
      : await sql`select id from public.organizations where stripe_customer_id = ${customerId}`;
    if (!org) return { orgId: null };
    const [plan] = priceId ? await sql`select id from public.plans where stripe_price_id = ${priceId}` : [];
    await sql`
      insert into public.subscriptions (org_id, plan_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, seats,
        current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_end)
      values (${org.id}, ${plan?.id ?? null}, ${customerId}, ${sub.id}, ${priceId}, ${sub.status as SubStatus}, ${item?.quantity ?? 1},
        ${ts(item?.current_period_start)}, ${ts(item?.current_period_end)}, ${sub.cancel_at_period_end}, ${ts(sub.canceled_at)}, ${ts(sub.trial_end)})
      on conflict (stripe_subscription_id) do update set
        plan_id = excluded.plan_id, stripe_price_id = excluded.stripe_price_id, status = excluded.status, seats = excluded.seats,
        current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end, canceled_at = excluded.canceled_at, trial_end = excluded.trial_end`;
    await sql`update public.organizations set stripe_customer_id = coalesce(stripe_customer_id, ${customerId}) where id = ${org.id}`;
    if (plan && ['active', 'trialing'].includes(sub.status)) await sql`update public.organizations set plan = ${plan.id} where id = ${org.id}`;
    return { orgId: org.id as string };
  });
}

import type Stripe from 'stripe';
import { json, notConfiguredResponse } from '@/lib/server/auth';
import { dbConfigured, withService } from '@/lib/server/db';
import { getStripe, syncSubscription } from '@/lib/server/stripe';


/**
 * POST /api/stripe/webhook — Stripe events. Verifies the signature on the raw body, records
 * event ids for idempotency (stripe_events), and re-fetches subscriptions from the API.
 * Excluded from the auth proxy matcher.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return notConfiguredResponse(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'].filter((n) => !process.env[n]));
  if (!dbConfigured()) return notConfiguredResponse(['DATABASE_URL']);
  const sig = request.headers.get('stripe-signature');
  if (!sig) return json({ error: 'missing_signature' }, 400);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), sig, secret);
  } catch {
    return json({ error: 'invalid_signature' }, 400);
  }

  const fresh = await withService(async (sql) => {
    const r = await sql`insert into public.stripe_events (id, type) values (${event.id}, ${event.type}) on conflict (id) do nothing returning id`;
    return r.length > 0;
  });
  if (!fresh) return json({ received: true, duplicate: true });

  try {
    let subscriptionId: string | null = null;
    let orgFromCheckout: string | null = null;
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        subscriptionId = typeof s.subscription === 'string' ? s.subscription : (s.subscription?.id ?? null);
        orgFromCheckout = s.client_reference_id ?? s.metadata?.org_id ?? null;
        const customer = typeof s.customer === 'string' ? s.customer : (s.customer?.id ?? null);
        if (orgFromCheckout && customer) {
          await withService((sql) => sql`update public.organizations set stripe_customer_id = coalesce(stripe_customer_id, ${customer}) where id = ${orgFromCheckout}`);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        subscriptionId = (event.data.object as Stripe.Subscription).id;
        break;
      default:
        break;
    }
    let orgId: string | null = orgFromCheckout;
    if (subscriptionId) orgId = (await syncSubscription(stripe, subscriptionId)).orgId ?? orgId;
    await withService(async (sql) => {
      await sql`update public.stripe_events set processed_at = now() where id = ${event.id}`;
      if (orgId) {
        await sql`insert into public.audit_events (org_id, actor_kind, action, target_type, target_id, metadata)
                  values (${orgId}, 'system', ${`billing.${event.type}`}, 'stripe_event', ${event.id}, '{}'::jsonb)`;
      }
    });
    return json({ received: true });
  } catch (e) {
    await withService((sql) => sql`update public.stripe_events set error = ${e instanceof Error ? e.message.slice(0, 300) : 'error'} where id = ${event.id}`);
    // Let Stripe retry: remove the idempotency row so the retry is processed.
    await withService((sql) => sql`delete from public.stripe_events where id = ${event.id} and processed_at is null`);
    return json({ error: 'processing_failed' }, 500);
  }
}

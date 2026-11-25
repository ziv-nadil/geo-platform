import 'server-only';
import type Stripe from 'stripe';
import { withService } from './db';
import { syncSubscription } from './stripe';

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : (v?.id ?? null));

/** Subscription id of an invoice (Stripe API >= 2025-03 nests it under parent.subscription_details). */
export function invoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  return idOf(inv.parent?.subscription_details?.subscription ?? null);
}

export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
] as const;

/**
 * Apply one verified Stripe event. Entitlements always come from re-fetching the subscription
 * (syncSubscription), never from the payload. Returns the affected org (for the audit log).
 */
export async function handleStripeEvent(stripe: Stripe, event: Stripe.Event): Promise<{ orgId: string | null }> {
  let subscriptionId: string | null = null;
  let orgId: string | null = null;
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      subscriptionId = idOf(s.subscription);
      orgId = s.client_reference_id ?? s.metadata?.org_id ?? null;
      const customer = idOf(s.customer);
      if (orgId && customer) {
        await withService((sql) => sql`update public.organizations set stripe_customer_id = coalesce(stripe_customer_id, ${customer}) where id = ${orgId}`);
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
    case 'invoice.paid':
    case 'invoice.payment_failed':
      subscriptionId = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
      break;
    default:
      break;
  }
  if (subscriptionId) orgId = (await syncSubscription(stripe, subscriptionId)).orgId ?? orgId;
  return { orgId };
}

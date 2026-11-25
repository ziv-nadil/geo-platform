import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries: string[] = [];
vi.mock('../db', () => ({
  withService: async (fn: (sql: unknown) => unknown) => fn(async (strings: TemplateStringsArray) => { queries.push(strings.join('?')); return []; }),
}));
const syncSubscription = vi.fn(async () => ({ orgId: 'org-1' }));
vi.mock('../stripe', () => ({ syncSubscription: (...a: unknown[]) => (syncSubscription as (...x: unknown[]) => unknown)(...a), getStripe: () => null }));

import { handleStripeEvent, invoiceSubscriptionId } from '../stripe-events';

const secret = 'whsec_test_secret';
const stripe = new Stripe('sk_test_dummy');
const ev = (type: string, object: unknown) => ({ id: `evt_${type}`, object: 'event', type, data: { object } }) as unknown as Stripe.Event;

beforeEach(() => { queries.length = 0; syncSubscription.mockClear(); });

describe('signature verification', () => {
  const payload = JSON.stringify(ev('invoice.paid', { id: 'in_1' }));
  it('accepts a correctly signed payload', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.webhooks.constructEvent(payload, header, secret).type).toBe('invoice.paid');
  });
  it('rejects a bad secret, tampered body and missing header', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' });
    expect(() => stripe.webhooks.constructEvent(payload, header, secret)).toThrow();
    const good = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => stripe.webhooks.constructEvent(payload + ' ', good, secret)).toThrow();
    expect(() => stripe.webhooks.constructEvent(payload, '', secret)).toThrow();
  });
});

describe('handleStripeEvent', () => {
  it.each(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'])('%s re-syncs the subscription', async (t) => {
    const r = await handleStripeEvent(stripe, ev(t, { id: 'sub_1' }));
    expect(syncSubscription).toHaveBeenCalledWith(stripe, 'sub_1');
    expect(r.orgId).toBe('org-1');
  });
  it('checkout.session.completed links the customer and syncs the subscription', async () => {
    await handleStripeEvent(stripe, ev('checkout.session.completed', { client_reference_id: 'org-1', customer: 'cus_1', subscription: 'sub_9' }));
    expect(queries.some((q) => q.includes('stripe_customer_id'))).toBe(true);
    expect(syncSubscription).toHaveBeenCalledWith(stripe, 'sub_9');
  });
  it.each(['invoice.paid', 'invoice.payment_failed'])('%s syncs via the invoice subscription', async (t) => {
    await handleStripeEvent(stripe, ev(t, { id: 'in_1', parent: { subscription_details: { subscription: 'sub_2' } } }));
    expect(syncSubscription).toHaveBeenCalledWith(stripe, 'sub_2');
  });
  it('ignores invoices without a subscription and unknown events', async () => {
    expect(invoiceSubscriptionId({ id: 'in_x', parent: null } as unknown as Stripe.Invoice)).toBeNull();
    await handleStripeEvent(stripe, ev('invoice.paid', { id: 'in_x', parent: null }));
    await handleStripeEvent(stripe, ev('charge.refunded', { id: 'ch_1' }));
    expect(syncSubscription).not.toHaveBeenCalled();
  });
});

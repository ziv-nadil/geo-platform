import { billingEnabled } from '@/lib/server/env';
import { json, notConfiguredResponse, requireOrgAccess } from '@/lib/server/auth';
import { withService } from '@/lib/server/db';
import { getStripe } from '@/lib/server/stripe';

/** GET /api/billing/invoices?orgId= (admin+) -> { invoices } from the Stripe API (latest 12). */
export async function GET(request: Request) {
  if (!billingEnabled()) return json({ error: 'billing_disabled' }, 404);
  const orgId = new URL(request.url).searchParams.get('orgId') ?? '';
  const auth = await requireOrgAccess(orgId, 'admin');
  if (!auth.ok) return auth.response;
  const stripe = getStripe();
  if (!stripe) return notConfiguredResponse(['STRIPE_SECRET_KEY']);
  const [org] = await withService((sql) => sql`select stripe_customer_id from public.organizations where id = ${orgId}`);
  if (!org?.stripe_customer_id) return json({ invoices: [] });
  try {
    const list = await stripe.invoices.list({ customer: org.stripe_customer_id as string, limit: 12 });
    return json({
      invoices: list.data.map((i) => ({
        id: i.id, number: i.number, status: i.status, currency: i.currency, amountPaid: i.amount_paid, amountDue: i.amount_due,
        created: new Date(i.created * 1000).toISOString(), hostedUrl: i.hosted_invoice_url ?? null, pdf: i.invoice_pdf ?? null,
      })),
    });
  } catch {
    return json({ error: 'stripe_error' }, 502);
  }
}

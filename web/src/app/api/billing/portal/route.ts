import { auditEvent, checkOrigin, json, notConfiguredResponse, requireOrgAccess } from '@/lib/server/auth';
import { withService } from '@/lib/server/db';
import { getStripe } from '@/lib/server/stripe';

/** POST /api/billing/portal  body { orgId } (owner/admin) -> { url } of a Stripe Customer Portal session. */
export async function POST(request: Request) {
  const bad = checkOrigin(request);
  if (bad) return bad;
  const body = (await request.json().catch(() => null)) as { orgId?: string } | null;
  const orgId = body?.orgId ?? '';
  const auth = await requireOrgAccess(orgId, 'admin');
  if (!auth.ok) return auth.response;
  const stripe = getStripe();
  if (!stripe) return notConfiguredResponse(['STRIPE_SECRET_KEY']);

  const [org] = await withService((sql) => sql`select stripe_customer_id from public.organizations where id = ${orgId}`);
  if (!org?.stripe_customer_id) return json({ error: 'no_billing_account' }, 404);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  try {
    const session = await stripe.billingPortal.sessions.create({ customer: org.stripe_customer_id as string, return_url: `${base}/app` });
    await auditEvent({ orgId, caller: auth, action: 'billing.portal_opened', targetType: 'org', targetId: orgId });
    return json({ url: session.url });
  } catch {
    return json({ error: 'stripe_error' }, 502);
  }
}

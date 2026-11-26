import 'server-only';
import { render } from '@react-email/render';
import type { Sql } from '../db';
import { DigestEmail } from '@/lib/email/digest';
import { collectReport } from '../reports/collect';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Send via Resend's REST API (no SDK needed). Returns not_configured without RESEND_API_KEY. */
export async function sendEmail(to: string, subject: string, html: string): Promise<{ status: 'sent' | 'error'; message?: string }> {
  const key = process.env.RESEND_API_KEY!;
  const from = process.env.DIGEST_FROM_EMAIL ?? 'ASO Engine <digest@beacongeo.com>';
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to, subject, html }), signal: AbortSignal.timeout(15_000) });
  return r.ok ? { status: 'sent' } : { status: 'error', message: `resend HTTP ${r.status}` };
}

/** Weekly digest for every active org: members who have not opted out get the last 7 days vs the 7 before. */
export async function runDigest(sql: Sql, now = new Date()) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const to = iso(new Date(now.getTime() - 86_400_000));
  const from = iso(new Date(now.getTime() - 7 * 86_400_000));
  const orgs = await sql`select id, name, slug from public.organizations where status = 'active'`;
  const summary = { orgs: orgs.length, sent: 0, failed: 0, optedOut: 0 };
  for (const o of orgs) {
    const orgId = o.id as string;
    const members = await sql`
      select p.email::text as email, p.digest_opt_out from public.memberships m join public.profiles p on p.id = m.user_id
      where m.org_id = ${orgId} and p.email is not null`;
    const recipients = members.filter((m) => !m.digest_opt_out);
    summary.optedOut += members.length - recipients.length;
    if (!recipients.length) continue;
    const data = await collectReport(sql, orgId, from, to);
    const html = await render(DigestEmail({ orgName: o.name as string, data, appUrl: `${appUrl}/app/${o.slug}`, unsubscribeUrl: `${appUrl}/app/${o.slug}/settings` }));
    for (const m of recipients) {
      const r = await sendEmail(m.email as string, `${o.name}: your weekly AI visibility digest`, html).catch(() => ({ status: 'error' as const }));
      if (r.status === 'sent') summary.sent++; else summary.failed++;
    }
  }
  return summary;
}

import 'server-only';
import { createHmac } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { result, str, type Check, type Tester } from './types';

export const DNS_TXT_NAME = '_beacon-verify';

/** Per-org verification token: HMAC(DNS_VERIFY_SECRET, orgId). Stable, unguessable, not stored. */
export function dnsTxtValue(orgId: string): string | null {
  const secret = process.env.DNS_VERIFY_SECRET;
  if (!secret) return null;
  return `beacon-verify=${createHmac('sha256', secret).update(orgId).digest('hex').slice(0, 32)}`;
}

async function txt(server: string | null, name: string): Promise<string[] | null> {
  const r = new Resolver({ timeout: 4000, tries: 2 });
  if (server) r.setServers([server]);
  try {
    return (await r.resolveTxt(name)).map((parts) => parts.join(''));
  } catch {
    return null;
  }
}

export const test: Tester = async (ctx) => {
  const domain = str(ctx.data.dns_domain)?.toLowerCase().replace(/^www\./, '');
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return result([], ['dns_domain']);
  const expected = dnsTxtValue(ctx.orgId);
  if (!expected) return result([], ['DNS_VERIFY_SECRET'], true);
  const name = `${DNS_TXT_NAME}.${domain}`;
  const clean = (v: string) => v.trim().replace(/^"|"$/g, '');
  const checks: Check[] = [];

  const [cf, goog] = await Promise.all([txt('1.1.1.1', name), txt('8.8.8.8', name)]);
  const onCf = !!cf?.some((v) => clean(v) === expected);
  const onG = !!goog?.some((v) => clean(v) === expected);
  checks.push({ id: 'dns_txt_present', label: 'TXT record found', ok: onCf && onG,
    detail: onCf && onG ? `${name} found on 1.1.1.1 and 8.8.8.8` : onCf || onG ? 'Found on one resolver only: propagation in progress' : `No matching TXT at ${name}` });

  const r = new Resolver({ timeout: 4000, tries: 2 });
  let authOk = false;
  let detail = 'could not resolve nameservers';
  try {
    const ns = await r.resolveNs(domain);
    for (const host of ns.slice(0, 3)) {
      const ips = await r.resolve4(host).catch(() => [] as string[]);
      if (!ips[0]) continue;
      const vals = await txt(ips[0], name);
      authOk = !!vals?.some((v) => clean(v) === expected);
      detail = authOk ? `authoritative ${host} has the record` : `authoritative ${host} does not have the record (added at a provider that is not authoritative?)`;
      break;
    }
  } catch {
    /* keep detail */
  }
  checks.push({ id: 'dns_authoritative_match', label: 'Authoritative nameserver match', ok: authOk, detail });
  return result(checks, authOk && onCf && onG ? [] : [`TXT ${name} = ${expected}`]);
};

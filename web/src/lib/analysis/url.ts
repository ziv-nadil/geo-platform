/**
 * URL normalization for citation dedupe and domain-level share
 * (docs/research/ai-engine-methodology.md section 3.5).
 */
import { getDomain, getHostname } from 'tldts';

const TRACKING_PARAMS = new Set([
  'gclid',
  'fbclid',
  'msclkid',
  'dclid',
  'yclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'srsltid',
  '_hsenc',
  '_hsmi',
  'igshid',
]);

function isTrackingParam(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith('utm_') || TRACKING_PARAMS.has(n);
}

/**
 * Lowercase host, strip `www.`, drop tracking params and fragment, sort remaining params, drop a
 * trailing slash (except root), force https. Returns the input trimmed if it isn't a URL.
 */
export function canonicalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return raw.trim();
  u.protocol = 'https:';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  u.hash = '';
  u.username = '';
  u.password = '';
  if ((u.port === '443' || u.port === '80')) u.port = '';
  const kept = [...u.searchParams.entries()].filter(([k]) => !isTrackingParam(k));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = '';
  for (const [k, v] of kept) u.searchParams.append(k, v);
  if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  let out = u.toString();
  if (u.pathname === '/' && !u.search) out = out.replace(/\/$/, '');
  return out;
}

/** Registrable domain via the Public Suffix List ("blog.acme.co.uk" -> "acme.co.uk"). */
export function registrableDomain(urlOrHost: string): string {
  const input = urlOrHost.trim().toLowerCase();
  const d = getDomain(input, { allowPrivateDomains: false });
  if (d) return d;
  const h = getHostname(input);
  return (h ?? input).replace(/^www\./, '');
}

/** Hostname without www. */
export function hostOf(url: string): string {
  return (getHostname(url) ?? '').toLowerCase().replace(/^www\./, '');
}

/** Strip scheme/path from a configured domain ("https://www.Acme.com/" -> "acme.com"). */
export function normalizeDomain(d: string): string {
  const s = d.trim().toLowerCase();
  if (!s) return s;
  const host = s.includes('://') ? hostOf(s) : s.replace(/\/.*$/, '').replace(/^www\./, '');
  return registrableDomain(host) || host;
}

/** True when `domain` equals or is a subdomain of any of `owned` (all registrable-normalized). */
export function domainMatches(domain: string, owned: readonly string[]): boolean {
  const d = domain.toLowerCase();
  return owned.some((o) => {
    const od = o.toLowerCase();
    return od !== '' && (d === od || d.endsWith(`.${od}`));
  });
}

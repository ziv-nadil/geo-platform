import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * safeFetch: the only outbound HTTP client in lib/server/** (docs/architecture/security.md §5.3).
 *
 * - Host allowlist per integration profile. Client-supplied hosts (a WordPress site, a CDN URL) are
 *   accepted only via `extraHosts`, which callers take from the org's own saved onboarding answers.
 * - Every request resolves DNS and refuses private, loopback, link-local, CGNAT, multicast and
 *   cloud-metadata addresses (SSRF), and re-checks after each redirect (max 3, manual).
 * - https only (http is allowed only for the `scrape` profile's first hop when the caller opts in).
 * - Credentials (Authorization, cookies, API-key headers) are never forwarded to a different host.
 * - 15 s timeout and 5 MB response cap.
 */

export type Integration =
  | 'scrape' | 'infisical' | 'supabase' | 'stripe' | 'github' | 'google' | 'bing' | 'cloudflare'
  | 'slack' | 'microsoft' | 'aws' | 'cms' | 'analytics';

const ALLOW: Record<Integration, (string | RegExp)[]> = {
  scrape: [/.*/], // any public host, never with credentials
  infisical: ['app.infisical.com', 'eu.infisical.com'],
  supabase: [/^[a-z0-9]+\.supabase\.co$/],
  stripe: ['api.stripe.com'],
  github: ['api.github.com'],
  google: [
    'oauth2.googleapis.com', 'www.googleapis.com', 'searchconsole.googleapis.com',
    'analyticsadmin.googleapis.com', 'analyticsdata.googleapis.com', 'serviceusage.googleapis.com',
    'indexing.googleapis.com', 'googleads.googleapis.com', 'youtube.googleapis.com',
  ],
  bing: ['ssl.bing.com'],
  cloudflare: ['api.cloudflare.com'],
  slack: ['slack.com'],
  microsoft: ['login.microsoftonline.com', 'graph.microsoft.com'],
  aws: [/^sts(\.[a-z0-9-]+)?\.amazonaws\.com$/, /^[a-z0-9.-]+\.s3(\.[a-z0-9-]+)?\.amazonaws\.com$/, /^s3(\.[a-z0-9-]+)?\.amazonaws\.com$/, 'cloudfront.amazonaws.com'],
  cms: [
    'api.webflow.com', 'api.sanity.io', /^[a-z0-9]+\.api\.sanity\.io$/, 'api.contentful.com', 'api.hubapi.com',
    'www.wixapis.com', /^[a-z0-9-]+\.myshopify\.com$/,
  ],
  analytics: ['api.ahrefs.com', 'api.semrush.com', 'www.semrush.com', 'api.similarweb.com'],
};

const CREDENTIAL_HEADERS = ['authorization', 'cookie', 'x-api-key', 'api-key', 'x-shopify-access-token', 'wix-site-id', 'x-amz-security-token'];

export class SafeFetchError extends Error {
  constructor(public readonly code: 'host_not_allowed' | 'private_address' | 'insecure_scheme' | 'too_many_redirects' | 'too_large' | 'timeout' | 'dns_failed' | 'network', message: string) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

export interface SafeFetchOptions extends Omit<RequestInit, 'redirect' | 'signal'> {
  integration: Integration;
  /** Exact hostnames from the org's own trusted config (e.g. its WordPress site). */
  extraHosts?: string[];
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowHttp?: boolean;
}

function hostAllowed(host: string, integration: Integration, extra: string[]): boolean {
  const h = host.toLowerCase();
  if (extra.some((e) => e.toLowerCase() === h)) return true;
  return ALLOW[integration].some((rule) => (typeof rule === 'string' ? rule === h : rule.test(h)));
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

function inCidr4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    return [
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
      ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
      ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
    ].some(([b, n]) => inCidr4(ip, b as string, n as number));
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    if (x.startsWith('::ffff:')) return isPrivateAddress(x.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x) || x.startsWith('64:ff9b:') || x.startsWith('2001:db8');
  }
  return true;
}

async function assertPublicHost(host: string): Promise<void> {
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new SafeFetchError('private_address', `blocked address ${host}`);
    return;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new SafeFetchError('private_address', `blocked host ${host}`);
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new SafeFetchError('dns_failed', `could not resolve ${host}`);
  }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new SafeFetchError('private_address', `${host} resolves to a non-public address`);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SafeFetchError('too_large', `response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/**
 * Returns a fully buffered Response (body capped). Throws SafeFetchError on policy violations.
 * `input` may be a URL string or a pre-signed Request (e.g. AWS SigV4 from aws4fetch).
 */
export async function safeFetch(input: string | URL | Request, opts: SafeFetchOptions): Promise<Response> {
  const { integration, extraHosts = [], timeoutMs = 15_000, maxBytes = 5 * 1024 * 1024, maxRedirects = 3, allowHttp = false, ...init } = opts;

  let req = input instanceof Request ? input : new Request(input.toString(), init);
  const originalHost = new URL(req.url).hostname;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const url = new URL(req.url);
      if (url.protocol !== 'https:' && !(allowHttp && integration === 'scrape' && url.protocol === 'http:')) {
        throw new SafeFetchError('insecure_scheme', `${url.protocol} not allowed`);
      }
      if (url.username || url.password) throw new SafeFetchError('host_not_allowed', 'credentials in URL are not allowed');
      if (!hostAllowed(url.hostname, integration, extraHosts)) {
        throw new SafeFetchError('host_not_allowed', `${url.hostname} is not allowed for ${integration}`);
      }
      await assertPublicHost(url.hostname);

      let res: Response;
      try {
        res = await fetch(req, { redirect: 'manual', signal: controller.signal, cache: 'no-store' });
      } catch (e) {
        if (controller.signal.aborted) throw new SafeFetchError('timeout', `timed out after ${timeoutMs} ms`);
        throw new SafeFetchError('network', e instanceof Error ? e.message : 'network error');
      }

      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        await res.body?.cancel();
        const next = new URL(res.headers.get('location')!, url);
        const headers = new Headers(req.headers);
        if (next.hostname !== originalHost) for (const h of CREDENTIAL_HEADERS) headers.delete(h);
        const method = res.status === 303 ? 'GET' : req.method;
        req = new Request(next.toString(), { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : init.body });
        continue;
      }

      const body = await readCapped(res, maxBytes);
      const out = new Response(body.byteLength ? (body as unknown as BodyInit) : null, { status: res.status, statusText: res.statusText, headers: res.headers });
      Object.defineProperty(out, 'url', { value: req.url });
      return out;
    }
    throw new SafeFetchError('too_many_redirects', `more than ${maxRedirects} redirects`);
  } finally {
    clearTimeout(timer);
  }
}

/** Convenience: JSON request; returns status + parsed body (or null) without throwing on HTTP errors. */
export async function safeJson<T = unknown>(input: string | URL | Request, opts: SafeFetchOptions): Promise<{ status: number; ok: boolean; headers: Headers; data: T | null; text: string }> {
  const res = await safeFetch(input, opts);
  const text = await res.text();
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok, headers: res.headers, data, text };
}

/**
 * Egress control for the engine pipeline (docs/architecture/security.md section 5.3).
 *
 * `allowlistedFetch(integration)` returns a fetch that only reaches the vendor hosts listed below,
 * over https, never follows a redirect to another host with credentials, and enforces a timeout.
 * It is passed to the vendor SDKs as their `fetch` and used for raw calls (DataForSEO,
 * Cloudflare). When the platform-wide `safeFetch` lands in lib/server, this module should
 * delegate to it (logged in docs/ISSUES.md).
 */

export const EGRESS_ALLOWLIST = {
  openai: ['api.openai.com'],
  anthropic: ['api.anthropic.com'],
  perplexity: ['api.perplexity.ai'],
  gemini: ['generativelanguage.googleapis.com'],
  gemini_redirect: ['vertexaisearch.cloud.google.com'],
  dataforseo: ['api.dataforseo.com'],
  bria: ['engine.prod.bria-api.com'],
  cloudflare: ['api.cloudflare.com'],
} as const;
export type Integration = keyof typeof EGRESS_ALLOWLIST;

export class EgressBlockedError extends Error {
  constructor(url: string, integration: string) {
    super(`egress blocked: ${safeHost(url)} is not allowed for ${integration}`);
    this.name = 'EgressBlockedError';
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(invalid url)';
  }
}

export function isAllowed(integration: Integration, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  return (EGRESS_ALLOWLIST[integration] as readonly string[]).includes(u.hostname.toLowerCase());
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function allowlistedFetch(
  integration: Integration,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): typeof fetch {
  const base = opts.fetchImpl ?? globalThis.fetch;
  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    if (!isAllowed(integration, url)) throw new EgressBlockedError(url, integration);
    const signals: AbortSignal[] = [];
    if (init?.signal) signals.push(init.signal);
    if (opts.timeoutMs) signals.push(AbortSignal.timeout(opts.timeoutMs));
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    // Never follow redirects automatically: a redirect could carry the Authorization header elsewhere.
    const res = await base(input, { ...init, signal, redirect: init?.redirect ?? 'manual' });
    return res;
  };
  return wrapped as typeof fetch;
}

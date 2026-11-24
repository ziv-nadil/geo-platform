import 'server-only';

/**
 * Strip secrets from a message before it is stored (integration_tests, secret_refs.test_message)
 * or returned. Removes the known values and any 20+ char token-like substring, because some APIs
 * echo keys in error messages (security.md §1.8).
 */
export function redact(message: string, values: (string | null | undefined)[] = []): string {
  let out = message;
  for (const v of values) {
    if (v && v.length >= 4) out = out.split(v).join('[redacted]');
  }
  out = out.replace(/[A-Za-z0-9_\-+/=.]{20,}/g, (m) => (/^https?:/.test(m) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(m) ? m : '[redacted]'));
  return out.slice(0, 500);
}

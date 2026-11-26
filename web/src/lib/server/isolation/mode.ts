/**
 * ISOLATION_MODE migration flag (docs/architecture/isolation.md §5).
 *
 *   per_client  (default in production) client secret values are readable ONLY inside that client's GitHub
 *               environment (`client-<slug>`), via a per-client Infisical identity logged in with GitHub OIDC.
 *               Vercel keeps app-writer (write-only intake) and provisioner; the shared `worker` reader is not used,
 *               and cron routes only dispatch per-org jobs.
 *   shared      legacy path: Vercel functions read through the single `worker` identity. Dev/staging and the
 *               side-by-side migration week only.
 *
 * Unknown values fail closed to per_client.
 */
export type IsolationMode = 'per_client' | 'shared';

export function isolationMode(env: Record<string, string | undefined> = process.env): IsolationMode {
  const raw = env.ISOLATION_MODE?.trim().toLowerCase();
  if (raw === 'shared') return 'shared';
  if (raw === 'per_client') return 'per_client';
  if (raw) return 'per_client';
  return env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production' && !env.VERCEL_ENV ? 'per_client' : 'shared';
}

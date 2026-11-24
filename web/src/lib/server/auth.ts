import 'server-only';
import { createSupabaseServerClient, type TypedSupabaseClient } from './supabase/server';
import { createSupabaseAdminClient } from './supabase/admin';
import { ENV } from './env';

export type AccessTier = 'read' | 'edit' | 'admin';

export type AuthResult =
  | {
      ok: true;
      userId: string;
      isPlatformAdmin: boolean;
      supabase: TypedSupabaseClient; // user-scoped (RLS)
    }
  | { ok: false; response: Response };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function notConfiguredResponse(missing: readonly string[]): Response {
  // 503: the feature exists but this deployment lacks credentials for it.
  return json({ status: 'not_configured', missing }, 503);
}

/** Resolve the signed-in user from the request cookies (JWT verified via getClaims/getUser). */
export async function requireUser(): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, response: notConfiguredResponse(ENV.supabasePublic) };

  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== 'string') {
    return { ok: false, response: json({ error: 'unauthenticated' }, 401) };
  }
  const { data: isAdmin } = await supabase.rpc('is_platform_admin');
  return { ok: true, userId: sub, isPlatformAdmin: isAdmin === true, supabase };
}

/**
 * Check the caller can act on an org at the given tier, using the same SQL helpers as RLS
 * (can_read_org / can_edit_org / can_admin_org), so API checks and RLS never disagree.
 * Unknown orgs and forbidden orgs both return 404 to avoid leaking which org ids exist.
 */
export async function requireOrgAccess(orgId: string, tier: AccessTier): Promise<AuthResult> {
  if (!isUuid(orgId)) return { ok: false, response: json({ error: 'not_found' }, 404) };
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const fn = tier === 'read' ? 'can_read_org' : tier === 'edit' ? 'can_edit_org' : 'can_admin_org';
  const { data, error } = await auth.supabase.rpc(fn, { org: orgId });
  if (error) return { ok: false, response: json({ error: 'authorization_check_failed' }, 500) };
  if (data !== true) {
    // Distinguish "can read but not write" (403) from "no access at all" (404).
    if (tier !== 'read') {
      const { data: canRead } = await auth.supabase.rpc('can_read_org', { org: orgId });
      if (canRead === true) return { ok: false, response: json({ error: 'forbidden' }, 403) };
    }
    return { ok: false, response: json({ error: 'not_found' }, 404) };
  }
  return auth;
}

export async function requirePlatformAdmin(): Promise<AuthResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (!auth.isPlatformAdmin) return { ok: false, response: json({ error: 'not_found' }, 404) };
  return auth;
}

/**
 * Write an audit row with the service role. Platform-admin actors are forced to
 * visibility='platform' by a DB trigger, so clients never see staff activity.
 * Metadata must never contain secret values.
 */
export async function audit(entry: {
  orgId: string | null;
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  actorKind?: 'user' | 'platform_admin' | 'system';
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  await admin.from('audit_log').insert({
    org_id: entry.orgId,
    actor_id: entry.actorId,
    actor_kind: entry.actorKind ?? (entry.actorId ? 'user' : 'system'),
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata: (entry.metadata ?? {}) as never,
  });
}

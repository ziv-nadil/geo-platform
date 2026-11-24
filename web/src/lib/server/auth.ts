import 'server-only';
import { createSupabaseServerClient, type TypedSupabaseClient } from './supabase/server';
import { createSupabaseAdminClient } from './supabase/admin';
import { ENV } from './env';
import type { Database, Json } from '@/lib/db.types';

/**
 * Authorization for route handlers. Mirrors the SQL helpers in schema `private`
 * (docs/architecture/security.md §3): members by role rank; staff only with an aal2 session AND
 * an unexpired per-org grant (view = read, act = write). Identity comes from getClaims()
 * (JWT verified), never getSession().
 */

export type OrgRole = Database['public']['Enums']['org_role'];
const RANK: Record<OrgRole, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };

export type Caller = {
  userId: string;
  aal: string;
  email: string | null;
  supabase: TypedSupabaseClient; // user-scoped (RLS applies)
};

export type OrgCaller = Caller & {
  orgId: string;
  role: OrgRole | null; // null when acting as staff through a grant
  staff: { mode: 'view' | 'act'; grantId: string } | null;
};

type Fail = { ok: false; response: Response };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

export function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
}

export function notConfiguredResponse(missing: readonly string[]): Response {
  return json({ status: 'not_configured', missing }, 503);
}

export async function requireUser(): Promise<({ ok: true } & Caller) | Fail> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, response: notConfiguredResponse(ENV.supabasePublic) };
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; aal?: string; email?: string } | undefined;
  if (error || !claims?.sub) return { ok: false, response: json({ error: 'unauthenticated' }, 401) };
  return { ok: true, userId: claims.sub, aal: claims.aal ?? 'aal1', email: claims.email ?? null, supabase };
}

/** Staff = row in platform_admins, not disabled, AND an aal2 session. Read with the secret key. */
async function isPlatformAdmin(userId: string, aal: string): Promise<boolean> {
  if (aal !== 'aal2') return false;
  const admin = createSupabaseAdminClient();
  if (!admin) return false;
  const { data } = await admin.from('platform_admins').select('user_id').eq('user_id', userId).is('disabled_at', null).maybeSingle();
  return !!data;
}

async function activeGrant(userId: string, orgId: string): Promise<{ id: string; mode: 'view' | 'act' } | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from('platform_access_grants')
    .select('id, mode, expires_at')
    .eq('admin_user_id', userId)
    .eq('org_id', orgId)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('mode', { ascending: true }) // 'act' before 'view'
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, mode: data.mode as 'view' | 'act' } : null;
}

/**
 * Require at least `minRole` in the org. Reads use minRole 'viewer'.
 * Staff pass with a 'view' grant for viewer-level reads and an 'act' grant for anything else.
 * No access => 404 (doesn't reveal which org ids exist); read-only access to a write => 403.
 */
export async function requireOrgAccess(orgId: string, minRole: OrgRole): Promise<({ ok: true } & OrgCaller) | Fail> {
  if (!isUuid(orgId)) return { ok: false, response: json({ error: 'not_found' }, 404) };
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { ok: _ok, ...caller } = auth;
  void _ok;

  const { data: m } = await auth.supabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (m) {
    if (RANK[m.role] >= RANK[minRole]) return { ok: true, ...caller, orgId, role: m.role, staff: null };
    return { ok: false, response: json({ error: 'forbidden', required_role: minRole }, 403) };
  }

  if (await isPlatformAdmin(auth.userId, auth.aal)) {
    const grant = await activeGrant(auth.userId, orgId);
    if (grant && (minRole === 'viewer' || grant.mode === 'act')) {
      return { ok: true, ...caller, orgId, role: null, staff: { mode: grant.mode, grantId: grant.id } };
    }
    if (grant) return { ok: false, response: json({ error: 'forbidden', detail: 'view-as grant is read-only' }, 403) };
  }
  return { ok: false, response: json({ error: 'not_found' }, 404) };
}

/** Fleet-wide staff routes (admin console). aal2 + active platform_admins row. */
export async function requirePlatformAdmin(): Promise<({ ok: true } & Caller) | Fail> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (auth.aal !== 'aal2') return { ok: false, response: json({ error: 'mfa_required' }, 403) };
  if (!(await isPlatformAdmin(auth.userId, auth.aal))) return { ok: false, response: json({ error: 'not_found' }, 404) };
  return auth;
}

/** Same-origin + custom header check for state-changing JSON routes (CSRF defense in depth). */
export function checkOrigin(request: Request, requiredHeader?: string): Response | null {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const allowed = new Set<string>();
  if (appUrl) allowed.add(new URL(appUrl).origin);
  if (host) {
    allowed.add(`https://${host}`);
    if (process.env.NODE_ENV !== 'production') allowed.add(`http://${host}`);
  }
  if (!origin || !allowed.has(origin)) return json({ error: 'bad_origin' }, 403);
  if (requiredHeader && request.headers.get(requiredHeader) !== '1') return json({ error: 'missing_header', header: requiredHeader }, 400);
  return null;
}

// ---------------------------------------------------------------------------
// Audit (server key). Client-visible events mask staff (DB trigger); staff trail is separate.
// Metadata must never contain secret values.
// ---------------------------------------------------------------------------
export async function auditEvent(e: {
  orgId: string;
  caller: { userId: string; staff?: OrgCaller['staff'] } | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, Json>;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const isStaff = !!e.caller?.staff;
  await admin.from('audit_events').insert({
    org_id: e.orgId,
    actor_user_id: isStaff ? null : (e.caller?.userId ?? null),
    actor_kind: isStaff ? 'agency' : e.caller ? 'member' : 'system',
    action: e.action,
    target_type: e.targetType ?? null,
    target_id: e.targetId ?? null,
    metadata: e.metadata ?? {},
  });
  if (isStaff) {
    await platformAudit({ actorUserId: e.caller!.userId, action: e.action, orgId: e.orgId, targetType: e.targetType, targetId: e.targetId, metadata: { ...(e.metadata ?? {}), grant_id: e.caller!.staff!.grantId } });
  }
}

export async function platformAudit(e: {
  actorUserId: string | null;
  action: string;
  orgId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, Json>;
  request?: Request;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  await admin.from('platform_audit_log').insert({
    actor_user_id: e.actorUserId,
    action: e.action,
    org_id: e.orgId ?? null,
    target_type: e.targetType ?? null,
    target_id: e.targetId ?? null,
    metadata: e.metadata ?? {},
    user_agent: e.request?.headers.get('user-agent')?.slice(0, 300) ?? null,
    request_id: e.request?.headers.get('x-vercel-id') ?? null,
  });
}

// ---------------------------------------------------------------------------
// Best-effort per-instance rate limiter (security.md §6.2 asks for 20/min/user on intake).
// Serverless instances don't share memory: pair with a Vercel Firewall rule in production.
// ---------------------------------------------------------------------------
const buckets = new Map<string, number[]>();
export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  return hits.length > limit;
}

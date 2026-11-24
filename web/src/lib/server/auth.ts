import 'server-only';
import { currentClaims, dbConfigured, withService, type JwtClaims } from './db';

/**
 * Authorization for route handlers. Mirrors the SQL helpers in schema `private`
 * (docs/architecture/security.md §3): members by role rank; staff only with an aal2 session AND
 * an unexpired per-org grant (view = read, act = write). Identity comes from getClaims()
 * (JWT verified; via currentClaims()), never getSession().
 */

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';
const RANK: Record<OrgRole, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };

export type Caller = { userId: string; aal: string; claims: JwtClaims };
export type OrgCaller = Caller & {
  orgId: string;
  role: OrgRole | null; // null when staff act through a grant
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
  if (!dbConfigured()) return { ok: false, response: notConfiguredResponse(['DATABASE_URL']) };
  const claims = await currentClaims();
  if (!claims) return { ok: false, response: json({ error: 'unauthenticated' }, 401) };
  return { ok: true, userId: claims.sub, aal: claims.aal ?? 'aal1', claims };
}

/**
 * Require at least `minRole` in the org ('viewer' for reads). Staff pass with a 'view' grant for
 * viewer-level reads and an 'act' grant for anything else. No access => 404 (doesn't reveal which
 * org ids exist); insufficient role => 403.
 */
export async function requireOrgAccess(orgId: string, minRole: OrgRole): Promise<({ ok: true } & OrgCaller) | Fail> {
  if (!isUuid(orgId)) return { ok: false, response: json({ error: 'not_found' }, 404) };
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const caller: Caller = { userId: auth.userId, aal: auth.aal, claims: auth.claims };

  const found = await withService(async (sql) => {
    const [m] = await sql`select role::text as role from public.memberships where org_id = ${orgId} and user_id = ${auth.userId}`;
    if (m) return { role: m.role as OrgRole, grant: null };
    if (auth.aal !== 'aal2') return { role: null, grant: null };
    const [g] = await sql`
      select g.id, g.mode from public.platform_access_grants g
      join public.platform_admins pa on pa.user_id = g.admin_user_id and pa.disabled_at is null
      where g.admin_user_id = ${auth.userId} and g.org_id = ${orgId} and g.ended_at is null and g.expires_at > now()
      order by g.mode asc limit 1`;
    return { role: null, grant: g ? { id: g.id as string, mode: g.mode as 'view' | 'act' } : null };
  });

  if (found.role) {
    if (RANK[found.role] >= RANK[minRole]) return { ok: true, ...caller, orgId, role: found.role, staff: null };
    return { ok: false, response: json({ error: 'forbidden', required_role: minRole }, 403) };
  }
  if (found.grant) {
    if (minRole === 'viewer' || found.grant.mode === 'act') {
      return { ok: true, ...caller, orgId, role: null, staff: { mode: found.grant.mode, grantId: found.grant.id } };
    }
    return { ok: false, response: json({ error: 'forbidden', detail: 'view-as grant is read-only' }, 403) };
  }
  return { ok: false, response: json({ error: 'not_found' }, 404) };
}

/** Fleet-wide staff routes (admin console): aal2 + active platform_admins row. */
export async function requirePlatformAdmin(): Promise<({ ok: true } & Caller) | Fail> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (auth.aal !== 'aal2') return { ok: false, response: json({ error: 'mfa_required' }, 403) };
  const isStaff = await withService(async (sql) => {
    const [r] = await sql`select 1 from public.platform_admins where user_id = ${auth.userId} and disabled_at is null`;
    return !!r;
  });
  if (!isStaff) return { ok: false, response: json({ error: 'not_found' }, 404) };
  return auth;
}

/** Same-origin + custom header check for state-changing JSON routes (CSRF defense in depth). */
export function checkOrigin(request: Request, requiredHeader?: string): Response | null {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const allowed = new Set<string>();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
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
// Audit (server path). Client-visible events mask staff; staff trail goes to platform_audit_log.
// Metadata must never contain secret values.
// ---------------------------------------------------------------------------
type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export async function auditEvent(e: {
  orgId: string;
  caller: { userId: string; staff?: OrgCaller['staff'] } | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, JsonValue>;
  request?: Request;
}): Promise<void> {
  const isStaff = !!e.caller?.staff;
  const meta = e.metadata ?? {};
  await withService(async (sql) => {
    await sql`
      insert into public.audit_events (org_id, actor_user_id, actor_kind, action, target_type, target_id, metadata)
      values (${e.orgId}, ${isStaff ? null : (e.caller?.userId ?? null)}, ${isStaff ? 'agency' : e.caller ? 'member' : 'system'},
              ${e.action}, ${e.targetType ?? null}, ${e.targetId ?? null}, ${sql.json(meta)})`;
    if (isStaff) {
      await sql`
        insert into public.platform_audit_log (actor_user_id, action, org_id, target_type, target_id, metadata, user_agent, request_id)
        values (${e.caller!.userId}, ${e.action}, ${e.orgId}, ${e.targetType ?? null}, ${e.targetId ?? null},
                ${sql.json({ ...meta, grant_id: e.caller!.staff!.grantId })},
                ${e.request?.headers.get('user-agent')?.slice(0, 300) ?? null}, ${e.request?.headers.get('x-vercel-id') ?? null})`;
    }
  });
}

export async function platformAudit(e: {
  actorUserId: string | null;
  action: string;
  orgId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, JsonValue>;
  request?: Request;
}): Promise<void> {
  await withService(async (sql) => {
    await sql`
      insert into public.platform_audit_log (actor_user_id, action, org_id, target_type, target_id, metadata, user_agent, request_id)
      values (${e.actorUserId}, ${e.action}, ${e.orgId ?? null}, ${e.targetType ?? null}, ${e.targetId ?? null},
              ${sql.json(e.metadata ?? {})}, ${e.request?.headers.get('user-agent')?.slice(0, 300) ?? null},
              ${e.request?.headers.get('x-vercel-id') ?? null})`;
  });
}

// ---------------------------------------------------------------------------
// Best-effort per-instance rate limiter (security.md §6.2: intake 20/min/user, tests 10/min/org).
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

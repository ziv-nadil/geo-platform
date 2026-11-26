import { checkOrigin, json, platformAudit, requirePlatformAdmin } from '@/lib/server/auth';
import { withService } from '@/lib/server/db';
import { provisionVault } from '@/lib/server/infisical';
import { ensureClientEnvironment, githubAdminConfig } from '@/lib/server/isolation/github-env';

export const maxDuration = 60;

/**
 * POST /api/admin/orgs — platform admin (aal2) only; the ONLY way an org is created (no self-serve creation). Body:
 *   { name, slug, website?, plan?, ownerEmail? }
 * Creates the org (server path), invites the owner if given (returns the one-time invite token),
 * then provisions the client's Infisical project (beacon-<slug>) and stores only its id.
 * Vault provisioning degrades to { vault: { status: 'not_configured', missing } } without credentials.
 * Per-client isolation (docs/architecture/isolation.md): also creates identity reader-<slug> (read-only on this
 * project only, OIDC-bound to GitHub environment client-<slug>) and that environment. Stores ids only, never secrets.
 */
export async function POST(request: Request) {
  const bad = checkOrigin(request);
  if (bad) return bad;
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const b = (await request.json().catch(() => null)) as { name?: string; slug?: string; website?: string; plan?: string; ownerEmail?: string } | null;
  const name = b?.name?.trim();
  const slug = b?.slug?.trim().toLowerCase();
  if (!name || !slug || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return json({ error: 'name and a valid slug are required' }, 400);
  if (b?.ownerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.ownerEmail)) return json({ error: 'invalid ownerEmail' }, 400);

  const created = await withService(async (sql) => {
    const [exists] = await sql`select id from public.organizations where slug = ${slug}`;
    if (exists) return { conflict: true as const };
    const [plan] = await sql`select id from public.plans where id = ${b?.plan ?? 'trial'}`;
    if (!plan) return { badPlan: true as const };
    const [org] = await sql`
      insert into public.organizations (name, slug, website, plan, status)
      values (${name}, ${slug}, ${b?.website ?? null}, ${plan.id}, 'onboarding') returning id, slug`;
    await sql`insert into public.org_engines (org_id, engine_id) select ${org.id}, id from public.engines where active and method = 'api' and (id <> 'perplexity' or ${!!process.env.PERPLEXITY_API_KEY})`;
    let inviteToken: string | null = null;
    if (b?.ownerEmail) {
      inviteToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
      const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inviteToken))).toString('hex');
      await sql`insert into public.invitations (org_id, email, role, token_hash, invited_by) values (${org.id}, ${b.ownerEmail}, 'owner', ${hash}, null)`;
    }
    return { org: org as { id: string; slug: string }, inviteToken };
  });
  if ('conflict' in created) return json({ error: 'slug_taken' }, 409);
  if ('badPlan' in created) return json({ error: 'unknown_plan' }, 400);

  const vault = await provisionVault(created.org);
  let github: Awaited<ReturnType<typeof ensureClientEnvironment>> | { status: 'not_configured'; missing: string[] } = { status: 'not_configured', missing: ['vault not provisioned'] };
  if ('projectId' in vault) {
    const iso = vault.isolation;
    await withService((sql) => sql`
      update public.organizations set infisical_project_id = ${vault.projectId}, reader_identity_id = ${iso.readerIdentityId},
        runner_environment = ${iso.environment}, runner_oidc_subject = ${iso.boundSubject}
      where id = ${created.org.id}`);
    const gh = githubAdminConfig();
    github = 'status' in gh ? gh : await ensureClientEnvironment(gh, { orgId: created.org.id, slug: created.org.slug, readerIdentityId: iso.readerIdentityId })
      .catch(() => ({ status: 'partial' as const, environment: iso.environment, steps: [{ step: 'environment.upsert', ok: false, detail: 'request failed' }] }));
  }
  await platformAudit({ actorUserId: auth.userId, action: 'org.create', orgId: created.org.id, targetType: 'organization', targetId: created.org.id,
    metadata: { slug, vault: vault.status, github: github.status, steps: 'steps' in vault ? vault.steps.map((s) => `${s.step}:${s.ok ? 'ok' : 'fail'}`) : [] }, request });
  if ('projectId' in vault) await platformAudit({ actorUserId: auth.userId, action: 'vault.provisioned', orgId: created.org.id, metadata: { status: vault.status }, request });

  return json({ org: created.org, inviteToken: created.inviteToken, vault: 'projectId' in vault ? { status: vault.status, steps: vault.steps, isolation: vault.isolation } : vault, github }, 201);
}

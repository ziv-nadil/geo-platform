/**
 * Create / update the per-client GitHub Actions environments `client-<slug>` (docs/architecture/isolation.md §5 step 4-5).
 * Idempotent; also the backfill for orgs created before per-client isolation.
 *
 *   GITHUB_ADMIN_TOKEN=... GITHUB_REPOSITORY=owner/geo-platform DATABASE_URL=postgres://... \
 *     node --experimental-strip-types scripts/github-environments.ts [--dry-run] [--slug acme]
 *
 * GITHUB_ADMIN_TOKEN: fine-grained token with "Administration: write" + "Environments: write" + "Variables: write" on
 * this repository only. Orgs come from public.organizations (id, slug, reader_identity_id). Without the token or
 * repository it prints { status: "not_configured" } and exits 0. Never writes or prints secret values.
 */
import { createRequire } from 'node:module';
import {
  clientEnvironmentName, defaultSubPrefix, ensureClientEnvironment, environmentVariables, githubAdminConfig, oidcSubject, readSubPrefix,
} from '../web/src/lib/server/isolation/github-env.ts';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const onlySlug = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : undefined;

const cfg = githubAdminConfig();
if ('status' in cfg && !dry) {
  console.log(JSON.stringify(cfg));
  process.exit(0);
}
const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.log(JSON.stringify({ status: 'not_configured', missing: ['DATABASE_URL'] }));
  process.exit(0);
}
const require = createRequire(new URL('../web/package.json', import.meta.url));
const pg = require('postgres');
const postgres = (pg.default ?? pg) as typeof import('postgres').default;
const sql = postgres(dbUrl, { max: 1, prepare: false });

try {
  const orgs: { id: string; slug: string; reader_identity_id: string | null }[] = await sql`
    select id, slug, reader_identity_id from public.organizations
    where status in ('active', 'onboarding') ${onlySlug ? sql`and slug = ${onlySlug}` : sql``} order by created_at`;
  const prefix = process.env.GITHUB_OIDC_SUB_PREFIX?.trim()
    || ('status' in cfg ? defaultSubPrefix(process.env.GITHUB_REPOSITORY?.trim() || 'owner/repo') : await readSubPrefix(cfg));
  const out = [];
  for (const o of orgs) {
    const environment = clientEnvironmentName(o.slug);
    const subject = oidcSubject(prefix, o.slug);
    if (dry || 'status' in cfg) {
      out.push({ slug: o.slug, environment, subject, vars: Object.keys(environmentVariables({ orgId: o.id, slug: o.slug, readerIdentityId: o.reader_identity_id })), dryRun: true });
      continue;
    }
    const r = await ensureClientEnvironment(cfg, { orgId: o.id, slug: o.slug, readerIdentityId: o.reader_identity_id });
    await sql`update public.organizations set runner_environment = ${environment}, runner_oidc_subject = ${subject} where id = ${o.id}`;
    out.push({ slug: o.slug, subject, ...r });
  }
  console.log(JSON.stringify({ status: 'ok', prefix, orgs: out }, null, 2));
} finally {
  await sql.end();
}

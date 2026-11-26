import 'server-only';
import { dispatchClientJob, type GithubConfig } from '../isolation/github-env';
import type { JobType, OrgRef } from './types';

/** Vercel side of per_client mode: it only dispatches; it never reads client secrets. */
export function dispatchConfig(env: Record<string, string | undefined> = process.env): GithubConfig | { status: 'not_configured'; missing: string[] } {
  const token = env.GITHUB_DISPATCH_TOKEN?.trim();
  const repository = env.GITHUB_REPOSITORY?.trim();
  const missing = [!token && 'GITHUB_DISPATCH_TOKEN', !repository && 'GITHUB_REPOSITORY'].filter(Boolean) as string[];
  return missing.length ? { status: 'not_configured', missing } : { token: token!, repository: repository! };
}

export async function dispatchForOrgs(cfg: GithubConfig, type: JobType, orgs: OrgRef[]) {
  const out: { orgId: string; slug: string; jobId: string; dispatched: boolean; status: number }[] = [];
  for (const o of orgs) {
    const jobId = `${type}:${o.slug}:${crypto.randomUUID().slice(0, 8)}`;
    const r = await dispatchClientJob(cfg, { slug: o.slug, jobType: type, jobId }).catch(() => ({ ok: false, status: 0 }));
    out.push({ orgId: o.orgId, slug: o.slug, jobId, dispatched: r.ok, status: r.status });
  }
  return out;
}

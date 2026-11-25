import 'server-only';
import { safeJson } from '../net/safe-fetch';
import { errDetail, result, str, type Check, type Tester } from './types';

const gh = (token: string) => ({ authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'beacon-geo' });

/** github_repo_access + github_pr_probe (branch create/delete; PR open/close). */
export const test: Tester = async (ctx) => {
  const repo = str(ctx.data.github_repo);
  const method = str(ctx.data.github_method);
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return result([], ['github_repo (owner/name)']);
  const token = method === 'token' ? await ctx.secret('github_token') : process.env.AGENCY_GITHUB_TOKEN ?? null;
  if (!token) return result([], [method === 'token' ? 'github_token (stored secret)' : 'AGENCY_GITHUB_TOKEN (our bot user token)'], true);

  const checks: Check[] = [];
  const missing: string[] = [];
  try {
    const r = await safeJson<{ permissions?: { push?: boolean; pull?: boolean }; default_branch?: string }>(`https://api.github.com/repos/${repo}`, { integration: 'github', headers: gh(token) });
    const push = !!r.data?.permissions?.push;
    checks.push({ id: 'github_repo_access', label: 'Repository reachable', ok: r.ok && push,
      detail: !r.ok ? (r.status === 404 ? 'Not found: invite not accepted or token not scoped to this repo' : `HTTP ${r.status}`) : push ? 'push access' : `Read only: pull=${!!r.data?.permissions?.pull}, push=false` });
    if (!push) missing.push('Write (push) access to the repository');
    if (r.ok && push) {
      const base = str(ctx.data.github_branch) ?? r.data?.default_branch ?? 'main';
      const ref = await safeJson<{ object?: { sha?: string } }>(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`, { integration: 'github', headers: gh(token) });
      const sha = ref.data?.object?.sha;
      const branch = `beacon/connection-test-${Date.now()}`;
      const created = sha ? await safeJson(`https://api.github.com/repos/${repo}/git/refs`, { integration: 'github', method: 'POST', headers: gh(token), body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) }) : null;
      let prOk = false;
      let detail = sha ? `branch create HTTP ${created?.status}` : `base branch ${base} not found`;
      if (created?.ok) {
        const path = `${(str(ctx.data.github_content_path) ?? 'beacon').replace(/^\/|\/$/g, '')}/.beacon-connection-test.md`;
        const file = await safeJson(`https://api.github.com/repos/${repo}/contents/${path}`, { integration: 'github', method: 'PUT', headers: gh(token),
          body: JSON.stringify({ message: 'Beacon connection test', content: Buffer.from('Beacon GEO connection test. Safe to delete.\n').toString('base64'), branch }) });
        const pr = file.ok ? await safeJson<{ number?: number }>(`https://api.github.com/repos/${repo}/pulls`, { integration: 'github', method: 'POST', headers: gh(token),
          body: JSON.stringify({ title: 'Beacon connection test (auto-closed)', head: branch, base, draft: true }) }) : null;
        prOk = !!pr?.ok;
        detail = !file.ok ? `commit HTTP ${file.status}` : prOk ? 'branch, commit and draft PR created, then cleaned up' : `branch push works but PR creation failed (HTTP ${pr?.status})`;
        if (pr?.data?.number) await safeJson(`https://api.github.com/repos/${repo}/pulls/${pr.data.number}`, { integration: 'github', method: 'PATCH', headers: gh(token), body: JSON.stringify({ state: 'closed' }) });
        await safeJson(`https://api.github.com/repos/${repo}/git/refs/heads/${branch}`, { integration: 'github', method: 'DELETE', headers: gh(token) });
      }
      checks.push({ id: 'github_pr_probe', label: 'Can open pull requests', ok: prOk, detail });
      if (!prOk) missing.push('Pull requests: write');
    }
  } catch (e) {
    checks.push({ id: 'github_repo_access', label: 'Repository reachable', ok: false, detail: errDetail(e) });
  }
  return result(checks, missing);
};

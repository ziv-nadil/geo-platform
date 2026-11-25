import 'server-only';
import { safeJson } from '../net/safe-fetch';
import { agencyGoogleToken, bearer, serviceAccountToken } from './google';
import { errDetail, result, str, type Check, type Tester } from './types';

const APIS = ['youtube.googleapis.com', 'googleads.googleapis.com', 'indexing.googleapis.com'];

export const test: Tester = async (ctx) => {
  const project = str(ctx.data.gcp_project_id);
  if (!project) return result([], ['gcp_project_id']);
  const key = await ctx.secret('gcp_service_account_key');
  if (!key) return result([], ['gcp_service_account_key (stored secret)'], true);
  const checks: Check[] = [];
  const missing: string[] = [];
  try {
    const sa = await serviceAccountToken(key, ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/indexing', 'https://www.googleapis.com/auth/youtube.readonly']);
    if ('error' in sa) return result([{ id: 'gcp_service_account_valid', label: 'Service account key valid', ok: false, detail: sa.error }]);
    const sameProject = sa.projectId === project;
    checks.push({ id: 'gcp_service_account_valid', label: 'Service account key valid', ok: sameProject, detail: sameProject ? sa.clientEmail : `key is for project ${sa.projectId}, not ${project}` });

    const names = APIS.map((a) => `names=${encodeURIComponent(`projects/${project}/services/${a}`)}`).join('&');
    const svc = await safeJson<{ services?: { name: string; state: string }[] }>(`https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(project)}/services:batchGet?${names}`, { integration: 'google', headers: bearer(sa.token) });
    const disabled = APIS.filter((a) => !svc.data?.services?.some((s) => s.name.endsWith(`/${a}`) && s.state === 'ENABLED'));
    checks.push({ id: 'gcp_apis_enabled', label: 'Three APIs enabled', ok: svc.ok && disabled.length === 0, detail: svc.ok ? (disabled.length ? `disabled: ${disabled.join(', ')}` : 'all enabled') : `HTTP ${svc.status} (grant serviceusage.services.get)` });
    disabled.forEach((a) => missing.push(`Enable ${a}`));

    const yt = await safeJson('https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&regionCode=US', { integration: 'google', headers: bearer(sa.token) });
    checks.push({ id: 'youtube_api_call', label: 'YouTube Data API call', ok: yt.ok, detail: yt.ok ? 'ok' : `HTTP ${yt.status}` });

    const home = str(ctx.allData.company?.website_url);
    if (home) {
      const idx = await safeJson(`https://indexing.googleapis.com/v3/urlNotifications/metadata?url=${encodeURIComponent(home)}`, { integration: 'google', headers: bearer(sa.token) });
      const ok = idx.ok || idx.status === 404;
      checks.push({ id: 'indexing_api_owner', label: 'Indexing API permission', ok, detail: ok ? 'service account can use the Indexing API' : idx.status === 403 ? 'Service account is not an Owner in Search Console' : `HTTP ${idx.status}` });
    } else missing.push('company.website_url (for the Indexing API check)');

    // Keyword Planner via our developer token + manager account
    const adsEnv = ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', 'GOOGLE_ADS_API_VERSION'].filter((n) => !process.env[n]);
    const cid = (str(ctx.data.google_ads_customer_id) ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '');
    if (adsEnv.length) missing.push(...adsEnv.map((n) => `${n} (Keyword Planner check skipped)`));
    else {
      const t = await agencyGoogleToken();
      if ('token' in t && cid) {
        const r = await safeJson(`https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION}/customers/${cid}:generateKeywordIdeas`, {
          integration: 'google', method: 'POST',
          headers: { ...bearer(t.token), 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN!, 'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!.replace(/-/g, ''), 'content-type': 'application/json' },
          body: JSON.stringify({ keywordSeed: { keywords: ['analytics'] }, language: 'languageConstants/1000', pageSize: 1 }) });
        checks.push({ id: 'ads_keyword_ideas', label: 'Keyword Planner call', ok: r.ok, detail: r.ok ? 'ok' : `HTTP ${r.status}` });
      } else missing.push('Agency Google token for Keyword Planner');
    }
  } catch (e) {
    checks.push({ id: 'gcp_service_account_valid', label: 'Service account key valid', ok: false, detail: errDetail(e) });
  }
  return result(checks, missing);
};

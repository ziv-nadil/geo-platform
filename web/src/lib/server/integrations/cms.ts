import 'server-only';
import { SignJWT } from 'jose';
import { safeJson } from '../net/safe-fetch';
import { errDetail, result, str, type Check, type Tester } from './types';

async function ghostToken(adminKey: string): Promise<string | null> {
  const [id, secret] = adminKey.split(':');
  if (!id || !secret || !/^[0-9a-f]+$/i.test(secret)) return null;
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256', kid: id, typ: 'JWT' })
    .setIssuedAt().setExpirationTime('5m').setAudience('/admin/').sign(Buffer.from(secret, 'hex'));
}

/** cms_auth (identity/site read) + cms_draft_write (create + delete a draft) where automated. */
export const test: Tester = async (ctx) => {
  const cms = str(ctx.data.cms_platform);
  const siteUrl = str(ctx.data.cms_site_url);
  if (!cms) return result([], ['cms_platform']);
  if (cms === 'other') return result([], ['Custom CMS: reviewed manually by GEO Engine'], true);
  if (cms === 'framer') return result([], ['Framer has no public content API: reviewed manually'], true);
  const cred = await ctx.secret('cms_api_credential');
  if (!cred) return result([], ['cms_api_credential (stored secret)'], true);
  const site = siteUrl ? new URL(siteUrl) : null;
  const project = str(ctx.data.cms_project_id);
  const dataset = str(ctx.data.cms_dataset);
  const checks: Check[] = [];
  const missing: string[] = [];
  const auth = (ok: boolean, detail: string) => checks.push({ id: 'cms_auth', label: 'Credential valid', ok, detail });
  const draft = (ok: boolean, detail: string) => checks.push({ id: 'cms_draft_write', label: 'Can create a draft', ok, detail });

  try {
    switch (cms) {
      case 'wordpress': {
        const user = str(ctx.data.cms_username);
        if (!site || !user) return result([], ['cms_site_url', 'cms_username']);
        const extraHosts = [site.hostname];
        const h = { authorization: `Basic ${Buffer.from(`${user}:${cred}`).toString('base64')}`, 'content-type': 'application/json' };
        const me = await safeJson<{ name?: string; roles?: string[] }>(`${site.origin}/wp-json/wp/v2/users/me?context=edit`, { integration: 'cms', extraHosts, headers: h });
        auth(me.ok, me.ok ? `signed in as ${me.data?.name} (${me.data?.roles?.join(', ')})` : `HTTP ${me.status}`);
        if (me.ok) {
          const post = await safeJson<{ id?: number }>(`${site.origin}/wp-json/wp/v2/posts`, { integration: 'cms', extraHosts, method: 'POST', headers: h, body: JSON.stringify({ title: 'GEO Engine connection test', status: 'draft' }) });
          if (post.data?.id) await safeJson(`${site.origin}/wp-json/wp/v2/posts/${post.data.id}?force=true`, { integration: 'cms', extraHosts, method: 'DELETE', headers: h });
          draft(post.ok, post.ok ? 'draft created and deleted' : `draft create denied (HTTP ${post.status}): role may be Contributor`);
        }
        break;
      }
      case 'ghost': {
        if (!site) return result([], ['cms_site_url']);
        const tok = await ghostToken(cred);
        if (!tok) { auth(false, 'Admin API key must look like id:secret'); break; }
        const extraHosts = [site.hostname];
        const h = { authorization: `Ghost ${tok}`, 'accept-version': 'v5.0', 'content-type': 'application/json' };
        const s = await safeJson(`${site.origin}/ghost/api/admin/site/`, { integration: 'cms', extraHosts, headers: h });
        auth(s.ok, s.ok ? 'site reachable with Admin API key' : `HTTP ${s.status}`);
        if (s.ok) {
          const p = await safeJson<{ posts?: { id: string }[] }>(`${site.origin}/ghost/api/admin/posts/`, { integration: 'cms', extraHosts, method: 'POST', headers: h, body: JSON.stringify({ posts: [{ title: 'GEO Engine connection test', status: 'draft' }] }) });
          const id = p.data?.posts?.[0]?.id;
          if (id) await safeJson(`${site.origin}/ghost/api/admin/posts/${id}/`, { integration: 'cms', extraHosts, method: 'DELETE', headers: h });
          draft(p.ok, p.ok ? 'draft created and deleted' : `HTTP ${p.status}`);
        }
        break;
      }
      case 'webflow': {
        if (!project) return result([], ['cms_project_id (Webflow site id)']);
        const r = await safeJson(`https://api.webflow.com/v2/sites/${encodeURIComponent(project)}`, { integration: 'cms', headers: { authorization: `Bearer ${cred}` } });
        auth(r.ok, r.ok ? 'site readable' : `HTTP ${r.status}`);
        missing.push('cms_draft_write: automated draft test not available for Webflow yet');
        break;
      }
      case 'sanity': {
        if (!project) return result([], ['cms_project_id']);
        const r = await safeJson(`https://api.sanity.io/v2021-06-07/projects/${encodeURIComponent(project)}`, { integration: 'cms', headers: { authorization: `Bearer ${cred}` } });
        auth(r.ok, r.ok ? 'project readable' : `HTTP ${r.status}`);
        if (r.ok && dataset) {
          const id = `drafts.beacon-connection-test-${Date.now()}`;
          const m = await safeJson(`https://${project}.api.sanity.io/v2021-06-07/data/mutate/${encodeURIComponent(dataset)}`, { integration: 'cms', method: 'POST', headers: { authorization: `Bearer ${cred}`, 'content-type': 'application/json' }, body: JSON.stringify({ mutations: [{ create: { _id: id, _type: 'beaconConnectionTest' } }, { delete: { id } }] }) });
          draft(m.ok, m.ok ? 'draft document created and deleted' : `HTTP ${m.status}: token may be Viewer`);
        } else if (!dataset) missing.push('cms_dataset');
        break;
      }
      case 'contentful': {
        if (!project) return result([], ['cms_project_id (space id)']);
        const r = await safeJson(`https://api.contentful.com/spaces/${encodeURIComponent(project)}`, { integration: 'cms', headers: { authorization: `Bearer ${cred}` } });
        auth(r.ok, r.ok ? 'space readable' : `HTTP ${r.status}`);
        missing.push('cms_draft_write: automated draft test not available for Contentful yet');
        break;
      }
      case 'hubspot': {
        const r = await safeJson('https://api.hubapi.com/cms/v3/blogs/posts?limit=1', { integration: 'cms', headers: { authorization: `Bearer ${cred}` } });
        auth(r.ok, r.ok ? 'blog posts readable' : `HTTP ${r.status}`);
        missing.push('cms_draft_write: automated draft test not available for HubSpot yet');
        break;
      }
      case 'shopify': {
        if (!site || !/\.myshopify\.com$/.test(site.hostname)) return result([], ['cms_site_url (your-store.myshopify.com)']);
        const r = await safeJson(`https://${site.hostname}/admin/api/2025-10/blogs.json`, { integration: 'cms', headers: { 'x-shopify-access-token': cred } });
        auth(r.ok, r.ok ? 'blogs readable' : `HTTP ${r.status}`);
        missing.push('cms_draft_write: automated draft test not available for Shopify yet');
        break;
      }
      case 'wix': {
        if (!project) return result([], ['cms_project_id (Wix site id)']);
        const r = await safeJson('https://www.wixapis.com/blog/v3/posts/query', { integration: 'cms', method: 'POST', headers: { authorization: cred, 'wix-site-id': project, 'content-type': 'application/json' }, body: JSON.stringify({ paging: { limit: 1 } }) });
        auth(r.ok, r.ok ? 'blog readable' : `HTTP ${r.status}`);
        missing.push('cms_draft_write: automated draft test not available for Wix yet');
        break;
      }
      default:
        return result([], [`Unsupported CMS: ${cms}`], true);
    }
  } catch (e) {
    auth(false, errDetail(e));
  }
  return result(checks, missing);
};

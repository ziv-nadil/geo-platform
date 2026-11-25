import 'server-only';
import { SignJWT } from 'jose';
import { withService } from '../db';
import { safeJson } from '../net/safe-fetch';
import { readSecret } from '../secrets/broker';
import { buildJsonLd, jsonLdScript } from '../../content-gaps/jsonld';
import { renderHtml, renderMarkdown, type ListicleDoc } from '../../content-gaps/listicle';

/**
 * Deliver an APPROVED listicle to the client's own site as a DRAFT (never live): WordPress/Ghost/Sanity/
 * Webflow drafts, or a draft GitHub PR with Markdown. Credentials come from onboarding answers plus the
 * secrets broker (purpose 'job', logged). The client publishes from inside their CMS / by merging the PR.
 */
export type PublishResult =
  | { status: 'ok'; platform: string; postId: string; postUrl: string }
  | { status: 'not_configured'; missing: string[] }
  | { status: 'error'; message: string };

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const fail = (message: string): PublishResult => ({ status: 'error', message });

async function stepData(orgId: string): Promise<Record<string, Record<string, unknown>>> {
  const rows = await withService((sql) => sql`select step_id, data from public.onboarding_progress where org_id = ${orgId} and step_id in ('cms','github')`);
  return Object.fromEntries(rows.map((r) => [r.step_id as string, (r.data ?? {}) as Record<string, unknown>]));
}

export type Target = 'auto' | 'cms' | 'github';

export async function publishDraft(orgId: string, doc: ListicleDoc, target: Target = 'auto'): Promise<PublishResult> {
  const data = await stepData(orgId);
  const cmsPlatform = str(data.cms?.cms_platform);
  const cmsUsable = !!cmsPlatform && !['other', 'framer'].includes(cmsPlatform);
  const ghUsable = !!str(data.github?.github_repo);
  const pick = target === 'cms' ? (cmsUsable ? 'cms' : null) : target === 'github' ? (ghUsable ? 'github' : null) : cmsUsable ? 'cms' : ghUsable ? 'github' : null;
  if (!pick) return { status: 'not_configured', missing: ['A connected CMS (WordPress, Ghost, Sanity, Webflow) or GitHub blog repo: finish the CMS or GitHub step in onboarding'] };
  try {
    return pick === 'cms' ? await toCms(orgId, data.cms ?? {}, cmsPlatform!, doc) : await toGithub(orgId, data.github ?? {}, doc);
  } catch (e) {
    return fail(e instanceof Error ? e.message.slice(0, 200) : 'Publishing failed');
  }
}

async function secret(orgId: string, stepId: string, fieldId: string): Promise<string | null> {
  const r = await readSecret({ orgId, purpose: 'job', worker: 'content-gaps-publish' }, { stepId, fieldId });
  return r.status === 'ok' ? r.value : null;
}

async function ghostToken(adminKey: string): Promise<string | null> {
  const [id, sec] = adminKey.split(':');
  if (!id || !sec || !/^[0-9a-f]+$/i.test(sec)) return null;
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256', kid: id, typ: 'JWT' }).setIssuedAt().setExpirationTime('5m').setAudience('/admin/').sign(Buffer.from(sec, 'hex'));
}

async function toCms(orgId: string, d: Record<string, unknown>, cms: string, doc: ListicleDoc): Promise<PublishResult> {
  const cred = await secret(orgId, 'cms', 'cms_api_credential');
  if (!cred) return { status: 'not_configured', missing: ['cms_api_credential (stored secret)'] };
  const site = str(d.cms_site_url) ? new URL(str(d.cms_site_url)!) : null;
  const project = str(d.cms_project_id);
  const dataset = str(d.cms_dataset);
  const ld = buildJsonLd(doc, null);
  const html = renderHtml(doc);

  switch (cms) {
    case 'wordpress': {
      const user = str(d.cms_username);
      if (!site || !user) return { status: 'not_configured', missing: ['cms_site_url', 'cms_username'] };
      const r = await safeJson<{ id?: number; link?: string }>(`${site.origin}/wp-json/wp/v2/posts`, {
        integration: 'cms', extraHosts: [site.hostname], method: 'POST',
        headers: { authorization: `Basic ${Buffer.from(`${user}:${cred}`).toString('base64')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ title: doc.title, slug: doc.slug, excerpt: doc.metaDescription, status: 'draft', content: `${html}\n${jsonLdScript(ld)}` }),
      });
      if (!r.ok || !r.data?.id) return fail(`WordPress refused the draft (HTTP ${r.status})`);
      return { status: 'ok', platform: cms, postId: String(r.data.id), postUrl: `${site.origin}/wp-admin/post.php?post=${r.data.id}&action=edit` };
    }
    case 'ghost': {
      if (!site) return { status: 'not_configured', missing: ['cms_site_url'] };
      const tok = await ghostToken(cred);
      if (!tok) return fail('Ghost Admin API key must look like id:secret');
      const r = await safeJson<{ posts?: { id: string; url?: string }[] }>(`${site.origin}/ghost/api/admin/posts/?source=html`, {
        integration: 'cms', extraHosts: [site.hostname], method: 'POST',
        headers: { authorization: `Ghost ${tok}`, 'accept-version': 'v5.0', 'content-type': 'application/json' },
        body: JSON.stringify({ posts: [{ title: doc.title, slug: doc.slug, custom_excerpt: doc.metaDescription.slice(0, 300), html, status: 'draft', codeinjection_head: jsonLdScript(ld) }] }),
      });
      const id = r.data?.posts?.[0]?.id;
      if (!r.ok || !id) return fail(`Ghost refused the draft (HTTP ${r.status})`);
      return { status: 'ok', platform: cms, postId: id, postUrl: `${site.origin}/ghost/#/editor/post/${id}` };
    }
    case 'sanity': {
      if (!project || !dataset) return { status: 'not_configured', missing: ['cms_project_id', 'cms_dataset'] };
      const id = `drafts.beacon-${doc.slug}-${Date.now()}`;
      const blocks = [doc.intro, ...doc.items.map((it, i) => `${i + 1}. ${it.name}: ${it.summary}`), ...doc.faq.map((q) => `${q.question} ${q.answer}`)].map((t, i) => ({
        _type: 'block', _key: `b${i}`, style: 'normal', markDefs: [], children: [{ _type: 'span', _key: `s${i}`, text: t, marks: [] }] }));
      const r = await safeJson(`https://${project}.api.sanity.io/v2021-06-07/data/mutate/${encodeURIComponent(dataset)}`, {
        integration: 'cms', method: 'POST', headers: { authorization: `Bearer ${cred}`, 'content-type': 'application/json' },
        body: JSON.stringify({ mutations: [{ create: { _id: id, _type: 'post', title: doc.title, slug: { _type: 'slug', current: doc.slug }, body: blocks, jsonLd: JSON.stringify(ld) } }] }),
      });
      if (!r.ok) return fail(`Sanity refused the draft (HTTP ${r.status}): token may be read-only`);
      return { status: 'ok', platform: cms, postId: id, postUrl: `https://${project}.sanity.studio/intent/edit/id=${encodeURIComponent(id.replace(/^drafts\./, ''))};type=post` };
    }
    case 'webflow': {
      if (!dataset) return { status: 'not_configured', missing: ['cms_dataset (Webflow blog collection ID)'] };
      const r = await safeJson<{ id?: string }>(`https://api.webflow.com/v2/collections/${encodeURIComponent(dataset)}/items`, {
        integration: 'cms', method: 'POST', headers: { authorization: `Bearer ${cred}`, 'content-type': 'application/json' },
        body: JSON.stringify({ isDraft: true, isArchived: false, fieldData: { name: doc.title, slug: doc.slug, 'post-body': `${html}\n${jsonLdScript(ld)}`, 'post-summary': doc.metaDescription } }),
      });
      if (!r.ok || !r.data?.id) return fail(`Webflow refused the draft (HTTP ${r.status}): check the collection's field names`);
      return { status: 'ok', platform: cms, postId: r.data.id, postUrl: `https://webflow.com/dashboard/sites/${encodeURIComponent(project ?? '')}/cms/${encodeURIComponent(dataset)}/${r.data.id}` };
    }
    default:
      return { status: 'not_configured', missing: [`Draft creation is not automated for ${cms}`] };
  }
}

async function toGithub(orgId: string, d: Record<string, unknown>, doc: ListicleDoc): Promise<PublishResult> {
  const repo = str(d.github_repo)!;
  const method = str(d.github_method);
  const token = method === 'token' ? await secret(orgId, 'github', 'github_token') : process.env.AGENCY_GITHUB_TOKEN?.trim() || null;
  if (!token) return { status: 'not_configured', missing: [method === 'token' ? 'github_token (stored secret)' : 'AGENCY_GITHUB_TOKEN'] };
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'beacon-geo', 'content-type': 'application/json' };
  const api = `https://api.github.com/repos/${repo}`;
  const meta = await safeJson<{ default_branch?: string; permissions?: { push?: boolean } }>(api, { integration: 'github', headers });
  if (!meta.ok) return fail(`Repository not reachable (HTTP ${meta.status})`);
  const base = str(d.github_branch) ?? meta.data?.default_branch ?? 'main';
  const ref = await safeJson<{ object?: { sha?: string } }>(`${api}/git/ref/heads/${encodeURIComponent(base)}`, { integration: 'github', headers });
  const sha = ref.data?.object?.sha;
  if (!sha) return fail(`Base branch ${base} not found`);
  const branch = `beacon/listicle-${doc.slug}-${Date.now().toString(36)}`;
  const mk = await safeJson(`${api}/git/refs`, { integration: 'github', method: 'POST', headers, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) });
  if (!mk.ok) return fail(`Could not create branch (HTTP ${mk.status})`);
  const dir = (str(d.github_content_path) ?? 'content/blog').replace(/^\/|\/$/g, '');
  const path = `${dir}/${doc.slug}.md`;
  const front = ['---', `title: ${JSON.stringify(doc.title)}`, `description: ${JSON.stringify(doc.metaDescription)}`, `slug: ${doc.slug}`, `date: ${new Date().toISOString().slice(0, 10)}`, 'draft: true', '---', ''].join('\n');
  const put = await safeJson(`${api}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    integration: 'github', method: 'PUT', headers,
    body: JSON.stringify({ message: `Add draft: ${doc.title}`, branch, content: Buffer.from(front + renderMarkdown(doc, { jsonLd: true })).toString('base64') }),
  });
  if (!put.ok) return fail(`Could not commit the file (HTTP ${put.status})`);
  const pr = await safeJson<{ html_url?: string; number?: number }>(`${api}/pulls`, {
    integration: 'github', method: 'POST', headers,
    body: JSON.stringify({ title: `Draft: ${doc.title}`, head: branch, base, draft: true, body: 'Draft listicle prepared by Beacon GEO. Review, edit and merge to publish. Nothing goes live until you merge.' }),
  });
  if (!pr.ok || !pr.data?.html_url) return fail(`Branch pushed but the pull request failed (HTTP ${pr.status})`);
  return { status: 'ok', platform: 'github', postId: String(pr.data.number), postUrl: pr.data.html_url };
}

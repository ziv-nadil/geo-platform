import 'server-only';
import { SignJWT } from 'jose';
import { withService } from '../db';
import { safeFetch, safeJson } from '../net/safe-fetch';
import { readSecret } from '../secrets/broker';
import { buildJsonLd, jsonLdScript } from '../../content-gaps/jsonld';
import { renderHtml, renderMarkdown, type ListicleDoc } from '../../content-gaps/listicle';
import { buildArticleJsonLd, renderArticleHtml, renderArticleMarkdown, type ArticleDoc, type AssetMap } from '../../content/article';

/**
 * Deliver an APPROVED listicle to the client's own site as a DRAFT (never live): WordPress/Ghost/Sanity/
 * Webflow drafts, or a draft GitHub PR with Markdown. Credentials come from onboarding answers plus the
 * secrets broker (purpose 'job', logged). The client publishes from inside their CMS / by merging the PR.
 */
export type PublishResult =
  | { status: 'ok'; platform: string; postId: string; postUrl: string }
  | { status: 'not_configured'; missing: string[] }
  | { status: 'error'; message: string };

export const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
export const fail = (message: string): PublishResult => ({ status: 'error', message });

export async function stepData(orgId: string): Promise<Record<string, Record<string, unknown>>> {
  const rows = await withService((sql) => sql`select step_id, data from public.onboarding_progress where org_id = ${orgId} and step_id in ('cms','github')`);
  return Object.fromEntries(rows.map((r) => [r.step_id as string, (r.data ?? {}) as Record<string, unknown>]));
}

export type Target = 'auto' | 'cms' | 'github';

export async function publishDraft(orgId: string, doc: ListicleDoc, target: Target = 'auto'): Promise<PublishResult> {
  const data = await stepData(orgId);
  const cmsPlatform = str(data.cms?.cms_platform);
  const cmsUsable = !!cmsPlatform && !['other', 'framer', 'git'].includes(cmsPlatform);
  const ghUsable = !!str(data.github?.github_repo);
  const pick = target === 'cms' ? (cmsUsable ? 'cms' : null) : target === 'github' ? (ghUsable ? 'github' : null) : cmsUsable ? 'cms' : ghUsable ? 'github' : null;
  if (!pick) return { status: 'not_configured', missing: ['A connected CMS (WordPress, Ghost, Sanity, Webflow) or GitHub blog repo: finish the CMS or GitHub step in onboarding'] };
  try {
    return pick === 'cms' ? await toCms(orgId, data.cms ?? {}, cmsPlatform!, doc) : await toGithub(orgId, data.github ?? {}, doc);
  } catch (e) {
    return fail(e instanceof Error ? e.message.slice(0, 200) : 'Publishing failed');
  }
}

export async function secret(orgId: string, stepId: string, fieldId: string): Promise<string | null> {
  const r = await readSecret({ orgId, purpose: 'job', worker: 'content-gaps-publish' }, { stepId, fieldId });
  return r.status === 'ok' ? r.value : null;
}

export async function ghostToken(adminKey: string): Promise<string | null> {
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
    body: JSON.stringify({ title: `Draft: ${doc.title}`, head: branch, base, draft: true, body: 'Draft listicle prepared by ASO Engine. Review, edit and merge to publish. Nothing goes live until you merge.' }),
  });
  if (!pr.ok || !pr.data?.html_url) return fail(`Branch pushed but the pull request failed (HTTP ${pr.status})`);
  return { status: 'ok', platform: 'github', postId: String(pr.data.number), postUrl: pr.data.html_url };
}


// ---------------------------------------------------------------------------------------------
// GEO articles: upload images to the client's CMS/repo, then create a DRAFT post (never live).
// ---------------------------------------------------------------------------------------------
export interface ArticleImage { id: string; kind: 'hero' | 'illustration' | 'chart'; alt: string; mime: string; bytes: Buffer }

const fileName = (slug: string, im: ArticleImage) => `${slug}-${im.id}.${im.mime === 'image/jpeg' ? 'jpg' : im.mime === 'image/svg+xml' ? 'svg' : im.mime.split('/')[1]}`;

export async function publishArticleDraft(orgId: string, doc: ArticleDoc, images: ArticleImage[], brandName: string, target: Target = 'auto'): Promise<PublishResult> {
  const data = await stepData(orgId);
  const cmsPlatform = str(data.cms?.cms_platform);
  const cmsUsable = !!cmsPlatform && !['other', 'framer', 'git'].includes(cmsPlatform);
  const ghUsable = !!str(data.github?.github_repo);
  const pick = target === 'cms' ? (cmsUsable ? 'cms' : null) : target === 'github' ? (ghUsable ? 'github' : null) : cmsUsable ? 'cms' : ghUsable ? 'github' : null;
  if (!pick) return { status: 'not_configured', missing: ['A connected CMS (WordPress, Ghost, Sanity, Webflow) or GitHub blog repo: finish the CMS or GitHub step in onboarding'] };
  try {
    return pick === 'cms' ? await articleToCms(orgId, data.cms ?? {}, cmsPlatform!, doc, images, brandName) : await articleToGithub(orgId, data.github ?? {}, doc, images, brandName);
  } catch (e) { return fail(e instanceof Error ? e.message.slice(0, 200) : 'Publishing failed'); }
}

const noHero = (a: AssetMap): AssetMap => Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'hero'));

/** Charts are SVG: most CMSs refuse SVG uploads, so they are inlined in the HTML body. Raster images are uploaded. */
function inlineCharts(images: ArticleImage[], assets: AssetMap) {
  for (const im of images) if (im.mime === 'image/svg+xml') assets[im.id] = { url: '', alt: im.alt, inline: im.bytes.toString('utf8') };
}

async function articleToCms(orgId: string, d: Record<string, unknown>, cms: string, doc: ArticleDoc, images: ArticleImage[], brandName: string): Promise<PublishResult> {
  const cred = await secret(orgId, 'cms', 'cms_api_credential');
  if (!cred) return { status: 'not_configured', missing: ['cms_api_credential (stored secret)'] };
  const site = str(d.cms_site_url) ? new URL(str(d.cms_site_url)!) : null;
  const project = str(d.cms_project_id), dataset = str(d.cms_dataset);
  const raster = images.filter((i) => i.mime !== 'image/svg+xml');
  const assets: AssetMap = {};
  inlineCharts(images, assets);
  const ldFor = () => jsonLdScript(buildArticleJsonLd(doc, { publisher: brandName, author: brandName, heroUrl: assets.hero?.url || null }) as never);
  const ok = (r: { ok: boolean }, what: string) => { if (!r.ok) throw new Error(`${what} (image upload failed)`); };

  switch (cms) {
    case 'wordpress': {
      const user = str(d.cms_username);
      if (!site || !user) return { status: 'not_configured', missing: ['cms_site_url', 'cms_username'] };
      const auth = `Basic ${Buffer.from(`${user}:${cred}`).toString('base64')}`;
      let featured: number | undefined;
      for (const im of raster) {
        const up = await safeFetch(`${site.origin}/wp-json/wp/v2/media`, { integration: 'cms', extraHosts: [site.hostname], method: 'POST', headers: { authorization: auth, 'content-disposition': `attachment; filename="${fileName(doc.slug, im)}"`, 'content-type': im.mime }, body: new Uint8Array(im.bytes) });
        ok(up, 'WordPress'); const m = (await up.json()) as { id?: number; source_url?: string };
        if (!m.id || !m.source_url) throw new Error('WordPress media response was empty');
        await safeJson(`${site.origin}/wp-json/wp/v2/media/${m.id}`, { integration: 'cms', extraHosts: [site.hostname], method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ alt_text: im.alt }) });
        assets[im.id] = { url: m.source_url, alt: im.alt };
        if (im.id === 'hero') featured = m.id;
      }
      const r = await safeJson<{ id?: number }>(`${site.origin}/wp-json/wp/v2/posts`, { integration: 'cms', extraHosts: [site.hostname], method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' },
        body: JSON.stringify({ title: doc.title, slug: doc.slug, excerpt: doc.metaDescription, status: 'draft', ...(featured ? { featured_media: featured } : {}), content: `${renderArticleHtml(doc, noHero(assets))}\n${ldFor()}` }) });
      if (!r.ok || !r.data?.id) return fail(`WordPress refused the draft (HTTP ${r.status})`);
      return { status: 'ok', platform: cms, postId: String(r.data.id), postUrl: `${site.origin}/wp-admin/post.php?post=${r.data.id}&action=edit` };
    }
    case 'ghost': {
      if (!site) return { status: 'not_configured', missing: ['cms_site_url'] };
      const tok = await ghostToken(cred);
      if (!tok) return fail('Ghost Admin API key must look like id:secret');
      for (const im of raster) {
        const fd = new FormData();
        fd.append('file', new Blob([new Uint8Array(im.bytes)], { type: im.mime }), fileName(doc.slug, im)); fd.append('purpose', 'image'); fd.append('ref', im.alt.slice(0, 120));
        const up = await safeFetch(`${site.origin}/ghost/api/admin/images/upload/`, { integration: 'cms', extraHosts: [site.hostname], method: 'POST', headers: { authorization: `Ghost ${tok}`, 'accept-version': 'v5.0' }, body: fd });
        ok(up, 'Ghost'); const m = (await up.json()) as { images?: { url?: string }[] };
        if (m.images?.[0]?.url) assets[im.id] = { url: m.images[0].url, alt: im.alt };
      }
      const r = await safeJson<{ posts?: { id: string }[] }>(`${site.origin}/ghost/api/admin/posts/?source=html`, { integration: 'cms', extraHosts: [site.hostname], method: 'POST', headers: { authorization: `Ghost ${tok}`, 'accept-version': 'v5.0', 'content-type': 'application/json' },
        body: JSON.stringify({ posts: [{ title: doc.title, slug: doc.slug, custom_excerpt: doc.metaDescription.slice(0, 300), html: renderArticleHtml(doc, noHero(assets)), status: 'draft', ...(assets.hero?.url ? { feature_image: assets.hero.url, feature_image_alt: assets.hero.alt } : {}), codeinjection_head: ldFor() }] }) });
      const id = r.data?.posts?.[0]?.id;
      if (!r.ok || !id) return fail(`Ghost refused the draft (HTTP ${r.status})`);
      return { status: 'ok', platform: cms, postId: id, postUrl: `${site.origin}/ghost/#/editor/post/${id}` };
    }
    case 'sanity': {
      if (!project || !dataset) return { status: 'not_configured', missing: ['cms_project_id', 'cms_dataset'] };
      const refs: Record<string, string> = {};
      for (const im of raster) {
        const up = await safeFetch(`https://${project}.api.sanity.io/v2021-06-07/assets/images/${encodeURIComponent(dataset)}?filename=${encodeURIComponent(fileName(doc.slug, im))}`, { integration: 'cms', method: 'POST', headers: { authorization: `Bearer ${cred}`, 'content-type': im.mime }, body: new Uint8Array(im.bytes) });
        ok(up, 'Sanity'); const m = (await up.json()) as { document?: { _id?: string; url?: string } };
        if (m.document?._id) { refs[im.id] = m.document._id; assets[im.id] = { url: m.document.url ?? '', alt: im.alt }; }
      }
      let k = 0; const key = () => `k${k++}`;
      const block = (style: string, text: string) => ({ _type: 'block', _key: key(), style, markDefs: [], children: [{ _type: 'span', _key: key(), text, marks: [] }] });
      const img = (id: string) => (refs[id] ? [{ _type: 'image', _key: key(), asset: { _type: 'reference', _ref: refs[id] }, alt: assets[id]?.alt }] : []);
      const body = [block('normal', doc.directAnswer), ...doc.sections.flatMap((s, i) => [
        block('h2', s.heading), ...s.body.split(/\n{2,}/).map((p) => block('normal', p)),
        ...(s.table ? s.table.rows.map((r) => block('normal', r.map((v, n) => `${s.table!.columns[n]}: ${v}`).join(' | '))) : []),
        ...img(`illustration-${i}`), ...s.subsections.flatMap((x) => [block('h3', x.heading), block('normal', x.body)]),
      ]), ...(doc.faq.length ? [block('h2', 'FAQ'), ...doc.faq.flatMap((q) => [block('h3', q.question), block('normal', q.answer)])] : [])];
      const id = `drafts.beacon-${doc.slug}-${Date.now()}`;
      const r = await safeJson(`https://${project}.api.sanity.io/v2021-06-07/data/mutate/${encodeURIComponent(dataset)}`, { integration: 'cms', method: 'POST', headers: { authorization: `Bearer ${cred}`, 'content-type': 'application/json' },
        body: JSON.stringify({ mutations: [{ create: { _id: id, _type: 'post', title: doc.title, slug: { _type: 'slug', current: doc.slug }, excerpt: doc.metaDescription, ...(refs.hero ? { mainImage: { _type: 'image', asset: { _type: 'reference', _ref: refs.hero }, alt: assets.hero?.alt } } : {}), body, html: renderArticleHtml(doc, noHero(assets)), jsonLd: JSON.stringify(buildArticleJsonLd(doc, { publisher: brandName })) } }] }) });
      if (!r.ok) return fail(`Sanity refused the draft (HTTP ${r.status}): token may be read-only`);
      return { status: 'ok', platform: cms, postId: id, postUrl: `https://${project}.sanity.studio/intent/edit/id=${encodeURIComponent(id.replace(/^drafts\./, ''))};type=post` };
    }
    case 'webflow': {
      if (!dataset) return { status: 'not_configured', missing: ['cms_dataset (Webflow blog collection ID)'] };
      if (raster.length && !project) return { status: 'not_configured', missing: ['cms_project_id (Webflow site ID, needed to upload images)'] };
      const { createHash } = await import('node:crypto');
      for (const im of raster) {
        const slot = await safeJson<{ uploadUrl?: string; uploadDetails?: Record<string, string>; hostedUrl?: string }>(`https://api.webflow.com/v2/sites/${encodeURIComponent(project!)}/assets`, { integration: 'cms', method: 'POST', headers: { authorization: `Bearer ${cred}`, 'content-type': 'application/json' }, body: JSON.stringify({ fileName: fileName(doc.slug, im), fileHash: createHash('md5').update(im.bytes).digest('hex') }) });
        if (!slot.ok || !slot.data?.uploadUrl || !slot.data.uploadDetails) throw new Error(`Webflow asset slot failed (HTTP ${slot.status})`);
        const fd = new FormData();
        for (const [k2, v] of Object.entries(slot.data.uploadDetails)) fd.append(k2, v);
        fd.append('file', new Blob([new Uint8Array(im.bytes)], { type: im.mime }), fileName(doc.slug, im));
        const up = await safeFetch(slot.data.uploadUrl, { integration: 'aws', method: 'POST', body: fd });
        ok(up, 'Webflow');
        if (slot.data.hostedUrl) assets[im.id] = { url: slot.data.hostedUrl, alt: im.alt };
      }
      const r = await safeJson<{ id?: string }>(`https://api.webflow.com/v2/collections/${encodeURIComponent(dataset)}/items`, { integration: 'cms', method: 'POST', headers: { authorization: `Bearer ${cred}`, 'content-type': 'application/json' },
        body: JSON.stringify({ isDraft: true, isArchived: false, fieldData: { name: doc.title, slug: doc.slug, 'post-body': `${renderArticleHtml(doc, noHero(assets))}\n${ldFor()}`, 'post-summary': doc.metaDescription, ...(assets.hero?.url ? { 'main-image': { url: assets.hero.url, alt: assets.hero.alt } } : {}) } }) });
      if (!r.ok || !r.data?.id) return fail(`Webflow refused the draft (HTTP ${r.status}): check the collection's field names`);
      return { status: 'ok', platform: cms, postId: r.data.id, postUrl: `https://webflow.com/dashboard/sites/${encodeURIComponent(project ?? '')}/cms/${encodeURIComponent(dataset)}/${r.data.id}` };
    }
    default:
      return { status: 'not_configured', missing: [`Draft creation is not automated for ${cms}`] };
  }
}

async function articleToGithub(orgId: string, d: Record<string, unknown>, doc: ArticleDoc, images: ArticleImage[], brandName: string): Promise<PublishResult> {
  const repo = str(d.github_repo)!;
  const method = str(d.github_method);
  const token = method === 'token' ? await secret(orgId, 'github', 'github_token') : process.env.AGENCY_GITHUB_TOKEN?.trim() || null;
  if (!token) return { status: 'not_configured', missing: [method === 'token' ? 'github_token (stored secret)' : 'AGENCY_GITHUB_TOKEN'] };
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'beacon-geo', 'content-type': 'application/json' };
  const api = `https://api.github.com/repos/${repo}`;
  const meta = await safeJson<{ default_branch?: string }>(api, { integration: 'github', headers });
  if (!meta.ok) return fail(`Repository not reachable (HTTP ${meta.status})`);
  const base = str(d.github_branch) ?? meta.data?.default_branch ?? 'main';
  const ref = await safeJson<{ object?: { sha?: string } }>(`${api}/git/ref/heads/${encodeURIComponent(base)}`, { integration: 'github', headers });
  const sha = ref.data?.object?.sha;
  if (!sha) return fail(`Base branch ${base} not found`);
  const branch = `beacon/article-${doc.slug}-${Date.now().toString(36)}`;
  const mk = await safeJson(`${api}/git/refs`, { integration: 'github', method: 'POST', headers, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) });
  if (!mk.ok) return fail(`Could not create branch (HTTP ${mk.status})`);
  const dir = (str(d.github_content_path) ?? 'content/blog').replace(/^\/|\/$/g, '');
  const commit = async (path: string, content: Buffer, message: string) => {
    const put = await safeJson(`${api}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, { integration: 'github', method: 'PUT', headers, body: JSON.stringify({ message, branch, content: content.toString('base64') }) });
    if (!put.ok) throw new Error(`Could not commit ${path.split('/').pop()} (HTTP ${put.status})`);
  };
  const assets: AssetMap = {};
  for (const im of images) { const f = fileName(doc.slug, im); await commit(`${dir}/${doc.slug}/${f}`, im.bytes, `Add image: ${f}`); assets[im.id] = { url: `./${doc.slug}/${f}`, alt: im.alt }; }
  const front = ['---', `title: ${JSON.stringify(doc.title)}`, `description: ${JSON.stringify(doc.metaDescription)}`, `slug: ${doc.slug}`, `date: ${new Date().toISOString().slice(0, 10)}`, ...(assets.hero ? [`image: ${JSON.stringify(assets.hero.url)}`, `imageAlt: ${JSON.stringify(assets.hero.alt)}`] : []), 'draft: true', '---', ''].join('\n');
  const md = renderArticleMarkdown(doc, noHero(assets)) + '\n' + jsonLdScript(buildArticleJsonLd(doc, { publisher: brandName, author: brandName }) as never) + '\n';
  await commit(`${dir}/${doc.slug}.md`, Buffer.from(front + md), `Add draft: ${doc.title}`);
  const pr = await safeJson<{ html_url?: string; number?: number }>(`${api}/pulls`, { integration: 'github', method: 'POST', headers, body: JSON.stringify({ title: `Draft: ${doc.title}`, head: branch, base, draft: true, body: 'Draft article prepared by ASO Engine, with images. Review, edit and merge to publish. Nothing goes live until you merge.' }) });
  if (!pr.ok || !pr.data?.html_url) return fail(`Branch pushed but the pull request failed (HTTP ${pr.status})`);
  return { status: 'ok', platform: 'github', postId: String(pr.data.number), postUrl: pr.data.html_url };
}

/**
 * Runs every server query function against the dev database (scripts/dev-db.sh) as real seeded
 * users, with RLS enforced, and prints a compact summary. Exit code 1 on any failure.
 *
 *   cd web && DATABASE_URL=postgres://postgres@localhost:54322/beacon \
 *     NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/validate-queries.ts
 */
import { runAs, getSql } from '@/lib/server/db';
import * as q from '@/lib/server/queries';

const NW = '10000000-0000-4000-b000-000000000001';
const LUMEN = '10000000-0000-4000-b000-000000000002';
const DANA = { sub: '00000000-0000-4000-a000-000000000011', aal: 'aal1' as const }; // Northwind owner
const SAM = { sub: '00000000-0000-4000-a000-000000000012', aal: 'aal1' as const };  // Northwind member
const ADMIN_AAL2 = { sub: '00000000-0000-4000-a000-000000000001', aal: 'aal2' as const };
const ADMIN_AAL1 = { sub: '00000000-0000-4000-a000-000000000001', aal: 'aal1' as const };

let failures = 0;
function check(name: string, cond: boolean, detail: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} ${detail}`);
  if (!cond) failures++;
}

function data<T>(r: q.QueryResult<T>): T {
  if (!r.ok) throw new Error(`query failed: ${r.reason}`);
  return r.data;
}

async function main() {
  await runAs(DANA, async () => {
    const orgs = data(await q.listMyOrgs());
    check('listMyOrgs', orgs.length === 1 && orgs[0].id === NW && orgs[0].role === 'owner', `${orgs.length} org(s): ${orgs.map((o) => `${o.slug}/${o.role}`).join(',')}`);
    const org = data(await q.getOrg(NW));
    check('getOrg', org?.name === 'Northwind Analytics', `${org?.name}`);
    const engines = data(await q.listEngines(NW));
    check('listEngines', engines.filter((e) => e.enabled).length === 5, `${engines.length} engines, ${engines.filter((e) => e.enabled).length} enabled`);

    const ov = data(await q.getOverview(NW, { days: 30 }));
    check('getOverview', ov.kpis.runs > 0 && ov.kpis.visibility.value !== null && ov.series.length > 0,
      `runs=${ov.kpis.runs} vis=${ov.kpis.visibility.value}% (prev ${ov.kpis.visibility.previous}) sov=${ov.kpis.shareOfVoice.value}% cite=${ov.kpis.citationShare.value}% pos=${ov.kpis.avgPosition.value} sent=${ov.kpis.sentiment.value} series=${ov.series.length} topComp=${ov.topCompetitors[0]?.name}`);
    const ov7 = data(await q.getOverview(NW, { days: 7, engines: ['chatgpt'] }));
    check('getOverview (7d, chatgpt)', ov7.byEngine.length === 1 && ov7.byEngine[0].engineId === 'chatgpt', `runs=${ov7.kpis.runs} vis=${ov7.kpis.visibility.value}% delta=${ov7.kpis.visibility.delta}`);

    const topics = data(await q.listTopics(NW));
    check('listTopics', topics.length === 3, topics.map((t) => `${t.name}(${t.promptCount})`).join(', '));
    const prompts = data(await q.listPrompts(NW));
    check('listPrompts', prompts.length === 22 && prompts.every((p) => p.runs > 0), `${prompts.length} prompts; top: "${prompts[0].text}" vis=${prompts[0].visibility}% pos=${prompts[0].avgPosition}`);
    const byTopic = data(await q.listPrompts(NW, { topicId: topics[0].id }));
    check('listPrompts (topic filter)', byTopic.length === topics[0].promptCount, `${byTopic.length} prompts in ${topics[0].name}`);
    const detail = data(await q.getPromptDetail(NW, prompts[0].id));
    check('getPromptDetail', !!detail && detail.byEngine.length === 5 && detail.recentResponses.length > 0,
      `${detail?.byEngine.length} engines, ${detail?.recentResponses.length} responses, ${detail?.competitorsMentioned.length} competitors, ${detail?.topCitations.length} citations`);
    const resp = data(await q.listResponses(NW, { limit: 5, brandMentioned: true }));
    check('listResponses', resp.rows.length === 5 && resp.total > 0 && resp.rows.every((r) => r.brandMentioned), `total=${resp.total}, first has ${resp.rows[0]?.mentions.length} mentions / ${resp.rows[0]?.citations.length} citations`);

    const comps = data(await q.listCompetitors(NW));
    check('listCompetitors', comps.length === 5, comps.map((c) => c.name).join(', '));
    const sov = data(await q.getCompetitorSov(NW));
    const sum = sov.entities.reduce((a, e) => a + e.shareOfVoice, 0);
    check('getCompetitorSov', sov.entities.length === 6 && Math.abs(sum - 100) < 0.1 && sov.series.length > 0,
      sov.entities.map((e) => `${e.name} ${e.shareOfVoice}%`).join(', '));

    const cit = data(await q.getCitations(NW));
    check('getCitations', cit.domains.length > 0 && cit.byType.length === 5, `${cit.domains.length} domains, ${cit.urls.length} urls; types: ${cit.byType.map((t) => `${t.sourceType} ${t.share}%`).join(', ')}`);
    const tags = data(await q.listSourceTags(NW));
    check('listSourceTags', tags.length === 2 && tags.every((t) => t.citations > 0), tags.map((t) => `${t.name}: ${t.rules.length} rules, ${t.citations} citations`).join('; '));

    const sent = data(await q.getSentiment(NW));
    check('getSentiment', sent.totals.positive + sent.totals.neutral + sent.totals.negative > 0 && sent.samples.length > 0,
      `+${sent.totals.positive} =${sent.totals.neutral} -${sent.totals.negative} avg=${sent.totals.average} series=${sent.series.length}`);

    const sh = data(await q.getSiteHealth(NW));
    check('getSiteHealth', sh.properties.length === 1 && sh.issues.length === 2 && sh.pages.length === 3, `score=${sh.properties[0]?.score} issues=${sh.issues.length} pages=${sh.pages.length}`);
    const ch = data(await q.getCrawlerHits(NW, { days: 14 }));
    check('getCrawlerHits', ch.totals.length === 6 && ch.series.length > 0, ch.totals.map((t) => `${t.bot}:${t.hits}`).join(', '));

    const kit = data(await q.getBrandKit(NW));
    check('getBrandKit', !!kit.profile && kit.personas.length === 2 && kit.competitors.length === 5, `${kit.profile?.display_name}; ${kit.personas.length} personas, ${kit.messaging.length} messages, ${kit.voiceTerms.length} voice terms`);
    const content = data(await q.listContentItems(NW));
    check('listContentItems', content.length === 2, content.map((c) => `${c.title} [${c.status}]`).join('; '));
    const creators = data(await q.listCreators(NW));
    check('listCreators', creators.length === 3, creators.map((c) => `${c.platform}:${c.handle}`).join(', '));
    const outreach = data(await q.listOutreach(NW));
    check('listOutreach', outreach.length === 3, outreach.map((o) => `${o.publication} [${o.status}]`).join('; '));
    const reports = data(await q.listReports(NW));
    check('listReports', reports.length === 1, reports.map((r) => r.title).join('; '));

    const members = data(await q.listMembers(NW));
    check('listMembers (no staff)', members.length === 2 && !members.some((m) => m.email?.includes('beacon-geo')), members.map((m) => `${m.fullName}/${m.role}`).join(', '));
    const inv = data(await q.listInvitations(NW));
    check('listInvitations (owner)', inv.length === 1, inv.map((i) => `${i.email}/${i.role}`).join(', '));
    const keys = data(await q.listApiKeys(NW));
    check('listApiKeys (owner)', keys.length === 1, keys.map((k) => k.prefix).join(', '));
    const bill = data(await q.getBilling(NW));
    check('getBilling (owner)', bill.plan?.id === 'growth' && bill.subscription?.status === 'active' && bill.usage.length > 0, `plan=${bill.plan?.name} sub=${bill.subscription?.status} usage=${bill.usage.map((u) => `${u.metric}@${u.periodStart}=${u.value}`).join(',')}`);
    const onb = data(await q.getOnboardingProgress(NW));
    check('getOnboardingProgress', onb.summary.complete === 15 && onb.summary.total === 15, `${onb.summary.complete}/${onb.summary.total} complete`);

    // tenancy: Dana cannot read Lumen
    const lumen = await q.getOverview(LUMEN);
    check('cross-tenant blocked', !lumen.ok && lumen.reason === 'forbidden', JSON.stringify(lumen));
    const adminAsClient = await q.adminListOrgs();
    check('adminListOrgs as client', !adminAsClient.ok, JSON.stringify(adminAsClient));
  });

  await runAs(SAM, async () => {
    const inv = data(await q.listInvitations(NW));
    const keys = data(await q.listApiKeys(NW));
    const bill = data(await q.getBilling(NW));
    check('member: admin-only data hidden', inv.length === 0 && keys.length === 0 && bill.subscription === null, `invitations=${inv.length} keys=${keys.length} subscription=${bill.subscription}`);
  });

  await runAs({ sub: '00000000-0000-4000-a000-000000000021', aal: 'aal1' }, async () => {
    const onb = data(await q.getOnboardingProgress(LUMEN));
    check('getOnboardingProgress (Lumen)', onb.summary.complete === 3 && onb.summary.needsAttention === 1 && onb.latestTests.length === 1,
      `${onb.summary.complete} complete, ${onb.summary.needsAttention} needs attention, latest test gsc=${onb.latestTests[0]?.status}`);
  });

  await runAs(ADMIN_AAL1, async () => {
    const r = await q.adminListOrgs();
    check('adminListOrgs aal1 refused', !r.ok && r.reason === 'forbidden', JSON.stringify(r));
    const o = await q.getOverview(NW);
    check('staff without grant: no tenant data', !o.ok && o.reason === 'forbidden', JSON.stringify(o));
  });
  await runAs(ADMIN_AAL2, async () => {
    const r = data(await q.adminListOrgs());
    check('adminListOrgs (aal2 staff)', r.length === 2, r.map((o) => `${o.slug}: ${o.members} members, ${o.onboardingComplete} steps, sub=${o.subscriptionStatus}, runs30d=${o.runs30d}`).join('; '));
  });

  const sql = getSql()!;
  const [{ n }] = await sql`select count(*)::int as n from public.platform_audit_log where action = 'admin.console.view'`;
  check('admin console audited', n >= 1, `${n} admin.console.view row(s)`);
  await sql.end();

  console.log(failures ? `\n${failures} FAILED` : '\nALL QUERY CHECKS PASSED');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

-- Beacon GEO demo seed (LOCAL / PREVIEW ONLY: `supabase db reset` loads it; never push it to prod).
--
-- Everything here is fictional demo data, flagged with settings.demo = true on the orgs and
-- raw.demo = true on responses. Domains use the reserved .example TLD.
-- Values are deterministic (md5-based), so every reset produces the same dashboard.
--
-- Users have NO password. Sign in locally with a magic link (Mailpit/Inbucket at :54324),
-- or replace the placeholder super admin with your own account:
--   insert into public.platform_admins (user_id) values ('<your auth.users id>');

-- Deterministic pseudo-random in [0,1)
create or replace function pg_temp.rnd(seed text) returns double precision
language sql immutable as $$
  select ('x' || substr(md5(seed), 1, 8))::bit(32)::bigint / 4294967296.0
$$;

-- ---------------------------------------------------------------------------
-- Users (super admin placeholder + client users)
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated',
   'admin@beacon-geo.example', now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Beacon Super Admin (placeholder)"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000011', 'authenticated', 'authenticated',
   'dana@northwind.example', now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Dana Whitfield"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000012', 'authenticated', 'authenticated',
   'sam@northwind.example', now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Sam Okafor"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000021', 'authenticated', 'authenticated',
   'maya@lumen.example', now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Maya Lindqvist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000022', 'authenticated', 'authenticated',
   'leo@lumen.example', now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Leo Marchetti"}', now(), now())
on conflict (id) do nothing;

-- In case the profile trigger did not run (e.g. users pre-existed)
insert into public.profiles (id, email, full_name)
select u.id, u.email, u.raw_user_meta_data ->> 'full_name' from auth.users u
where u.id::text like '00000000-0000-4000-a000-%'
on conflict (id) do nothing;

insert into public.platform_admins (user_id, note)
values ('00000000-0000-4000-a000-000000000001', 'Demo placeholder. Replace with a real staff account.')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, slug, website, plan, status, settings) values
  ('10000000-0000-4000-b000-000000000001', 'Northwind Analytics', 'northwind', 'https://www.northwind.example', 'growth',  'active',     '{"demo": true}'),
  ('10000000-0000-4000-b000-000000000002', 'Lumen Skincare',      'lumen',     'https://lumen.example',         'starter', 'onboarding', '{"demo": true}')
on conflict (id) do nothing;

insert into public.memberships (org_id, user_id, role) values
  ('10000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000011', 'owner'),
  ('10000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000012', 'member'),
  ('10000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000021', 'owner'),
  ('10000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000022', 'viewer')
on conflict do nothing;

insert into public.invitations (org_id, email, role, token_hash, expires_at) values
  ('10000000-0000-4000-b000-000000000001', 'priya@northwind.example', 'member',
   encode(extensions.digest('demo-invite-token-northwind', 'sha256'), 'hex'), now() + interval '10 days');

insert into public.org_engines (org_id, engine_id)
select o.id, e.id from public.organizations o
cross join (values ('chatgpt'), ('perplexity'), ('gemini'), ('claude'), ('google_aio')) e(id)
where o.settings ->> 'demo' = 'true'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Brand book
-- ---------------------------------------------------------------------------
insert into public.brand_profiles (org_id, legal_name, display_name, tagline, description, industry, founded_year,
                                   headquarters, employee_range, target_markets, products, value_props, differentiators, social_links, colors) values
  ('10000000-0000-4000-b000-000000000001', 'Northwind Analytics Inc.', 'Northwind', 'Product analytics your whole team can read',
   'Northwind is a product analytics platform for B2B SaaS teams. It turns raw event data into funnels, retention and revenue views without SQL.',
   'B2B SaaS / Analytics', 2019, 'Austin, TX', '51-200', '{US,UK,DE}',
   '[{"name":"Northwind Insights","url":"https://www.northwind.example/insights","description":"Self-serve product analytics"},{"name":"Northwind Warehouse Sync","url":"https://www.northwind.example/sync","description":"Reverse ETL to Snowflake and BigQuery"}]',
   '{"No-SQL funnels and retention","Warehouse-native","Transparent per-event pricing"}',
   '{"Setup in under a day","SOC 2 Type II"}',
   '{"linkedin":"https://www.linkedin.example/company/northwind","x":"https://x.example/northwind"}',
   '[{"name":"Navy","hex":"#1E2A5A"},{"name":"Teal","hex":"#14B8A6"}]'),
  ('10000000-0000-4000-b000-000000000002', 'Lumen Skincare Ltd.', 'Lumen', 'Gentle skincare backed by dermatology',
   'Lumen makes fragrance-free skincare for sensitive skin, formulated with dermatologists and sold direct to consumers.',
   'Beauty / DTC', 2021, 'London, UK', '11-50', '{UK,US}',
   '[{"name":"Barrier Repair Serum","url":"https://lumen.example/serum","description":"Ceramide serum"},{"name":"Daily Mineral SPF 50","url":"https://lumen.example/spf","description":"Mineral sunscreen"}]',
   '{"Fragrance-free","Dermatologist co-formulated","Refillable packaging"}',
   '{"Clinical patch testing on every batch"}',
   '{"instagram":"https://instagram.example/lumen"}',
   '[{"name":"Sand","hex":"#F4EDE4"},{"name":"Ink","hex":"#1F2937"}]')
on conflict (org_id) do nothing;

insert into public.brand_personas (id, org_id, name, role_title, description, goals, pain_points) values
  ('20000000-0000-4000-c000-000000000001', '10000000-0000-4000-b000-000000000001', 'Growth PM', 'Senior Product Manager',
   'Owns activation and retention metrics at a Series B SaaS company.', '{"Find drop-off points fast","Prove feature impact"}', '{"Waiting on data team for SQL","Tools disagree on numbers"}'),
  ('20000000-0000-4000-c000-000000000002', '10000000-0000-4000-b000-000000000001', 'Data Lead', 'Head of Data',
   'Runs a 4-person data team and owns the warehouse.', '{"One source of truth","Low maintenance"}', '{"Shadow analytics tools","Event tracking drift"}'),
  ('20000000-0000-4000-c000-000000000003', '10000000-0000-4000-b000-000000000002', 'Sensitive-skin shopper', 'Consumer, 25-40',
   'Researches ingredients before buying, reads Reddit and dermatologist reviews.', '{"Calm redness","Avoid irritation"}', '{"Fragrance reactions","Confusing ingredient lists"}')
on conflict (id) do nothing;

insert into public.brand_messaging (org_id, kind, title, content, sort_order) values
  ('10000000-0000-4000-b000-000000000001', 'pillar', 'One-liner', 'Product analytics your whole team can read, without SQL.', 1),
  ('10000000-0000-4000-b000-000000000001', 'claim', 'Speed', 'Most teams ship their first funnel in under a day.', 2),
  ('10000000-0000-4000-b000-000000000002', 'pillar', 'One-liner', 'Fragrance-free skincare co-formulated with dermatologists.', 1);

insert into public.brand_voice_terms (org_id, kind, term, replacement) values
  ('10000000-0000-4000-b000-000000000001', 'use', 'warehouse-native', null),
  ('10000000-0000-4000-b000-000000000001', 'avoid', 'cheap', 'transparent pricing'),
  ('10000000-0000-4000-b000-000000000002', 'avoid', 'cure', 'help calm'),
  ('10000000-0000-4000-b000-000000000002', 'trademark', 'Lumen Barrier Complex', null)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Onboarding progress (Northwind done, Lumen mid-way)
-- ---------------------------------------------------------------------------
insert into public.onboarding_progress (org_id, step_id, status, data)
select '10000000-0000-4000-b000-000000000001', s, 'complete', '{}'::jsonb
from unnest(array['company','brand_book','access_method','github','cms','gsc','bing','ga4','google_cloud','dns','analytics_tools','cloud_storage','cdn_crawlers','chat','review']) s
on conflict do nothing;

insert into public.onboarding_progress (org_id, step_id, status, data, notes) values
  ('10000000-0000-4000-b000-000000000002', 'company',       'complete',        '{"company_name":"Lumen Skincare","website_url":"https://lumen.example"}', null),
  ('10000000-0000-4000-b000-000000000002', 'brand_book',    'complete',        '{}', null),
  ('10000000-0000-4000-b000-000000000002', 'access_method', 'complete',        '{"access_method":"agency_email"}', null),
  ('10000000-0000-4000-b000-000000000002', 'github',        'not_started',     '{}', null),
  ('10000000-0000-4000-b000-000000000002', 'cms',           'in_progress',     '{"cms_platform":"shopify","cms_site_url":"https://lumen-skincare.myshopify.example"}', null),
  ('10000000-0000-4000-b000-000000000002', 'gsc',           'needs_attention', '{"gsc_property":"sc-domain:lumen.example"}', 'Access is Full, not Owner.')
on conflict do nothing;

insert into public.integration_tests (org_id, step_id, status, checks, missing, duration_ms, created_at) values
  ('10000000-0000-4000-b000-000000000002', 'gsc', 'partial',
   '[{"id":"gsc_property_visible","label":"Property visible to us","ok":true,"detail":"sc-domain:lumen.example found"},{"id":"gsc_owner_level","label":"Owner permission level","ok":false,"detail":"GSC access is Full, not Owner"}]',
   '{"Owner permission in Search Console"}', 812, now() - interval '2 hours');

-- ---------------------------------------------------------------------------
-- Brands, competitors, topics, prompts
-- ---------------------------------------------------------------------------
insert into public.brands (id, org_id, name, domain, aliases, is_primary) values
  ('30000000-0000-4000-d000-000000000001', '10000000-0000-4000-b000-000000000001', 'Northwind', 'northwind.example', '{"Northwind Analytics","Northwind Insights"}', true),
  ('30000000-0000-4000-d000-000000000002', '10000000-0000-4000-b000-000000000002', 'Lumen', 'lumen.example', '{"Lumen Skincare"}', true)
on conflict (id) do nothing;

insert into public.competitors (id, org_id, brand_id, name, domain, color) values
  ('31000000-0000-4000-d000-000000000001', '10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', 'Metricly',      'metricly.example',      '#6366F1'),
  ('31000000-0000-4000-d000-000000000002', '10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', 'Quantive Labs', 'quantivelabs.example',  '#F59E0B'),
  ('31000000-0000-4000-d000-000000000003', '10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', 'DataPulse',     'datapulse.example',     '#EF4444'),
  ('31000000-0000-4000-d000-000000000004', '10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', 'Insightful HQ', 'insightfulhq.example',  '#10B981'),
  ('31000000-0000-4000-d000-000000000005', '10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', 'Graphwise',     'graphwise.example',     '#8B5CF6'),
  ('31000000-0000-4000-d000-000000000011', '10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', 'Dewly',           'dewly.example',          '#EC4899'),
  ('31000000-0000-4000-d000-000000000012', '10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', 'Aurora Botanics', 'aurorabotanics.example', '#F97316'),
  ('31000000-0000-4000-d000-000000000013', '10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', 'Skinwell',        'skinwell.example',       '#06B6D4'),
  ('31000000-0000-4000-d000-000000000014', '10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', 'Pure Ritual',     'pureritual.example',     '#84CC16'),
  ('31000000-0000-4000-d000-000000000015', '10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', 'Calm Derm',       'calmderm.example',       '#A855F7')
on conflict (id) do nothing;

insert into public.topics (id, org_id, brand_id, name) values
  ('32000000-0000-4000-d000-000000000001', '10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', 'Product analytics tools'),
  ('32000000-0000-4000-d000-000000000002', '10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', 'Retention & funnels'),
  ('32000000-0000-4000-d000-000000000003', '10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', 'Warehouse-native analytics'),
  ('32000000-0000-4000-d000-000000000011', '10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', 'Sensitive skin routines'),
  ('32000000-0000-4000-d000-000000000012', '10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', 'Mineral sunscreen')
on conflict (id) do nothing;

insert into public.prompts (id, org_id, brand_id, topic_id, persona_id, text, funnel_stage, locale, country, source)
select md5('prompt' || v.org || v.txt)::uuid, v.org::uuid, v.brand::uuid, v.topic::uuid, v.persona::uuid, v.txt,
       v.stage::public.funnel_stage, 'en-US', v.country, v.src::public.prompt_source
from (values
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000001', '20000000-0000-4000-c000-000000000001', 'What are the best product analytics tools for B2B SaaS?', 'awareness', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000001', '20000000-0000-4000-c000-000000000001', 'Which product analytics tool is easiest for non-technical teams?', 'consideration', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000001', null, 'Metricly alternatives with transparent pricing', 'decision', 'US', 'discovered'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000001', null, 'Compare Northwind vs Quantive Labs', 'decision', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000002', '20000000-0000-4000-c000-000000000001', 'How do I measure user retention for a SaaS product?', 'awareness', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000002', '20000000-0000-4000-c000-000000000001', 'Best tool to build funnels without SQL', 'consideration', 'US', 'suggested'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000002', null, 'How to find where users drop off during onboarding', 'awareness', 'GB', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000003', '20000000-0000-4000-c000-000000000002', 'What is warehouse-native product analytics?', 'awareness', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000003', '20000000-0000-4000-c000-000000000002', 'Product analytics tools that run on Snowflake', 'consideration', 'US', 'discovered'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000003', '20000000-0000-4000-c000-000000000002', 'Is Northwind SOC 2 compliant?', 'decision', 'DE', 'manual'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000011', '20000000-0000-4000-c000-000000000003', 'Best fragrance-free serum for sensitive skin', 'consideration', 'GB', 'manual'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000011', '20000000-0000-4000-c000-000000000003', 'Skincare routine for redness-prone skin', 'awareness', 'GB', 'manual'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000011', null, 'Is Lumen skincare good for rosacea?', 'decision', 'GB', 'manual'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000011', null, 'Dermatologist recommended ceramide serums', 'consideration', 'US', 'discovered'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000012', '20000000-0000-4000-c000-000000000003', 'Best mineral sunscreen that does not leave a white cast', 'consideration', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000012', null, 'Mineral vs chemical sunscreen for sensitive skin', 'awareness', 'GB', 'suggested'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000012', null, 'Dewly vs Lumen SPF 50', 'decision', 'GB', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000001', '20000000-0000-4000-c000-000000000001', 'Top alternatives to Mixpanel for startups', 'consideration', 'US', 'discovered'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000001', null, 'Cheapest product analytics tool with session replay', 'consideration', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000001', '20000000-0000-4000-c000-000000000001', 'Which analytics tools integrate with Segment?', 'awareness', 'US', 'suggested'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000001', null, 'Best product analytics for PLG companies', 'consideration', 'GB', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000002', '20000000-0000-4000-c000-000000000001', 'How to calculate cohort retention in a SaaS app', 'awareness', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000002', '20000000-0000-4000-c000-000000000001', 'What is a good activation rate for B2B SaaS?', 'awareness', 'US', 'discovered'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000002', null, 'Tools to track feature adoption', 'consideration', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000002', '20000000-0000-4000-c000-000000000001', 'How to build a north star metric dashboard', 'awareness', 'DE', 'suggested'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000003', '20000000-0000-4000-c000-000000000002', 'BigQuery native product analytics tools', 'consideration', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000003', '20000000-0000-4000-c000-000000000002', 'Reverse ETL vs warehouse-native analytics', 'awareness', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000003', '20000000-0000-4000-c000-000000000002', 'Northwind pricing compared to Graphwise', 'decision', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', '32000000-0000-4000-d000-000000000003', null, 'Is Northwind GDPR compliant for EU data?', 'decision', 'DE', 'manual'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000011', '20000000-0000-4000-c000-000000000003', 'Best moisturizer for sensitive skin without fragrance', 'consideration', 'GB', 'manual'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000011', '20000000-0000-4000-c000-000000000003', 'What ingredients should I avoid with rosacea?', 'awareness', 'GB', 'discovered'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000011', null, 'Ceramide serum vs niacinamide for redness', 'consideration', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000011', '20000000-0000-4000-c000-000000000003', 'Gentle skincare brands recommended by dermatologists UK', 'consideration', 'GB', 'manual'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000011', null, 'Lumen Barrier Repair Serum reviews', 'decision', 'GB', 'manual'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000011', '20000000-0000-4000-c000-000000000003', 'Minimal skincare routine for reactive skin', 'awareness', 'US', 'suggested'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000012', '20000000-0000-4000-c000-000000000003', 'Best SPF for sensitive skin under makeup', 'consideration', 'GB', 'manual'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000012', null, 'Reef safe mineral sunscreen brands', 'consideration', 'US', 'discovered'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000012', '20000000-0000-4000-c000-000000000003', 'Is zinc oxide sunscreen safe for daily use?', 'awareness', 'US', 'manual'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000012', null, 'Lumen Daily Mineral SPF 50 vs Skinwell', 'decision', 'GB', 'manual'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', '32000000-0000-4000-d000-000000000012', null, 'Tinted mineral sunscreen for darker skin tones', 'consideration', 'US', 'suggested')
) v(org, brand, topic, persona, txt, stage, country, src)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Prompt runs: daily for 30 days, 4 API engines + AI Overviews
-- ---------------------------------------------------------------------------
insert into public.prompt_runs (id, org_id, prompt_id, engine_id, run_at, model, status, error, latency_ms, cost_usd)
select md5('run' || p.id || e.id || d)::uuid, p.org_id, p.id, e.id,
       date_trunc('day', now()) - make_interval(days => d) + interval '6 hours'
         + make_interval(mins => (pg_temp.rnd('min' || p.id || e.id || d) * 120)::int),
       e.default_model,
       case when pg_temp.rnd('fail' || p.id || e.id || d) < 0.03 then 'failed' else 'succeeded' end::public.run_status,
       case when pg_temp.rnd('fail' || p.id || e.id || d) < 0.03 then 'upstream timeout (demo)' end,
       (2000 + pg_temp.rnd('lat' || p.id || e.id || d) * 9000)::int,
       round((0.002 + pg_temp.rnd('cost' || p.id || e.id || d) * 0.02)::numeric, 5)
from public.prompts p
join public.organizations o on o.id = p.org_id and o.settings ->> 'demo' = 'true'
cross join public.engines e
cross join generate_series(0, 29) d
where e.id in ('chatgpt', 'perplexity', 'gemini', 'claude', 'google_aio')
on conflict (id) do nothing;

-- Entities that appear in each successful answer (temp table)
create temp table seed_entities as
with ent as (
  select b.org_id, 'brand'::public.mention_entity as entity_type, b.id as entity_id, b.name, b.domain
  from public.brands b where b.is_primary
  union all
  select c.org_id, 'competitor', c.id, c.name, c.domain from public.competitors c
),
r as (
  select pr.*, (date_trunc('day', now())::date - (pr.run_at at time zone 'utc')::date) as days_ago,
         p.text as prompt_text
  from public.prompt_runs pr
  join public.prompts p on p.id = pr.prompt_id
  join public.organizations o on o.id = pr.org_id and o.settings ->> 'demo' = 'true'
  where pr.status = 'succeeded'
)
select r.id as run_id, r.org_id, r.engine_id, r.prompt_text, e.entity_type, e.entity_id, e.name, e.domain,
       pg_temp.rnd('m' || r.id || e.entity_id) as roll,
       case
         when e.entity_type = 'brand' then
           -- Northwind trends up from ~35% to ~60%; Lumen hovers ~25%; engines differ a bit.
           (case when r.org_id = '10000000-0000-4000-b000-000000000001' then 0.35 + 0.25 * (30 - r.days_ago) / 30.0 else 0.25 end)
           + case r.engine_id when 'perplexity' then 0.10 when 'claude' then -0.05 when 'google_aio' then -0.08 else 0 end
           + case when r.prompt_text ilike '%' || e.name || '%' then 0.45 else 0 end
         else 0.15 + pg_temp.rnd('cp' || e.entity_id) * 0.40
              + case when r.prompt_text ilike '%' || e.name || '%' then 0.45 else 0 end
       end as prob
from r join ent e on e.org_id = r.org_id;

delete from seed_entities where roll >= prob;

alter table seed_entities add column position int;
update seed_entities s set position = x.pos
from (
  select run_id, entity_id,
         row_number() over (partition by run_id order by pg_temp.rnd('pos' || run_id || entity_id)) as pos
  from seed_entities
) x
where x.run_id = s.run_id and x.entity_id = s.entity_id;

-- Responses
insert into public.responses (id, org_id, prompt_run_id, text, raw, brand_mentioned, word_count, created_at)
select md5('resp' || pr.id)::uuid, pr.org_id, pr.id,
       coalesce(
         'Here are options worth considering for "' || p.text || '": '
           || (select string_agg(s.name, ', ' order by s.position) from seed_entities s where s.run_id = pr.id)
           || '. Each has trade-offs in pricing, setup time and support; check recent reviews before deciding.',
         'There is no single answer to "' || p.text || '". It depends on budget, team size and requirements; compare independent reviews and trial a few options.'
       ),
       jsonb_build_object('demo', true, 'engine', pr.engine_id),
       exists (select 1 from seed_entities s where s.run_id = pr.id and s.entity_type = 'brand'),
       40 + (pg_temp.rnd('wc' || pr.id) * 260)::int,
       pr.run_at + make_interval(secs => pr.latency_ms / 1000.0)
from public.prompt_runs pr
join public.prompts p on p.id = pr.prompt_id
join public.organizations o on o.id = pr.org_id and o.settings ->> 'demo' = 'true'
where pr.status = 'succeeded'
on conflict (prompt_run_id) do nothing;

-- Mentions
insert into public.mentions (org_id, response_id, prompt_run_id, entity_type, brand_id, competitor_id, name,
                             position, sentiment, sentiment_score, snippet)
select s.org_id, md5('resp' || s.run_id)::uuid, s.run_id, s.entity_type,
       case when s.entity_type = 'brand' then s.entity_id end,
       case when s.entity_type = 'competitor' then s.entity_id end,
       s.name, s.position,
       case when sc > 0.25 then 'positive' when sc < -0.15 then 'negative' else 'neutral' end::public.sentiment,
       round(sc::numeric, 3),
       s.name || case when sc > 0.25 then ' is often praised for its ease of use.'
                      when sc < -0.15 then ' gets mixed reviews on pricing and support.'
                      else ' is a commonly listed option.' end
from (
  select se.*, greatest(-1, least(1, pg_temp.rnd('sent' || se.run_id || se.entity_id) * 1.3 - 0.35)) as sc
  from seed_entities se
) s;

-- Citations: 2-5 per answer drawn from owned / competitor / earned / ugc / other domains
create temp table seed_domains (org_id uuid, domain text, path text, source_type public.source_type, weight float);
insert into seed_domains
select b.org_id, b.domain, '/blog/guide', 'owned'::public.source_type, 1.0 from public.brands b where b.is_primary
union all select c.org_id, c.domain, '/features', 'competitor'::public.source_type, 0.6 from public.competitors c
union all select o.id, d.domain, d.path, d.t::public.source_type, d.w
from public.organizations o
cross join (values
  ('g2.example', '/categories/product-analytics', 'earned', 1.2),
  ('techradar.example', '/best/product-analytics-tools', 'earned', 0.8),
  ('reddit.example', '/r/SaaS/comments/abc', 'ugc', 1.0),
  ('youtube.example', '/watch?v=demo', 'ugc', 0.5),
  ('wikipedia.example', '/wiki/Product_analytics', 'other', 0.4)
) d(domain, path, t, w)
where o.id = '10000000-0000-4000-b000-000000000001'
union all select o.id, d.domain, d.path, d.t::public.source_type, d.w
from public.organizations o
cross join (values
  ('byrdie.example', '/best-serums-sensitive-skin', 'earned', 1.2),
  ('healthline.example', '/health/sensitive-skin', 'earned', 0.9),
  ('reddit.example', '/r/SkincareAddiction/comments/xyz', 'ugc', 1.3),
  ('tiktok.example', '/@derm/video/1', 'ugc', 0.6),
  ('wikipedia.example', '/wiki/Sunscreen', 'other', 0.3)
) d(domain, path, t, w)
where o.id = '10000000-0000-4000-b000-000000000002';

insert into public.citations (org_id, response_id, prompt_run_id, url, domain, title, source_type, competitor_id, position)
select pr.org_id, md5('resp' || pr.id)::uuid, pr.id,
       'https://' || d.domain || d.path, d.domain, initcap(split_part(d.domain, '.', 1)) || ' (demo)',
       d.source_type,
       (select c.id from public.competitors c where c.org_id = pr.org_id and c.domain = d.domain),
       k
from public.prompt_runs pr
join public.organizations o on o.id = pr.org_id and o.settings ->> 'demo' = 'true'
cross join lateral generate_series(1, 2 + (pg_temp.rnd('nc' || pr.id) * 4)::int) k
cross join lateral (
  select sd.* from seed_domains sd
  where sd.org_id = pr.org_id
  order by pg_temp.rnd('cd' || pr.id || k || sd.domain) * (1.0 / sd.weight)
  limit 1
) d
where pr.status = 'succeeded'
  -- Claude's web search cites less often than the others in this demo
  and (pr.engine_id <> 'claude' or pg_temp.rnd('cw' || pr.id) < 0.5);

-- ---------------------------------------------------------------------------
-- Source tags
-- ---------------------------------------------------------------------------
insert into public.source_tags (id, org_id, name, color, description) values
  ('33000000-0000-4000-d000-000000000001', '10000000-0000-4000-b000-000000000001', 'Review sites', '#F59E0B', 'Software review and comparison sites'),
  ('33000000-0000-4000-d000-000000000002', '10000000-0000-4000-b000-000000000001', 'Community', '#3B82F6', 'Forums and social'),
  ('33000000-0000-4000-d000-000000000011', '10000000-0000-4000-b000-000000000002', 'Beauty press', '#EC4899', 'Editorial beauty publications')
on conflict (id) do nothing;

insert into public.source_tag_rules (org_id, tag_id, match_type, pattern) values
  ('10000000-0000-4000-b000-000000000001', '33000000-0000-4000-d000-000000000001', 'domain', 'g2.example'),
  ('10000000-0000-4000-b000-000000000001', '33000000-0000-4000-d000-000000000001', 'domain', 'techradar.example'),
  ('10000000-0000-4000-b000-000000000001', '33000000-0000-4000-d000-000000000002', 'domain', 'reddit.example'),
  ('10000000-0000-4000-b000-000000000002', '33000000-0000-4000-d000-000000000011', 'domain', 'byrdie.example')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Site health
-- ---------------------------------------------------------------------------
insert into public.site_health_properties (id, org_id, brand_id, root_url, score, pages_crawled, last_audit_at, audit_status) values
  ('34000000-0000-4000-d000-000000000001', '10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', 'https://www.northwind.example/', 78.5, 142, now() - interval '1 day', 'succeeded'),
  ('34000000-0000-4000-d000-000000000002', '10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', 'https://lumen.example/', 64.0, 58, now() - interval '3 days', 'succeeded')
on conflict (id) do nothing;

insert into public.site_health_pages (id, org_id, property_id, url, status_code, score, title, word_count, has_schema, issues_count, last_crawled_at) values
  ('35000000-0000-4000-d000-000000000001', '10000000-0000-4000-b000-000000000001', '34000000-0000-4000-d000-000000000001', 'https://www.northwind.example/', 200, 88, 'Northwind: product analytics', 820, true, 1, now() - interval '1 day'),
  ('35000000-0000-4000-d000-000000000002', '10000000-0000-4000-b000-000000000001', '34000000-0000-4000-d000-000000000001', 'https://www.northwind.example/pricing', 200, 71, 'Pricing', 410, false, 2, now() - interval '1 day'),
  ('35000000-0000-4000-d000-000000000003', '10000000-0000-4000-b000-000000000001', '34000000-0000-4000-d000-000000000001', 'https://www.northwind.example/blog/retention-guide', 200, 64, 'The retention guide', 2400, false, 2, now() - interval '1 day'),
  ('35000000-0000-4000-d000-000000000011', '10000000-0000-4000-b000-000000000002', '34000000-0000-4000-d000-000000000002', 'https://lumen.example/', 200, 70, 'Lumen Skincare', 300, true, 1, now() - interval '3 days'),
  ('35000000-0000-4000-d000-000000000012', '10000000-0000-4000-b000-000000000002', '34000000-0000-4000-d000-000000000002', 'https://lumen.example/serum', 200, 55, 'Barrier Repair Serum', 180, false, 2, now() - interval '3 days')
on conflict (id) do nothing;

insert into public.site_health_issues (id, org_id, property_id, code, title, category, severity, status, recommendation, affected_pages) values
  ('36000000-0000-4000-d000-000000000001', '10000000-0000-4000-b000-000000000001', '34000000-0000-4000-d000-000000000001', 'missing_llms_txt', 'No llms.txt file', 'crawlability', 'medium', 'open', 'Publish /llms.txt listing your key docs and product pages.', 1),
  ('36000000-0000-4000-d000-000000000002', '10000000-0000-4000-b000-000000000001', '34000000-0000-4000-d000-000000000001', 'missing_faq_schema', 'Pages without FAQ/Product schema', 'schema', 'high', 'in_progress', 'Add FAQPage and Product JSON-LD to pricing and guides.', 2),
  ('36000000-0000-4000-d000-000000000011', '10000000-0000-4000-b000-000000000002', '34000000-0000-4000-d000-000000000002', 'blocked_gptbot', 'robots.txt blocks GPTBot', 'crawlability', 'critical', 'open', 'Allow GPTBot and OAI-SearchBot in robots.txt if you want ChatGPT visibility.', 1),
  ('36000000-0000-4000-d000-000000000012', '10000000-0000-4000-b000-000000000002', '34000000-0000-4000-d000-000000000002', 'thin_content', 'Thin product pages', 'content', 'medium', 'open', 'Expand product pages with ingredients, usage and FAQs (300+ words).', 1)
on conflict (id) do nothing;

insert into public.site_health_issue_pages (issue_id, page_id, org_id, detail) values
  ('36000000-0000-4000-d000-000000000002', '35000000-0000-4000-d000-000000000002', '10000000-0000-4000-b000-000000000001', 'No JSON-LD found'),
  ('36000000-0000-4000-d000-000000000002', '35000000-0000-4000-d000-000000000003', '10000000-0000-4000-b000-000000000001', 'No JSON-LD found'),
  ('36000000-0000-4000-d000-000000000011', '35000000-0000-4000-d000-000000000011', '10000000-0000-4000-b000-000000000002', 'User-agent: GPTBot / Disallow: /'),
  ('36000000-0000-4000-d000-000000000012', '35000000-0000-4000-d000-000000000012', '10000000-0000-4000-b000-000000000002', '180 words')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- AI crawler hits (daily pre-aggregated rows, last 14 days, Northwind only: Cloudflare connected)
-- ---------------------------------------------------------------------------
insert into public.crawler_hits (org_id, property_id, ts, bot, bot_operator, path, status, hits, source)
select '10000000-0000-4000-b000-000000000001', '34000000-0000-4000-d000-000000000001',
       date_trunc('day', now()) - make_interval(days => d) + interval '12 hours',
       b.bot, b.op, pth.path,
       case when pg_temp.rnd('st' || d || b.bot || pth.path) < 0.05 then 404 else 200 end,
       (b.base * (0.5 + pg_temp.rnd('h' || d || b.bot || pth.path)))::int + 1,
       'cloudflare'
from generate_series(0, 13) d
cross join (values ('GPTBot', 'OpenAI', 40), ('OAI-SearchBot', 'OpenAI', 25), ('ChatGPT-User', 'OpenAI', 15),
                   ('ClaudeBot', 'Anthropic', 20), ('PerplexityBot', 'Perplexity', 18), ('Google-Extended', 'Google', 10)) b(bot, op, base)
cross join (values ('/'), ('/pricing'), ('/blog/retention-guide'), ('/docs/getting-started')) pth(path);

-- ---------------------------------------------------------------------------
-- Action center
-- ---------------------------------------------------------------------------
insert into public.content_items (org_id, brand_id, prompt_id, title, content_type, status, target_url, body_md, brief) values
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001',
   md5('prompt' || '10000000-0000-4000-b000-000000000001' || 'Metricly alternatives with transparent pricing')::uuid,
   'Metricly alternatives: 6 tools with transparent pricing', 'comparison', 'in_review',
   'https://www.northwind.example/blog/metricly-alternatives', E'# Metricly alternatives\n\n(Demo draft)', '{"angle":"pricing transparency"}'),
  ('10000000-0000-4000-b000-000000000001', '30000000-0000-4000-d000-000000000001', null,
   'What is warehouse-native product analytics?', 'article', 'draft', null, E'# Warehouse-native analytics\n\n(Demo draft)', '{}'),
  ('10000000-0000-4000-b000-000000000002', '30000000-0000-4000-d000-000000000002', null,
   'Mineral vs chemical sunscreen for sensitive skin', 'faq', 'idea', null, null, '{}');

insert into public.creators (org_id, platform, handle, display_name, url, followers, avg_views, relevance_score, topics, cited_count, status) values
  ('10000000-0000-4000-b000-000000000001', 'youtube', '@saasmetricsdemo', 'SaaS Metrics Demo', 'https://youtube.example/@saasmetricsdemo', 84000, 12000, 82.5, '{analytics,saas}', 7, 'shortlisted'),
  ('10000000-0000-4000-b000-000000000002', 'tiktok', '@dermdemo', 'Derm Demo', 'https://tiktok.example/@dermdemo', 420000, 90000, 91.0, '{skincare,sensitive skin}', 12, 'new'),
  ('10000000-0000-4000-b000-000000000002', 'youtube', '@skinlabdemo', 'Skin Lab Demo', 'https://youtube.example/@skinlabdemo', 150000, 30000, 76.0, '{skincare}', 4, 'contacted'),
  ('10000000-0000-4000-b000-000000000001', 'youtube', '@dataopsdemo', 'DataOps Weekly (demo)', 'https://youtube.example/@dataopsdemo', 52000, 8000, 74.0, '{data engineering,warehouse}', 3, 'new'),
  ('10000000-0000-4000-b000-000000000001', 'tiktok', '@pmtipsdemo', 'PM Tips (demo)', 'https://tiktok.example/@pmtipsdemo', 210000, 45000, 68.5, '{product management}', 2, 'new'),
  ('10000000-0000-4000-b000-000000000002', 'tiktok', '@spfdailydemo', 'SPF Daily (demo)', 'https://tiktok.example/@spfdailydemo', 98000, 22000, 80.0, '{sunscreen}', 6, 'shortlisted')
on conflict do nothing;

insert into public.outreach_contacts (org_id, name, email, publication, url, domain, role_title, status, citation_count) values
  ('10000000-0000-4000-b000-000000000001', 'Alex Rivera', 'alex@techradar.example', 'TechRadar (demo)', 'https://techradar.example/best/product-analytics-tools', 'techradar.example', 'Software editor', 'contacted', 31),
  ('10000000-0000-4000-b000-000000000001', 'Jordan Lee', null, 'G2 (demo)', 'https://g2.example/categories/product-analytics', 'g2.example', 'Category manager', 'new', 44),
  ('10000000-0000-4000-b000-000000000002', 'Priya Nair', 'priya@byrdie.example', 'Byrdie (demo)', 'https://byrdie.example/best-serums-sensitive-skin', 'byrdie.example', 'Beauty writer', 'replied', 22),
  ('10000000-0000-4000-b000-000000000002', 'Tom Hale', null, 'Healthline (demo)', 'https://healthline.example/health/sensitive-skin', 'healthline.example', 'Medical reviewer', 'new', 17),
  ('10000000-0000-4000-b000-000000000001', 'Mia Chen', 'mia@saasweekly.example', 'SaaS Weekly (demo)', 'https://saasweekly.example/analytics-roundup', 'saasweekly.example', 'Editor', 'won', 9);

insert into public.reports (org_id, title, report_type, period_start, period_end, status, schedule, data) values
  ('10000000-0000-4000-b000-000000000001', 'Monthly visibility report (demo)', 'visibility', (now() - interval '30 days')::date, now()::date, 'succeeded', 'monthly', '{"demo": true}'),
  ('10000000-0000-4000-b000-000000000002', 'Baseline report (demo)', 'executive', (now() - interval '30 days')::date, now()::date, 'queued', null, '{"demo": true}');

insert into public.api_keys (org_id, name, prefix, key_hash, scopes) values
  ('10000000-0000-4000-b000-000000000001', 'Looker Studio connector (demo)', 'bk_demo_7f3a',
   encode(extensions.digest('bk_demo_7f3a_not_a_real_key', 'sha256'), 'hex'), '{read}');

-- ---------------------------------------------------------------------------
-- Billing & usage
-- ---------------------------------------------------------------------------
insert into public.subscriptions (org_id, plan_id, stripe_customer_id, stripe_subscription_id, status, seats,
                                  current_period_start, current_period_end) values
  ('10000000-0000-4000-b000-000000000001', 'growth', 'cus_demo_northwind', 'sub_demo_northwind', 'active', 5,
   date_trunc('month', now()), date_trunc('month', now()) + interval '1 month'),
  ('10000000-0000-4000-b000-000000000002', 'starter', 'cus_demo_lumen', 'sub_demo_lumen', 'trialing', 2,
   date_trunc('day', now()) - interval '5 days', date_trunc('day', now()) + interval '9 days')
on conflict do nothing;

insert into public.usage_counters (org_id, metric, period_start, value)
select pr.org_id, 'prompt_runs', date_trunc('month', pr.run_at)::date, count(*)
from public.prompt_runs pr
join public.organizations o on o.id = pr.org_id and o.settings ->> 'demo' = 'true'
group by 1, 3
on conflict (org_id, metric, period_start) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- Audit: one client-visible member event, one staff action (masked to 'agency' by trigger),
-- and the staff trail in platform_audit_log (never visible to clients)
-- ---------------------------------------------------------------------------
insert into public.audit_events (org_id, actor_user_id, actor_kind, action, target_type, target_id, metadata) values
  ('10000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000011', 'member', 'member.invited', 'invitation', 'priya@northwind.example', '{"role":"member"}'),
  ('10000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'member', 'org.plan_changed', 'organization', '10000000-0000-4000-b000-000000000001', '{"from":"starter","to":"growth"}');

insert into public.platform_audit_log (actor_user_id, action, org_id, target_type, target_id, metadata) values
  ('00000000-0000-4000-a000-000000000001', 'org.plan_change', '10000000-0000-4000-b000-000000000001', 'organization', '10000000-0000-4000-b000-000000000001', '{"from":"starter","to":"growth","demo":true}');

-- Demo methodology score (0..1): 0 when the brand is absent, else higher the earlier it appears.
update public.responses r set visibility_score = coalesce(
  (select round((1.0 / (1 + greatest(m.position, 1) * 0.35))::numeric + 0.2, 4)
   from public.mentions m where m.response_id = r.id and m.entity_type = 'brand' limit 1), 0),
  analysis_version = 'seed'
where r.org_id in (select id from public.organizations where settings ->> 'demo' = 'true');

-- ---------------------------------------------------------------------------
-- Materialized metrics
-- ---------------------------------------------------------------------------
select public.refresh_metrics();

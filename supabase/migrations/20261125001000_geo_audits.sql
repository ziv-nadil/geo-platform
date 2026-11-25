-- GEO readiness audits: real requests against the client's site (robots, llms.txt, sitemap, PSI, HTML, WAF).
create table public.geo_audits (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  url          text not null,
  platform     text,                                   -- detected/selected CMS used for fix instructions
  score        integer not null check (score between 0 and 100),
  checks       jsonb not null default '[]'::jsonb,     -- [{id,label,category,score,status,detail}]
  fixes        jsonb not null default '[]'::jsonb,     -- prioritized report with per-platform steps
  summary      jsonb not null default '{}'::jsonb,
  triggered_by uuid,
  created_at   timestamptz not null default now()
);
create index geo_audits_org_created_idx on public.geo_audits (org_id, created_at desc);
select private.apply_tenant_rls('public.geo_audits');

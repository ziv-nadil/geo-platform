-- Prompt discovery: candidate prompts from GSC, Keyword Planner, People Also Ask and LLM generation.
-- Humans accept them into public.prompts (never silently), or dismiss them.
create table public.prompt_suggestions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  text             text not null check (char_length(text) between 8 and 500),
  norm_key         text not null,                       -- normalized text used for dedupe
  cluster_key      text not null,                       -- topic cluster label (stable across runs)
  topic_name       text,
  persona_name     text,
  funnel_stage     public.funnel_stage,
  sources          text[] not null default '{}' check (sources <@ array['gsc','keyword_planner','paa','llm']),
  volume           integer,                             -- est. monthly searches (proxy, not prompt volume)
  intent           numeric(4, 3) not null default 0.5,
  competitor_presence numeric(4, 3) not null default 0,
  score            numeric(10, 4) not null default 0,   -- volume x intent x competitor presence
  score_parts      jsonb not null default '{}'::jsonb,
  status           text not null default 'new' check (status in ('new', 'accepted', 'dismissed')),
  prompt_id        uuid references public.prompts (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, norm_key)
);
create index prompt_suggestions_org_score_idx on public.prompt_suggestions (org_id, status, score desc);
create trigger prompt_suggestions_updated_at before update on public.prompt_suggestions
  for each row execute function private.tg_set_updated_at();
select private.apply_tenant_rls('public.prompt_suggestions');

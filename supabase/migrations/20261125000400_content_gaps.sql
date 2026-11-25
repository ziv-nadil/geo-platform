-- Content gaps: prompts where competitors appear (mentioned or cited) and the client does not,
-- grouped by topic / persona / funnel stage and ranked. Drafts live in content_items.
create table public.content_gaps (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  brand_id         uuid references public.brands (id) on delete set null,
  group_key        text not null,                      -- topic|persona|funnel (stable across detections)
  topic_id         uuid references public.topics (id) on delete set null,
  persona_id       uuid references public.brand_personas (id) on delete set null,
  funnel_stage     public.funnel_stage,
  label            text not null,
  prompt_ids       uuid[] not null default '{}',
  prompt_count     integer not null default 0,
  sample_prompts   text[] not null default '{}',
  competitors      jsonb not null default '[]'::jsonb, -- [{id,name,mentions,citations}]
  top_domains      jsonb not null default '[]'::jsonb, -- [{domain,category,citations,authority}]
  score            numeric(12, 4) not null default 0,  -- sum(importance x competitor presence x authority)
  score_parts      jsonb not null default '{}'::jsonb,
  status           text not null default 'open' check (status in ('open', 'drafting', 'covered', 'dismissed')),
  window_days      integer not null default 30,
  detected_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, group_key)
);
create index content_gaps_org_score_idx on public.content_gaps (org_id, score desc);
create trigger content_gaps_updated_at before update on public.content_gaps
  for each row execute function private.tg_set_updated_at();
select private.apply_tenant_rls('public.content_gaps');

alter table public.content_items
  add column gap_id         uuid references public.content_gaps (id) on delete set null,
  add column doc            jsonb,                  -- structured listicle (items, table, faq, citations)
  add column json_ld        jsonb,                  -- schema.org ItemList + FAQPage graph
  add column cms_platform   text,
  add column cms_post_id    text,
  add column cms_post_url   text,                   -- draft URL inside the client's CMS / GitHub PR
  add column publish_error  text,
  add column approved_by    uuid references auth.users (id) on delete set null,
  add column approved_at    timestamptz;
create index content_items_gap_idx on public.content_items (gap_id);

-- Approving (and delivering to the CMS) is an admin+ decision, enforced in the database too.
create or replace function private.content_items_gate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null
     and new.status in ('approved', 'published')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and not (select private.can_write(new.org_id, 'admin')) then
    raise exception 'approving or publishing content requires the admin role' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger content_items_gate before insert or update on public.content_items
  for each row execute function private.content_items_gate();

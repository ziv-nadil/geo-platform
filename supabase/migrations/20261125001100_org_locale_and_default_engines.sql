-- Per-org country/language (one location per client) passed to engine APIs natively (no VPN),
-- and default engines narrowed to ChatGPT, Claude, Gemini, Google AI Overviews.
alter table public.organizations
  add column if not exists country text not null default 'US' check (country ~ '^[A-Z]{2}$'),
  add column if not exists language text not null default 'en' check (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$');

grant update (country, language) on public.organizations to authenticated;

-- Adapters stay; Perplexity and Google AI Mode are off by default.
update public.engines set active = false where id in ('perplexity', 'google_ai_mode');

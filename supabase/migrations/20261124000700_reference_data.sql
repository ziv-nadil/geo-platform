-- Beacon GEO: reference data needed in every environment.
-- Engine ids are stable keys used by workers and the UI. Models are defaults; workers record
-- the exact model used on each prompt_run.
insert into public.engines (id, name, provider, default_model, method, sort_order) values
  ('chatgpt',        'ChatGPT',             'openai',     'gpt-5-mini',          'api',  1),
  ('perplexity',     'Perplexity',          'perplexity', 'sonar',               'api',  2),
  ('gemini',         'Gemini',              'google',     'gemini-2.5-flash',    'api',  3),
  ('claude',         'Claude',              'anthropic',  'claude-sonnet-4-5',   'api',  4),
  ('google_aio',     'Google AI Overviews', 'dataforseo', null,                  'serp', 5),
  ('google_ai_mode', 'Google AI Mode',      'dataforseo', null,                  'serp', 6),
  ('copilot',        'Microsoft Copilot',   'microsoft',  null,                  'serp', 7)
on conflict (id) do nothing;

update public.engines set active = false where id = 'copilot';  -- no compliant API yet

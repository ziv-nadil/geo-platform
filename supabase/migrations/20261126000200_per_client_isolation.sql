-- Per-client isolation (docs/architecture/isolation.md, launch design A + D).
-- Identity ids and environment names only: NEVER secret values.
alter table public.organizations
  add column if not exists reader_identity_id text,          -- Infisical machine identity reader-<slug> (read-only on this org's project only)
  add column if not exists runner_environment text,          -- GitHub Actions environment client-<slug>
  add column if not exists runner_oidc_subject text;         -- exact OIDC `sub` the reader identity trusts

-- Which runner identity performed each broker read (GitHub OIDC `sub`, or the legacy shared worker).
alter table public.secret_access_log add column if not exists runner_sub text;

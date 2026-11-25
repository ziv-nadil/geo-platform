-- Beacon GEO: annual pricing + Stripe product ids on plans (filled by scripts/stripe-setup.ts).
alter table public.plans
  add column stripe_product_id       text,
  add column stripe_price_id_annual  text unique,
  add column annual_price_cents      integer check (annual_price_cents >= 0);

-- Agency was "custom"; give it a list price so Checkout works. Annual = 10x monthly (2 months free).
update public.plans set monthly_price_cents = 249900 where id = 'agency' and monthly_price_cents = 0;
update public.plans set annual_price_cents = monthly_price_cents * 10 where id in ('starter', 'growth', 'agency');

import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { ButtonLink } from "@/components/ui/button";
import { getSql } from "@/lib/server/db";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Starter, Growth and Agency plans for AI visibility tracking, content gaps and site health.",
};

type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  monthly_price_cents: number;
  annual_price_cents: number | null;
  seat_limit: number | null;
  prompt_limit: number | null;
  engine_limit: number | null;
  runs_per_month: number | null;
  features: Record<string, boolean> | null;
};

const FEATURE_LABELS: Record<string, string> = {
  site_health: "Site health checks",
  content: "Listicle and content drafts",
  creators: "Creator discovery",
  outreach: "Outreach workflows",
};

/** Reads public.plans, the same table Stripe Checkout uses, so a price change there shows here too. */
async function loadPlans(): Promise<PlanRow[] | null> {
  await connection();
  const sql = getSql();
  if (!sql) return null;
  try {
    return await sql<PlanRow[]>`
      select id, name, description, monthly_price_cents, annual_price_cents, seat_limit, prompt_limit, engine_limit, runs_per_month, features
      from public.plans where active and id <> 'trial' order by sort_order`;
  } catch {
    return null;
  }
}

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const limit = (n: number | null, unit: string) => (n == null ? `Unlimited ${unit}` : `${n.toLocaleString("en-US")} ${unit}`);

function Tick({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
      {children}
    </li>
  );
}

async function PlanGrid() {
  const plans = await loadPlans();

  if (!plans || plans.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-line bg-surface p-8 text-center">
        <h2 className="text-lg font-semibold text-ink">Pricing is unavailable right now</h2>
        <p className="mt-2 text-sm text-ink-3">We could not load the plan list. Sign up to start onboarding, or try this page again in a moment.</p>
        <div className="mt-6">
          <ButtonLink href="/signup">Get started</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <ul className="grid gap-6 lg:grid-cols-3">
      {plans.map((p) => {
        const featured = p.id === "growth";
        const isAgency = p.id === "agency";
        return (
          <li
            key={p.id}
            className={`flex flex-col rounded-lg border bg-surface p-7 ${featured ? "border-accent ring-1 ring-accent" : "border-line"}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">{p.name}</h2>
              {featured ? <span className="rounded-xs bg-accent-soft px-2 py-0.5 text-2xs font-semibold text-accent-ink">Most popular</span> : null}
            </div>
            {p.description ? <p className="mt-1 text-sm text-ink-3">{p.description}</p> : null}

            <p className="mt-6 flex items-baseline gap-1">
              <span className="font-display text-3xl font-semibold tracking-tight text-ink tabular-nums">{money(p.monthly_price_cents)}</span>
              <span className="text-sm text-ink-3">/ month</span>
            </p>
            <p className="mt-1 min-h-5 text-xs text-ink-4">
              {p.annual_price_cents ? `or ${money(p.annual_price_cents)} / year, billed annually` : null}
            </p>

            <ul className="mt-6 space-y-2.5 border-t border-line pt-6 text-sm text-ink-2">
              <Tick>{limit(p.seat_limit, "seats")}</Tick>
              <Tick>{limit(p.prompt_limit, "tracked prompts")}</Tick>
              <Tick>{limit(p.engine_limit, "AI engines")}</Tick>
              {p.runs_per_month != null ? <Tick>{p.runs_per_month.toLocaleString("en-US")} answer runs / month</Tick> : null}
              {Object.entries(FEATURE_LABELS)
                .filter(([k]) => p.features?.[k])
                .map(([k, label]) => (
                  <Tick key={k}>{label}</Tick>
                ))}
            </ul>

            <div className="mt-auto pt-8">
              <ButtonLink href="/signup" size="lg" variant={featured ? "primary" : "secondary"} className="w-full">
                {isAgency ? "Talk to us, then sign up" : `Choose ${p.name}`}
              </ButtonLink>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-10 text-center">
        <p className="text-xs font-semibold tracking-wide text-accent-ink uppercase">Pricing</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink md:text-4xl">Plans that grow with your brands.</h1>
        <p className="mx-auto mt-4 max-w-xl text-md text-ink-2">Monthly billing, or pay annually and get two months free. Cancel any time from your settings.</p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <Suspense fallback={<p className="text-center text-sm text-ink-3">Loading plans…</p>}>
          <PlanGrid />
        </Suspense>
        <p className="mt-10 text-center text-sm text-ink-3">
          Need more brands or a managed service? <Link href="/help#faq" className="font-medium text-accent-ink underline underline-offset-2">Read the FAQ</Link> or sign up and choose Agency.
        </p>
      </section>
    </>
  );
}

import { DatabaseZap, Lock, ShieldOff } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getOrgBySlug } from "@/lib/data";
import type { Filters, Load, Org } from "@/lib/ui/data-types";
import { parseFilters } from "@/lib/ui/filters";

export type RouteProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export type PageCtx = { org: Org; filters: Filters; sp: Record<string, string | string[] | undefined> };

/** Resolve the org and shared filters. Returns `{ gate }` when the viewer can't see data. Call inside <Suspense>. */
export async function loadPage({ params, searchParams }: RouteProps): Promise<PageCtx | { gate: ReactNode }> {
  const [{ orgSlug }, sp] = await Promise.all([params, searchParams]);
  const r = await getOrgBySlug(orgSlug);
  if (!r.ok) return { gate: <LoadFail result={r} /> };
  if (!r.data) notFound();
  return { org: r.data, filters: parseFilters(sp), sp };
}

/** Render the right state for a failed load: not configured, signed out, or no access. */
export function LoadFail({ result }: { result: Extract<Load<unknown>, { ok: false }> }) {
  if (result.reason === "not_configured")
    return (
      <EmptyState
        icon={DatabaseZap}
        title="Database not configured"
        description={`Set ${result.missing?.join(", ") || "DATABASE_URL"} for this deployment. Locally, run scripts/dev-db.sh and put the printed DATABASE_URL in web/.env.local.`}
      />
    );
  if (result.reason === "unauthenticated")
    return <EmptyState icon={Lock} title="Sign in to see this account" description="Your session has expired or you are signed out." action={<ButtonLink href="/login">Sign in</ButtonLink>} />;
  return <EmptyState icon={ShieldOff} title="No access" description="You are not a member of this account, or your role can't see this page. Ask an account admin for access." />;
}

/** Shows LoadFail for a failed section load, or renders children with the data. */
export function Section<T>({ load, children }: { load: Load<T>; children: (data: T) => ReactNode }) {
  return load.ok ? <>{children(load.data)}</> : <LoadFail result={load} />;
}

export function NoData({ org, what = "AI answers" }: { org: Org; what?: string }) {
  return (
    <EmptyState
      icon={DatabaseZap}
      title={`No ${what} yet`}
      description={`Nothing has been collected for ${org.name} in this period. Monitoring starts after onboarding adds tracked prompts and the first daily run completes.`}
      action={<ButtonLink href={`/app/${org.slug}/onboarding`} variant="secondary">Open onboarding</ButtonLink>}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-64 rounded-sm bg-muted-bg" />
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-md border border-line bg-surface" />
        ))}
      </div>
      <div className="h-80 rounded-md border border-line bg-surface" />
    </div>
  );
}

export function filterQs(f: Filters) {
  const p = new URLSearchParams();
  if (f.range !== 30) p.set("range", String(f.range));
  if (f.engine !== "all") p.set("engine", f.engine);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function rangeLabel(f: Filters) {
  return `Last ${f.range} days`;
}

export const fmtMaybe = (v: number | null | undefined, digits = 1, suffix = "") => (v === null || v === undefined ? "—" : `${v.toFixed(digits)}${suffix}`);

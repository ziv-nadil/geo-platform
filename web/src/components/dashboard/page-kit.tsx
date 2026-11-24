import { ClipboardList } from "lucide-react";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getOrgBySlug, parseFilters, type Filters, type Org } from "@/lib/mock";

export type RouteProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Resolve the org and the shared filters for a dashboard page. Call inside <Suspense>. */
export async function loadPage({ params, searchParams }: RouteProps): Promise<{ org: Org; filters: Filters; sp: Record<string, string | string[] | undefined> }> {
  const [{ orgSlug }, sp] = await Promise.all([params, searchParams]);
  const org = await getOrgBySlug(orgSlug);
  if (!org) notFound();
  return { org, filters: parseFilters(sp), sp };
}

export function NoData({ org }: { org: Org }) {
  return (
    <EmptyState
      icon={ClipboardList}
      title="No AI answers collected yet"
      description={`${org.name} has no monitoring runs yet. Finish onboarding so we can add tracked prompts and start the first daily run.`}
      action={<ButtonLink href={`/app/${org.slug}/onboarding`}>Continue onboarding</ButtonLink>}
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

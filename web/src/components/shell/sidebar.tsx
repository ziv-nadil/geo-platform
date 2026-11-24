"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/ui/cn";
import type { Org } from "@/lib/mock/types";
import { NAV } from "./nav";
import { OrgSwitcher } from "./org-switcher";

export function Sidebar({ org, orgs, canSwitch }: { org: Org; orgs: Org[]; canSwitch: boolean }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const base = `/app/${org.slug}`;
  const keep = new URLSearchParams();
  for (const k of ["range", "engine"]) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString() ? `?${keep}` : "";

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-surface" aria-label="Main navigation">
      <div className="flex h-14 items-center px-4">
        <Link href={`${base}${qs}`} aria-label="Beacon GEO home">
          <Logo />
        </Link>
      </div>
      <div className="px-3 pb-3">
        <OrgSwitcher org={org} orgs={orgs} canSwitch={canSwitch} />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => (
          <div key={group.section} className="mt-3 first:mt-1">
            <p className="px-2 pb-1 text-2xs font-semibold tracking-wider text-ink-4 uppercase">{group.section}</p>
            <ul className="flex flex-col gap-px">
              {group.items.map((item) => {
                const href = `${base}${item.href}`;
                const active = item.href === "" ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={`${href}${item.href === "/onboarding" || item.href === "/settings" ? "" : qs}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-8 items-center gap-2.5 rounded-sm px-2 text-sm font-medium transition-colors",
                        active ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-subtle hover:text-ink",
                      )}
                    >
                      <item.icon className={cn("size-4", active ? "text-accent" : "text-ink-3")} aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {org.onboardingPct < 100 ? (
        <Link href={`${base}/onboarding`} className="mx-3 mb-3 flex flex-col gap-2 rounded-md border border-line bg-subtle/60 p-3 hover:border-line-strong">
          <span className="flex items-center justify-between text-xs font-medium text-ink-2">
            Onboarding
            <span className="text-ink tabular">{org.onboardingPct}%</span>
          </span>
          <Progress value={org.onboardingPct} size="sm" label="Onboarding progress" />
          <span className="text-2xs text-ink-3">Finish setup to unlock content publishing.</span>
        </Link>
      ) : null}
    </aside>
  );
}

export function SidebarFallback() {
  return <aside className="sticky top-0 h-screen w-60 shrink-0 border-r border-line bg-surface" aria-hidden="true" />;
}

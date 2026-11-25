"use client";

import * as DM from "@radix-ui/react-dropdown-menu";
import { CalendarDays, ChevronDown, Gauge, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/ui/cn";
import type { Viewer } from "@/lib/ui/data-types";
import { ENGINES } from "@/lib/ui/engines";
import { exitViewAs } from "@/app/admin/actions";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
];

/** Global filters (date range, engine) live in the URL so every tab and link shares them. */
export function Topbar({ user, viewAs, showFilters = true }: { user: Viewer; viewAs: boolean; showFilters?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const range = sp.get("range") ?? "30";
  const engine = sp.get("engine") ?? "all";

  function setParam(k: string, v: string, dflt: string) {
    const next = new URLSearchParams(sp.toString());
    if (v === dflt) next.delete(k);
    else next.set(k, v);
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  const filtersHidden = !showFilters || /\/(onboarding|settings|reports)(\/|$)/.test(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-line bg-surface/95 px-8 backdrop-blur">
      <div className="flex items-center gap-2">
        {!filtersHidden ? (
          <>
            <div className="inline-flex items-center gap-0.5 rounded-sm border border-line bg-subtle p-0.5" role="group" aria-label="Date range">
              <CalendarDays className="mx-1.5 size-4 text-ink-3" aria-hidden="true" />
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={range === r.value}
                  onClick={() => setParam("range", r.value, "30")}
                  className={cn(
                    "h-7 rounded-xs px-2.5 text-sm font-medium",
                    range === r.value ? "bg-surface text-ink shadow-xs" : "text-ink-3 hover:text-ink",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="w-48">
              <Select
                size="sm"
                aria-label="AI engine"
                value={engine}
                onValueChange={(v) => setParam("engine", v, "all")}
                options={[{ value: "all", label: "All engines" }, ...ENGINES.map((e) => ({ value: e.id, label: e.name }))]}
              />
            </div>
            <span className="ml-1 hidden text-xs text-ink-4 xl:inline">Daily runs · times in UTC</span>
          </>
        ) : null}
      </div>
      <DM.Root>
        <DM.Trigger className="flex items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-subtle" aria-label="Account menu">
          <Avatar name={user.name} size={28} />
          <span className="hidden text-left lg:block">
            <span className="block text-sm leading-tight font-medium text-ink">{user.name}</span>
            <span className="block text-2xs leading-tight text-ink-3">{viewAs ? "Viewing as client" : user.isPlatformAdmin ? "Agency staff" : user.devBypass ? "Dev session" : "Member"}</span>
          </span>
          <ChevronDown className="size-4 text-ink-3" aria-hidden="true" />
        </DM.Trigger>
        <DM.Portal>
          <DM.Content align="end" sideOffset={6} className="z-50 w-60 animate-fade-in rounded-md border border-line bg-surface p-1 shadow-pop">
            <div className="px-2 py-2">
              <p className="text-sm font-medium text-ink">{user.name}</p>
              <p className="truncate text-xs text-ink-3">{user.email}</p>
            </div>
            <DM.Separator className="my-1 h-px bg-line" />
            <DM.Item asChild>
              <Link href="#" className="flex h-8 items-center gap-2 rounded-xs px-2 text-sm text-ink-2 outline-none data-[highlighted]:bg-subtle">
                <UserRound className="size-4" aria-hidden="true" /> Profile
              </Link>
            </DM.Item>
            {user.isPlatformAdmin && !viewAs ? (
              <DM.Item asChild>
                <Link href="/admin" className="flex h-8 items-center gap-2 rounded-xs px-2 text-sm text-ink-2 outline-none data-[highlighted]:bg-subtle">
                  <Gauge className="size-4" aria-hidden="true" /> Super admin console
                </Link>
              </DM.Item>
            ) : null}
            {viewAs ? (
              <DM.Item
                onSelect={() => void exitViewAs()}
                className="flex h-8 cursor-default items-center gap-2 rounded-xs px-2 text-sm text-ink-2 outline-none data-[highlighted]:bg-subtle"
              >
                <Gauge className="size-4" aria-hidden="true" /> Exit client view
              </DM.Item>
            ) : null}
            <DM.Separator className="my-1 h-px bg-line" />
            <DM.Item asChild>
              <Link href="/login" className="flex h-8 items-center gap-2 rounded-xs px-2 text-sm text-ink-2 outline-none data-[highlighted]:bg-subtle">
                <LogOut className="size-4" aria-hidden="true" /> Sign out
              </Link>
            </DM.Item>
          </DM.Content>
        </DM.Portal>
      </DM.Root>
    </header>
  );
}

export function TopbarFallback() {
  return <header className="sticky top-0 z-30 h-14 border-b border-line bg-surface" aria-hidden="true" />;
}

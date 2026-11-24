"use client";

import * as DM from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { OrgMark } from "@/components/ui/avatar";
import type { Org } from "@/lib/ui/data-types";

export function OrgSwitcher({ org, orgs, canSwitch }: { org: Org; orgs: Org[]; canSwitch: boolean }) {
  const trigger = (
    <span className="flex w-full items-center gap-2.5 rounded-sm border border-line px-2 py-1.5 text-left hover:border-line-strong hover:bg-subtle/60">
      <OrgMark name={org.name} color={org.color} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{org.name}</span>
        <span className="block truncate text-2xs text-ink-3">{org.domain}</span>
      </span>
      {canSwitch ? <ChevronsUpDown className="size-4 text-ink-3" aria-hidden="true" /> : null}
    </span>
  );
  if (!canSwitch) return trigger;
  return (
    <DM.Root>
      <DM.Trigger className="w-full rounded-sm" aria-label={`Client account: ${org.name}. Switch account`}>
        {trigger}
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="start" sideOffset={6} className="z-50 w-64 animate-fade-in rounded-md border border-line bg-surface p-1 shadow-pop">
          <DM.Label className="px-2 py-1.5 text-2xs font-semibold tracking-wider text-ink-4 uppercase">Client accounts</DM.Label>
          {orgs.map((o) => (
            <DM.Item key={o.id} asChild>
              <Link href={`/app/${o.slug}`} className="flex items-center gap-2.5 rounded-xs px-2 py-1.5 outline-none data-[highlighted]:bg-subtle">
                <OrgMark name={o.name} color={o.color} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{o.name}</span>
                  <span className="block truncate text-2xs text-ink-3">{o.industry}</span>
                </span>
                {o.id === org.id ? <Check className="size-4 text-accent" aria-label="Current" /> : null}
              </Link>
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

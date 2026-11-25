"use client";

import { Mail } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { setOutreachStage } from "@/app/app/[orgSlug]/actions";
import type { OutreachContact, OutreachStage } from "@/lib/ui/data-types";
import { cn } from "@/lib/ui/cn";
import { fmtDate } from "@/lib/ui/format";

const STAGES: { id: OutreachStage; label: string }[] = [
  { id: "new", label: "New" },
  { id: "queued", label: "Queued" },
  { id: "contacted", label: "Contacted" },
  { id: "replied", label: "Replied" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

/** Pipeline board. Stage changes save through a server action. Ignored contacts are hidden. */
export function OutreachView({ orgId, contacts: initial }: { orgId: string; contacts: OutreachContact[] }) {
  const [contacts, setContacts] = useState(initial);
  if (!contacts.length) {
    return <EmptyState icon={Mail} title="No outreach contacts yet" description="Contacts are suggested from the domains AI engines cite most for your prompts." />;
  }
  return (
    <div className="grid grid-cols-6 gap-3 overflow-x-auto">
      {STAGES.map((s) => {
        const col = contacts.filter((c) => c.stage === s.id);
        return (
          <section key={s.id} className="flex min-w-48 flex-col gap-2 rounded-md bg-subtle/70 p-2" aria-label={s.label}>
            <header className="flex items-center justify-between px-1 py-1">
              <h2 className="font-sans text-sm font-semibold text-ink">{s.label}</h2>
              <span className="text-xs text-ink-3 tabular">{col.length}</span>
            </header>
            {col.map((c) => (
              <article key={c.id} className={cn("flex flex-col gap-2 rounded-sm border border-line bg-surface p-3", s.id === "lost" && "opacity-70")}>
                <div className="flex items-center gap-2">
                  <Avatar name={c.name} size={24} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                    <p className="truncate text-2xs text-ink-3">{[c.role, c.publication].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
                {c.email ? (
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-mono text-2xs text-ink-3">{c.email}</span>
                    <CopyButton value={c.email} label="Copy" />
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5">
                  {c.domain ? <Badge tone="outline">{c.domain}</Badge> : null}
                  <span className="text-2xs text-ink-3 tabular">{c.citations} citations</span>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
                  <span className="text-2xs text-ink-4">{c.lastTouch ? `Last contact ${fmtDate(c.lastTouch)}` : "Not contacted"}</span>
                </div>
                <Select
                  size="sm"
                  aria-label={`Stage for ${c.name}`}
                  value={c.stage}
                  onValueChange={(v) => {
                    setContacts((l) => l.map((x) => (x.id === c.id ? { ...x, stage: v as OutreachStage } : x)));
                    void setOutreachStage(orgId, c.id, v as OutreachStage);
                  }}
                  options={STAGES.map((x) => ({ value: x.id, label: `Move to ${x.label}` }))}
                />
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}

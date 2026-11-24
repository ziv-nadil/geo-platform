"use client";

import { ChevronDown, MessagesSquare, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { EngineChip } from "@/components/dashboard/engine-chip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SegmentedList, SegmentedTrigger, Tabs } from "@/components/ui/tabs";
import type { EngineId, Sentiment } from "@/lib/ui/data-types";
import { cn } from "@/lib/ui/cn";
import { fmtDay } from "@/lib/ui/format";

export interface ResponseItem {
  key: string;
  engine: EngineId;
  date: string;
  promptId: string;
  promptText: string;
  topic: string;
  mentioned: boolean;
  position: number | null;
  sentiment: Sentiment | null;
  citations: number;
  brands: string[];
  body: ReactNode;
  preview: string;
}

export function ResponsesView({ items, orgSlug, qs }: { items: ResponseItem[]; orgSlug: string; qs: string }) {
  const [q, setQ] = useState("");
  const [mentioned, setMentioned] = useState("all");
  const [sentiment, setSentiment] = useState("all");
  const [open, setOpen] = useState<string | null>(items[0]?.key ?? null);
  const list = useMemo(
    () =>
      items.filter(
        (i) =>
          (mentioned === "all" || (mentioned === "yes") === i.mentioned) &&
          (sentiment === "all" || i.sentiment === sentiment) &&
          (!q || i.promptText.toLowerCase().includes(q.toLowerCase()) || i.preview.toLowerCase().includes(q.toLowerCase())),
      ),
    [items, q, mentioned, sentiment],
  );
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-4" aria-hidden="true" />
          <Input aria-label="Search answers" placeholder="Search prompts and answer text" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Tabs value={mentioned} onValueChange={setMentioned}>
          <SegmentedList aria-label="Brand mentioned">
            <SegmentedTrigger value="all">All answers</SegmentedTrigger>
            <SegmentedTrigger value="yes">Mentions you</SegmentedTrigger>
            <SegmentedTrigger value="no">Missing you</SegmentedTrigger>
          </SegmentedList>
        </Tabs>
        <Tabs value={sentiment} onValueChange={setSentiment}>
          <SegmentedList aria-label="Sentiment">
            <SegmentedTrigger value="all">Any tone</SegmentedTrigger>
            <SegmentedTrigger value="positive">Positive</SegmentedTrigger>
            <SegmentedTrigger value="neutral">Neutral</SegmentedTrigger>
            <SegmentedTrigger value="negative">Negative</SegmentedTrigger>
          </SegmentedList>
        </Tabs>
        <span className="ml-auto text-sm text-ink-3 tabular">{list.length} answers</span>
      </div>
      {list.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={MessagesSquare} title="No answers match" description="Try a different search or clear the filters." />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((i) => {
            const isOpen = open === i.key;
            return (
              <li key={i.key}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i.key)}
                  className="grid w-full grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 text-left hover:bg-subtle/50"
                >
                  <span className="flex flex-col gap-0.5">
                    <EngineChip id={i.engine} short />
                    <span className="text-2xs text-ink-4">{fmtDay(i.date)}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{i.promptText}</span>
                    <span className="block truncate text-xs text-ink-3">{i.preview}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {i.mentioned ? <Badge tone="good">#{i.position} mention</Badge> : <Badge tone="neutral">Not mentioned</Badge>}
                    {i.sentiment ? (
                      <Badge tone={i.sentiment === "positive" ? "good" : i.sentiment === "negative" ? "bad" : "outline"} className="capitalize">
                        {i.sentiment}
                      </Badge>
                    ) : null}
                    <span className="w-16 text-right text-xs text-ink-4">{i.citations} sources</span>
                    <ChevronDown className={cn("size-4 text-ink-4 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
                  </span>
                </button>
                {isOpen ? (
                  <div className="border-t border-line bg-subtle/40 px-5 py-4 pl-[190px]">
                    {i.body}
                    <div className="mt-3 flex items-center gap-3 text-xs text-ink-3">
                      <span>Brands in order: {i.brands.join(" → ") || "none"}</span>
                      <Link href={`/app/${orgSlug}/prompts/${i.promptId}${qs}`} className="font-medium text-accent hover:underline">
                        Open prompt
                      </Link>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

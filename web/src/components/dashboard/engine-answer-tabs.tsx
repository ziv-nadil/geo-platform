"use client";

import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ENGINE_BY_ID } from "@/lib/ui/engines";
import type { Citation, EngineId, Sentiment } from "@/lib/ui/data-types";

export function EngineAnswerTabs({
  answers,
}: {
  answers: { engine: EngineId; mentioned: boolean; position: number | null; sentiment: Sentiment | null; citations: Citation[]; body: ReactNode }[];
}) {
  return (
    <Tabs defaultValue={answers[0]?.engine}>
      <TabsList>
        {answers.map((a) => (
          <TabsTrigger key={a.engine} value={a.engine}>
            <span className="size-2 rounded-full" style={{ background: ENGINE_BY_ID[a.engine].color }} aria-hidden="true" />
            {ENGINE_BY_ID[a.engine].short}
            <span className={a.mentioned ? "text-good" : "text-ink-4"} aria-label={a.mentioned ? "mentioned" : "not mentioned"}>
              {a.mentioned ? "●" : "○"}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {answers.map((a) => (
        <TabsContent key={a.engine} value={a.engine}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusPill status={a.mentioned ? "pass" : "fail"} label={a.mentioned ? `Mentioned · position ${a.position}` : "Not mentioned"} />
            {a.sentiment ? (
              <Badge tone={a.sentiment === "positive" ? "good" : a.sentiment === "negative" ? "bad" : "neutral"} className="capitalize">
                {a.sentiment}
              </Badge>
            ) : null}
            <span className="text-xs text-ink-4">Collected Nov 24, 2026 · 06:00 UTC</span>
          </div>
          <div className="rounded-sm border border-line bg-subtle/40 p-4">{a.body}</div>
          <h3 className="mt-5 mb-2 font-sans text-sm font-semibold text-ink">Citations ({a.citations.length})</h3>
          <ol className="flex flex-col gap-1.5">
            {a.citations.map((c, i) => (
              <li key={c.url} className="flex items-center gap-2 text-sm">
                <span className="w-5 shrink-0 font-mono text-2xs text-ink-4">[{i + 1}]</span>
                <a href={c.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 truncate text-ink-2 hover:text-accent">
                  <span className="truncate">{c.title}</span>
                  <span className="shrink-0 text-xs text-ink-4">· {c.domain}</span>
                  <ExternalLink className="size-3 shrink-0 text-ink-4" aria-hidden="true" />
                </a>
                {c.type === "owned" ? <Badge tone="accent">Yours</Badge> : null}
              </li>
            ))}
          </ol>
        </TabsContent>
      ))}
    </Tabs>
  );
}

"use client";

import { Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptSuggestions, dismissSuggestions, refreshSuggestions } from "@/app/app/[orgSlug]/prompts/discovery-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import type { SuggestionRow } from "@/lib/server/queries/discovery";
import { fmtNumber } from "@/lib/ui/format";

const SOURCES: Record<string, { label: string; tip: string }> = {
  gsc: { label: "Search Console", tip: "A real query people typed into Google to reach your site (last 90 days)." },
  keyword_planner: { label: "Keyword Planner", tip: "A Google Ads keyword idea. Volume is Google monthly searches, a proxy: no prompt volume exists." },
  paa: { label: "People Also Ask", tip: "A question Google shows for your topics. Already shaped like an AI prompt." },
  llm: { label: "AI generated", tip: "Written from your brand book: ICP, persona and funnel stage. No volume data." },
};

export function SuggestionsPanel({ orgId, rows, remaining, limit }: { orgId: string; rows: SuggestionRow[]; remaining: number | null; limit: number | null }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const over = remaining !== null && sel.size > remaining;

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const run = (fn: () => Promise<{ ok: boolean; error?: string; text?: string }>) =>
    start(async () => { const r = await fn(); setNotice({ ok: r.ok, text: r.ok ? (r.text ?? "Done.") : (r.error ?? "Failed.") }); if (r.ok) { setSel(new Set()); router.refresh(); } });

  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-accent" aria-hidden="true" /> Suggestions</span>}
        description="Candidate prompts from Search Console, Keyword Planner, People Also Ask and your brand book, ranked by volume × intent × competitor presence. Nothing is tracked until you accept it."
        actions={<Button variant="secondary" disabled={pending} onClick={() => run(async () => {
          const r = await refreshSuggestions(orgId);
          if (!r.ok) return r;
          const off = r.data!.sources.filter((s) => s.status === "not_configured").map((s) => s.source);
          return { ok: true, text: `Found ${r.data!.added} new suggestions.${off.length ? ` Not configured: ${off.join(", ")}.` : ""}` };
        })}><RefreshCw className={pending ? "animate-spin" : ""} /> Find suggestions</Button>}
      />
      <CardBody>
        {notice ? <p role="status" className={notice.ok ? "mb-3 text-sm text-ink-2" : "mb-3 text-sm text-bad"}>{notice.text}</p> : null}
        {rows.length === 0 ? (
          <EmptyState icon={Lightbulb} title="No suggestions yet" description="Select Find suggestions to pull ideas from your connected sources. Sources without credentials are skipped." />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => setSel(sel.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}>{sel.size === rows.length ? "Clear" : "Select all"}</Button>
              <Button disabled={pending || !sel.size || over} onClick={() => run(async () => { const r = await acceptSuggestions(orgId, [...sel]); return r.ok ? { ok: true, text: `Tracking ${r.data} new prompt${r.data === 1 ? "" : "s"}.` } : r; })}>Track {sel.size || ""} selected</Button>
              <Button variant="secondary" disabled={pending || !sel.size} onClick={() => run(async () => { const r = await dismissSuggestions(orgId, [...sel]); return r.ok ? { ok: true, text: "Dismissed." } : r; })}>Dismiss</Button>
              <span className="text-xs text-ink-3">{limit === null ? "Unlimited tracked prompts" : `${remaining} of ${limit} tracked-prompt slots left`}{over ? ": select fewer or upgrade your plan" : ""}</span>
            </div>
            <ul className="grid gap-3 md:grid-cols-2">
              {rows.map((s) => (
                <li key={s.id} className="flex gap-3 rounded-sm border border-line p-3">
                  <Checkbox checked={sel.has(s.id)} onCheckedChange={() => toggle(s.id)} aria-label={`Select: ${s.text}`} />
                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-sm font-medium text-ink">{s.text}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {s.sources.map((k) => <Tooltip key={k} content={SOURCES[k]?.tip ?? k}><span><Badge tone="info">{SOURCES[k]?.label ?? k}</Badge></span></Tooltip>)}
                      {s.topic ? <Badge tone="outline">{s.topic}</Badge> : null}
                      {s.funnel ? <Badge tone="outline">{s.funnel}</Badge> : null}
                      {s.volume !== null ? <span className="text-xs text-ink-3">~{fmtNumber(s.volume)}/mo</span> : null}
                      <Tooltip content={`Score = volume × intent (${s.intent.toFixed(2)}) × competitor presence (${(1 + s.competitorPresence).toFixed(1)}×)`}><span className="text-xs text-ink-3">score {s.score.toFixed(2)}</span></Tooltip>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}

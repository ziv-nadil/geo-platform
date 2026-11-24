"use client";

import { ArrowDown, ArrowUp, Lightbulb, Plus, Search, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { MetricHelp } from "@/components/ui/metric-help";
import { Select } from "@/components/ui/select";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { ENGINES } from "@/lib/mock/engines";
import type { DiscoverySuggestion, Funnel, PromptRow } from "@/lib/mock/types";
import { cn } from "@/lib/ui/cn";
import { fmtNumber } from "@/lib/ui/format";

type SortKey = "visibility" | "delta" | "volume" | "avgPosition" | "text";

const FUNNEL_LABEL: Record<Funnel, string> = { awareness: "Awareness", consideration: "Consideration", decision: "Decision" };

function VisCell({ v }: { v: number }) {
  // Sequential single-hue cell: magnitude → teal opacity. Text stays in ink.
  return (
    <span className="inline-flex h-6 w-11 items-center justify-center rounded-xs text-xs font-medium tabular text-ink" style={{ background: `rgba(0,140,153,${0.06 + (v / 100) * 0.5})` }}>
      {Math.round(v)}
    </span>
  );
}

function SortTh({
  k,
  sort,
  setSort,
  children,
  className,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  setSort: (fn: (s: { key: SortKey; dir: 1 | -1 }) => { key: SortKey; dir: 1 | -1 }) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <Th className={className} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className={cn("inline-flex items-center gap-1 uppercase", active && "text-ink")}
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((s.dir * -1) as 1 | -1) : -1 }))}
      >
        {children}
        {active ? sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
      </button>
    </Th>
  );
}

export function PromptsView({
  orgSlug,
  qs,
  rows: initialRows,
  topics,
  personas,
  suggestions: initialSuggestions,
}: {
  orgSlug: string;
  qs: string;
  rows: PromptRow[];
  topics: string[];
  personas: string[];
  suggestions: DiscoverySuggestion[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState("all");
  const [persona, setPersona] = useState("all");
  const [funnel, setFunnel] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "visibility", dir: -1 });

  const filtered = useMemo(() => {
    const list = rows.filter(
      (r) =>
        (topic === "all" || r.topic === topic) &&
        (persona === "all" || r.persona === persona) &&
        (funnel === "all" || r.funnel === funnel) &&
        (!q || r.text.toLowerCase().includes(q.toLowerCase())),
    );
    const val = (r: PromptRow): number | string =>
      sort.key === "delta" ? r.visibility - r.visibilityPrev : sort.key === "text" ? r.text : sort.key === "avgPosition" ? r.avgPosition ?? 99 : r[sort.key];
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, q, topic, persona, funnel, sort]);

  const avg = filtered.length ? filtered.reduce((s, r) => s + r.visibility, 0) / filtered.length : 0;

  function addPrompts(texts: string[], t = topics[0]!, p = personas[0]!, f: Funnel = "consideration", source: PromptRow["source"] = "manual") {
    const now = "2026-11-24";
    setRows((prev) => [
      ...texts.map((text, i) => ({
        id: `new-${prev.length + i}-${text.length}`,
        text,
        topic: t,
        persona: p,
        funnel: f,
        tags: ["New"],
        volume: 0,
        createdAt: now,
        source,
        visibility: 0,
        visibilityPrev: 0,
        avgPosition: null,
        sentiment: 0,
        byEngine: { chatgpt: 0, perplexity: 0, gemini: 0, claude: 0, google_aio: 0 },
        topCompetitor: null,
        citations: 0,
      })),
      ...prev,
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-4" aria-hidden="true" />
            <Input aria-label="Search prompts" placeholder="Search prompts" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <div className="w-44">
            <Select aria-label="Topic" value={topic} onValueChange={setTopic} options={[{ value: "all", label: "All topics" }, ...topics.map((t) => ({ value: t, label: t }))]} />
          </div>
          <div className="w-44">
            <Select aria-label="Persona" value={persona} onValueChange={setPersona} options={[{ value: "all", label: "All personas" }, ...personas.map((t) => ({ value: t, label: t }))]} />
          </div>
          <div className="w-40">
            <Select
              aria-label="Funnel stage"
              value={funnel}
              onValueChange={setFunnel}
              options={[{ value: "all", label: "All stages" }, ...Object.entries(FUNNEL_LABEL).map(([value, label]) => ({ value, label }))]}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ImportDialog onImport={(texts) => addPrompts(texts, undefined, undefined, undefined, "import")} />
            <AddPromptDialog topics={topics} personas={personas} onAdd={(text, t, p, f) => addPrompts([text], t, p, f)} />
          </div>
        </div>
        <div className="flex items-center gap-4 border-t border-line px-5 py-2.5 text-sm text-ink-3">
          <span>
            <strong className="font-semibold text-ink tabular">{filtered.length}</strong> of {rows.length} prompts
          </span>
          <span className="inline-flex items-center gap-1">
            Avg. visibility <strong className="font-semibold text-ink tabular">{avg.toFixed(1)}%</strong>
            <MetricHelp id="promptVisibility" />
          </span>
          <span className="ml-auto text-xs">Cells show visibility per engine, 0–100.</span>
        </div>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <SortTh sort={sort} setSort={setSort} k="text" className="w-[38%]">Prompt</SortTh>
                <Th>Topic · persona</Th>
                <SortTh sort={sort} setSort={setSort} k="visibility" className="text-right">
                  Visibility
                </SortTh>
                <SortTh sort={sort} setSort={setSort} k="delta" className="text-right">
                  Change
                </SortTh>
                {ENGINES.map((e) => (
                  <Th key={e.id} className="text-center">
                    <Tooltip content={e.name}>
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2 rounded-full" style={{ background: e.color }} aria-hidden="true" />
                        {e.short === "AI Overviews" ? "AIO" : e.short.slice(0, 4)}
                      </span>
                    </Tooltip>
                  </Th>
                ))}
                <SortTh sort={sort} setSort={setSort} k="avgPosition" className="text-right">
                  Pos.
                </SortTh>
                <SortTh sort={sort} setSort={setSort} k="volume" className="text-right">
                  Volume
                </SortTh>
              </tr>
            </THead>
            <TBody>
              {filtered.map((r) => {
                const d = r.visibility - r.visibilityPrev;
                return (
                  <Tr key={r.id}>
                    <Td className="max-w-0">
                      <Link href={`/app/${orgSlug}/prompts/${r.id}${qs}`} className="block truncate font-medium text-ink hover:text-accent hover:underline" title={r.text}>
                        {r.text}
                      </Link>
                      <span className="mt-0.5 flex gap-1">
                        <Badge tone="outline">{FUNNEL_LABEL[r.funnel]}</Badge>
                        {r.tags.filter((t) => !["TOFU", "MOFU", "BOFU"].includes(t)).map((t) => (
                          <Badge key={t} tone={t === "New" ? "info" : "neutral"}>
                            {t}
                          </Badge>
                        ))}
                        {r.source === "discovery" ? <Badge tone="accent">Discovered</Badge> : null}
                      </span>
                    </Td>
                    <Td>
                      <span className="block text-sm text-ink-2">{r.topic}</span>
                      <span className="block text-xs text-ink-4">{r.persona}</span>
                    </Td>
                    <Td className="text-right font-semibold text-ink">{r.visibility.toFixed(0)}%</Td>
                    <Td className={cn("text-right text-sm", d > 0.5 ? "text-good" : d < -0.5 ? "text-bad" : "text-ink-4")}>
                      {d > 0 ? "+" : d < 0 ? "−" : "±"}
                      {Math.abs(d).toFixed(0)}
                    </Td>
                    {ENGINES.map((e) => (
                      <Td key={e.id} className="text-center">
                        <VisCell v={r.byEngine[e.id]} />
                      </Td>
                    ))}
                    <Td className="text-right">{r.avgPosition ? r.avgPosition.toFixed(1) : "—"}</Td>
                    <Td className="text-right">{r.volume ? fmtNumber(r.volume) : "—"}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
        {filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Search} title="No prompts match these filters" description="Clear a filter or search for a different phrase." />
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Sparkles className="size-4 text-accent" aria-hidden="true" /> Prompt discovery
            </span>
          }
          description="Questions your buyers ask AI engines where competitors show up and you don't. Add the ones worth tracking."
        />
        <CardBody>
          {suggestions.length === 0 ? (
            <EmptyState icon={Lightbulb} title="All suggestions reviewed" description="New suggestions arrive after the next weekly discovery run." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {suggestions.map((s) => (
                <li key={s.id} className="flex flex-col gap-2 rounded-sm border border-line p-3">
                  <p className="text-sm font-medium text-ink">{s.text}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="outline">{s.topic}</Badge>
                    <Badge tone="outline">{s.persona}</Badge>
                    <Badge tone="outline">{FUNNEL_LABEL[s.funnel]}</Badge>
                    <span className="text-xs text-ink-3">
                      {fmtNumber(s.volume)}/mo · competitors visible in {s.competitorVisibility}%
                    </span>
                  </div>
                  <p className="text-xs text-ink-3">{s.reason}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => {
                        addPrompts([s.text], s.topic, s.persona, s.funnel, "discovery");
                        setSuggestions((l) => l.filter((x) => x.id !== s.id));
                      }}
                    >
                      <Plus /> Track prompt
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSuggestions((l) => l.filter((x) => x.id !== s.id))}>
                      Dismiss
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function AddPromptDialog({ topics, personas, onAdd }: { topics: string[]; personas: string[]; onAdd: (text: string, topic: string, persona: string, funnel: Funnel) => void }) {
  const [text, setText] = useState("");
  const [topic, setTopic] = useState(topics[0]!);
  const [persona, setPersona] = useState(personas[0]!);
  const [funnel, setFunnel] = useState<Funnel>("consideration");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add prompt
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add a tracked prompt"
        description="Write it the way a buyer would ask an AI assistant. We run it daily on every engine."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button disabled={text.trim().length < 8} onClick={() => onAdd(text.trim(), topic, persona, funnel)}>
                Add prompt
              </Button>
            </DialogClose>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Prompt" htmlFor="new-prompt" required help="At least 8 characters. Avoid your brand name unless you track branded prompts on purpose.">
            <Textarea id="new-prompt" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What is the best …" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Topic" htmlFor="np-topic">
              <Select id="np-topic" value={topic} onValueChange={setTopic} options={topics.map((t) => ({ value: t, label: t }))} />
            </Field>
            <Field label="Persona" htmlFor="np-persona">
              <Select id="np-persona" value={persona} onValueChange={setPersona} options={personas.map((t) => ({ value: t, label: t }))} />
            </Field>
            <Field label="Funnel stage" htmlFor="np-funnel">
              <Select id="np-funnel" value={funnel} onValueChange={(v) => setFunnel(v as Funnel)} options={Object.entries(FUNNEL_LABEL).map(([value, label]) => ({ value, label }))} />
            </Field>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ onImport }: { onImport: (texts: string[]) => void }) {
  const [raw, setRaw] = useState("");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.split(",")[0]!.trim().replace(/^"|"$/g, ""))
    .filter((l) => l.length >= 8);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Upload /> Import
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Import prompts"
        description="Paste one prompt per line, or a CSV whose first column is the prompt. Topic and persona default to the first in your list; edit them after import."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button disabled={!lines.length} onClick={() => onImport(lines)}>
                Import {lines.length || ""} prompts
              </Button>
            </DialogClose>
          </>
        }
      >
        <Field label="Prompts" htmlFor="import-prompts" help={`${lines.length} valid line${lines.length === 1 ? "" : "s"} detected`}>
          <Textarea
            id="import-prompts"
            rows={8}
            className="font-mono text-sm"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={"best product analytics for startups\nhow to measure activation rate"}
          />
        </Field>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-accent">
          <Upload className="size-4" aria-hidden="true" />
          <span className="underline underline-offset-2">Or choose a .csv / .txt file</span>
          <input
            type="file"
            accept=".csv,.txt"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setRaw(await f.text());
            }}
          />
        </label>
      </DialogContent>
    </Dialog>
  );
}

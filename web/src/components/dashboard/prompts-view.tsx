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
import { useRouter } from "next/navigation";
import { addPrompts as addPromptsAction } from "@/app/app/[orgSlug]/actions";
import { engineMeta } from "@/lib/ui/engines";
import type { EngineId, PromptRow } from "@/lib/ui/data-types";
import { cn } from "@/lib/ui/cn";
import { fmtNumber } from "@/lib/ui/format";

type SortKey = "visibility" | "delta" | "runs" | "avgPosition" | "text";
type Funnel = string;

const FUNNEL_LABEL: Record<string, string> = { awareness: "Awareness", consideration: "Consideration", decision: "Decision", retention: "Retention" };

function VisCell({ v }: { v: number | null }) {
  if (v === null) return <span className="text-ink-4">—</span>;
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
  orgId,
  orgSlug,
  qs,
  rows,
  engineIds,
  topics,
}: {
  orgId: string;
  orgSlug: string;
  qs: string;
  rows: PromptRow[];
  engineIds: EngineId[];
  topics: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const personas = [...new Set(rows.map((r) => r.persona).filter(Boolean) as string[])];
  const topicNames = [...new Set(rows.map((r) => r.topic).filter(Boolean) as string[])];
  const suggestions = rows.filter((r) => r.source === "suggested" || r.source === "discovered");
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
      sort.key === "delta" ? (r.visibility ?? 0) - (r.visibilityPrev ?? r.visibility ?? 0) : sort.key === "text" ? r.text : sort.key === "avgPosition" ? r.avgPosition ?? 99 : sort.key === "runs" ? r.runs : r.visibility ?? -1;
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, q, topic, persona, funnel, sort]);

  const withVis = filtered.filter((r) => r.visibility !== null);
  const avg = withVis.length ? withVis.reduce((s, r) => s + r.visibility!, 0) / withVis.length : null;

  async function addPrompts(texts: string[], topicName?: string, _persona?: string, funnelStage?: Funnel, source: "manual" | "imported" = "manual") {
    void _persona;
    const topicId = topics.find((t) => t.name === topicName)?.id ?? null;
    const res = await addPromptsAction(orgId, texts, { topicId, funnel: funnelStage ?? null, source });
    setNotice(res.ok ? { ok: true, text: `Added ${texts.length} prompt${texts.length > 1 ? "s" : ""}. They run in the next daily batch.` } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
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
            <Select aria-label="Topic" value={topic} onValueChange={setTopic} options={[{ value: "all", label: "All topics" }, ...topicNames.map((t) => ({ value: t, label: t }))]} />
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
            <ImportDialog onImport={(texts) => void addPrompts(texts, undefined, undefined, undefined, "imported")} />
            <AddPromptDialog topics={topicNames.length ? topicNames : ["General"]} personas={personas.length ? personas : ["Any"]} onAdd={(text, t, p, f) => void addPrompts([text], t, p, f)} />
          </div>
        </div>
        <div className="flex items-center gap-4 border-t border-line px-5 py-2.5 text-sm text-ink-3">
          <span>
            <strong className="font-semibold text-ink tabular">{filtered.length}</strong> of {rows.length} prompts
          </span>
          <span className="inline-flex items-center gap-1">
            Avg. visibility <strong className="font-semibold text-ink tabular">{avg === null ? "—" : `${avg.toFixed(1)}%`}</strong>
            <MetricHelp id="promptVisibility" />
          </span>
          {notice ? <span className={cn("text-sm", notice.ok ? "text-good" : "text-bad")} role="status">{notice.text}</span> : null}
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
                {engineIds.map((id) => engineMeta(id)).map((e) => (
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
                <SortTh sort={sort} setSort={setSort} k="runs" className="text-right">
                  Answers
                </SortTh>
              </tr>
            </THead>
            <TBody>
              {filtered.map((r) => {
                const d = r.visibility !== null && r.visibilityPrev !== null ? r.visibility - r.visibilityPrev : null;
                return (
                  <Tr key={r.id}>
                    <Td className="max-w-0">
                      <Link href={`/app/${orgSlug}/prompts/${r.id}${qs}`} className="block truncate font-medium text-ink hover:text-accent hover:underline" title={r.text}>
                        {r.text}
                      </Link>
                      <span className="mt-0.5 flex gap-1">
                        {r.funnel ? <Badge tone="outline">{FUNNEL_LABEL[r.funnel] ?? r.funnel}</Badge> : null}
                        {r.tags.map((t) => (
                          <Badge key={t} tone="neutral">
                            {t}
                          </Badge>
                        ))}
                        {r.source === "discovered" || r.source === "suggested" ? <Badge tone="accent">Discovered</Badge> : null}
                        {r.runs === 0 ? <Badge tone="info">Awaiting first run</Badge> : null}
                      </span>
                    </Td>
                    <Td>
                      <span className="block max-w-44 truncate text-sm whitespace-nowrap text-ink-2" title={r.topic ?? undefined}>{r.topic ?? "No topic"}</span>
                      <span className="block max-w-44 truncate text-xs whitespace-nowrap text-ink-4">{r.persona ?? "Any persona"}</span>
                    </Td>
                    <Td className="text-right font-semibold text-ink">{r.visibility === null ? "—" : `${r.visibility.toFixed(0)}%`}</Td>
                    <Td className={cn("text-right text-sm", d === null ? "text-ink-4" : d > 0.5 ? "text-good" : d < -0.5 ? "text-bad" : "text-ink-4")}>
                      {d === null ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d).toFixed(0)}`}
                    </Td>
                    {engineIds.map((e) => (
                      <Td key={e} className="text-center">
                        <VisCell v={r.byEngine[e] ?? null} />
                      </Td>
                    ))}
                    <Td className="text-right">{r.avgPosition ? r.avgPosition.toFixed(1) : "—"}</Td>
                    <Td className="text-right">{fmtNumber(r.runs)}</Td>
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
          description="Prompts found by the weekly discovery job from your ICP, Search Console queries and community threads. They are tracked like any other prompt."
        />
        <CardBody>
          {suggestions.length === 0 ? (
            <EmptyState icon={Lightbulb} title="No discovered prompts yet" description="The weekly discovery job adds questions your buyers ask where competitors appear and you don't. They show up here with a Discovered tag." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {suggestions.slice(0, 8).map((s) => (
                <li key={s.id} className="flex flex-col gap-2 rounded-sm border border-line p-3">
                  <Link href={`/app/${orgSlug}/prompts/${s.id}${qs}`} className="text-sm font-medium text-ink hover:text-accent">
                    {s.text}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.topic ? <Badge tone="outline">{s.topic}</Badge> : null}
                    {s.persona ? <Badge tone="outline">{s.persona}</Badge> : null}
                    <span className="text-xs text-ink-3">Visibility {s.visibility === null ? "not measured yet" : `${s.visibility.toFixed(0)}%`}</span>
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

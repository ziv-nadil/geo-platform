"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { TrendChart } from "@/components/charts/trend-chart";
import { EngineChip } from "@/components/dashboard/engine-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { MetricHelp } from "@/components/ui/metric-help";
import { Select } from "@/components/ui/select";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { useRouter } from "next/navigation";
import { addCompetitor, removeCompetitor } from "@/app/app/[orgSlug]/actions";
import type { HeadToHead, SovRow, TrendPoint } from "@/lib/ui/data-types";
import { cn } from "@/lib/ui/cn";

export function CompetitorsView({ orgId, rows, trend, h2h, sample, brandName }: { orgId: string; rows: SovRow[]; trend: TrendPoint[]; h2h: HeadToHead[]; sample: number; brandName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const competitors = rows.filter((r) => !r.isBrand);
  const [vs, setVs] = useState(competitors[0]?.id ?? "");
  const h = h2h.find((x) => x.competitorId === vs);
  const vsRow = rows.find((r) => r.id === vs);
  const tracked = rows.filter((r) => r.mentions > 0 || r.isBrand);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Share of voice leaderboard"
            help={<MetricHelp id="shareOfVoice" />}
            actions={
              <AddCompetitor
                onAdd={async (name, domain) => {
                  const r = await addCompetitor(orgId, name, domain);
                  if (r.ok) router.refresh();
                  else setError(r.error);
                }}
              />
            }
          />
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th className="w-10">#</Th>
                  <Th>Brand</Th>
                  <Th className="text-right">
                    <span className="inline-flex items-center gap-1">SoV <MetricHelp id="shareOfVoice" /></span>
                  </Th>
                  <Th className="text-right">Change</Th>
                  <Th className="text-right">
                    <span className="inline-flex items-center gap-1">Mentions <MetricHelp id="mentions" /></span>
                  </Th>
                  <Th className="text-right">
                    <span className="inline-flex items-center gap-1">Pos. <MetricHelp id="avgPosition" /></span>
                  </Th>
                  <Th className="w-10"><span className="sr-only">Actions</span></Th>
                </tr>
              </THead>
              <TBody>
                {rows.map((r, i) => {
                  const d = r.sovPrev === null ? null : r.sov - r.sovPrev;
                  return (
                    <Tr key={r.id} className={r.isBrand ? "bg-accent-soft/40" : undefined}>
                      <Td className="text-ink-4">{i + 1}</Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ background: r.color }} aria-hidden="true" />
                          <span className={cn("font-medium", r.isBrand ? "text-ink" : "text-ink-2")}>{r.name}</span>
                          {r.isBrand ? <Badge tone="accent">You</Badge> : null}
                          {r.mentions === 0 && !r.isBrand ? <Badge tone="info">Collecting from next run</Badge> : null}
                        </span>
                      </Td>
                      <Td className="text-right font-semibold text-ink">{r.sov.toFixed(1)}%</Td>
                      <Td className={cn("text-right text-sm", d === null ? "text-ink-4" : d > 0.2 ? "text-good" : d < -0.2 ? "text-bad" : "text-ink-4")}>
                        {d === null ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d).toFixed(1)} pt`}
                      </Td>
                      <Td className="text-right">{r.mentions.toLocaleString()}</Td>
                      <Td className="text-right">{r.avgPosition ? r.avgPosition.toFixed(1) : "—"}</Td>
                      <Td>
                        {!r.isBrand ? (
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await removeCompetitor(orgId, r.id);
                              if (res.ok) router.refresh();
                              else setError(res.error);
                            }}
                            className="rounded-xs p-1 text-ink-4 hover:bg-bad-soft hover:text-bad"
                            aria-label={`Stop tracking ${r.name}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        ) : null}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Share of voice over time" help={<MetricHelp id="shareOfVoice" />} description="Daily, all tracked brands" />
          {error ? <p className="px-5 text-sm text-bad" role="alert">{error}</p> : null}
          <CardBody>
            <TrendChart data={trend} series={tracked.map((r) => ({ key: r.id, name: r.isBrand ? `${r.name} (you)` : r.name, color: r.color, emphasis: r.isBrand }))} height={300} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Head-to-head"
          help={<MetricHelp id="headToHead" />}
          description={`How ${brandName} fares in answers that also name a competitor. Based on the latest ${sample.toLocaleString()} answers.`}
          actions={
            <div className="w-52">
              <Select aria-label="Competitor" value={vs} onValueChange={setVs} options={competitors.filter((c) => h2h.some((x) => x.competitorId === c.id)).map((c) => ({ value: c.id, label: `vs ${c.name}` }))} />
            </div>
          }
        />
        {h && vsRow ? (
          <CardBody className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm text-ink-3">Win rate when both are named</p>
                <p className="font-display text-3xl font-semibold text-ink tabular">{h.winRate.toFixed(0)}%</p>
                <p className="text-xs text-ink-4">{h.both.toLocaleString()} answers name both brands</p>
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {[
                  ["Only you", h.brandOnly, "#4a45e0"],
                  [`Only ${vsRow.name}`, h.compOnly, vsRow.color],
                  ["Both", h.both, "#5f6874"],
                  ["Neither", h.neither, "#cfd4da"],
                ].map(([label, n, color]) => (
                  <li key={String(label)} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-ink-2">
                      <span className="size-2.5 rounded-[3px]" style={{ background: String(color) }} aria-hidden="true" />
                      {label}
                    </span>
                    <span className="font-semibold text-ink tabular">{((Number(n) / Math.max(1, h.answers)) * 100).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-2xs font-semibold tracking-wider text-ink-4 uppercase">Win rate by engine</p>
              <ul className="flex flex-col gap-2.5">
                {h.byEngine.map((e) => (
                  <li key={e.engine} className="grid grid-cols-[120px_1fr_44px] items-center gap-2">
                    <EngineChip id={e.engine} short />
                    <div className="h-2.5 rounded-full bg-subtle">
                      <div className="h-full rounded-full bg-[#4a45e0]" style={{ width: `${e.winRate}%` }} />
                    </div>
                    <span className="text-right text-sm font-semibold text-ink tabular">{e.winRate.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        ) : null}
      </Card>
    </div>
  );
}

function AddCompetitor({ onAdd }: { onAdd: (name: string, domain: string) => void | Promise<void> }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const valid = name.trim().length > 1 && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.trim());
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Plus /> Add competitor
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Track a competitor"
        description="We start counting its mentions and citations from the next daily run. History is not backfilled."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button disabled={!valid} onClick={() => void onAdd(name.trim(), domain.trim().toLowerCase())}>
                Add competitor
              </Button>
            </DialogClose>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Brand name" htmlFor="comp-name" required>
            <Input id="comp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Analytics" />
          </Field>
          <Field label="Domain" htmlFor="comp-domain" required help="Without https:// or www, e.g. acme.com">
            <Input id="comp-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

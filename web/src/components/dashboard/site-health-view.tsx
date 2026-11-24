"use client";

import { CheckCircle2, ChevronDown, Circle, ExternalLink, Loader2, Play } from "lucide-react";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricHelp } from "@/components/ui/metric-help";
import { Select } from "@/components/ui/select";
import { SeverityBadge } from "@/components/ui/status";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { SegmentedList, SegmentedTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SiteIssue, SitePage, SiteProperty, SiteTask } from "@/lib/ui/data-types";
import { cn } from "@/lib/ui/cn";
import { fmtDate, fmtDateTime } from "@/lib/ui/format";

const STATUS_OPTS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "ignored", label: "Ignored" },
  { value: "fixed", label: "Fixed" },
];

function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "#0f7b3d" : score >= 60 ? "#f0a91b" : "#c2312f";
  return (
    <svg viewBox="0 0 64 64" className="size-16" role="img" aria-label={`Health score ${score} of 100`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#e9ecef" strokeWidth="6" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${(score / 100) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" className="fill-ink font-display text-[16px] font-semibold">
        {score}
      </text>
    </svg>
  );
}

export function SiteHealthView({ properties, issues: initialIssues, pages, tasks: initialTasks }: { properties: SiteProperty[]; issues: SiteIssue[]; pages: SitePage[]; tasks: SiteTask[] }) {
  const [issues, setIssues] = useState(initialIssues);
  const [tasks, setTasks] = useState(initialTasks);
  const [sev, setSev] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const shown = issues.filter((i) => sev === "all" || i.severity === sev);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        {properties.map((p) => (
          <Card key={p.id} className="flex items-center gap-5 p-5">
            <ScoreRing score={p.score} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-md font-semibold text-ink">
                {p.domain} <MetricHelp id="healthScore" />
              </p>
              <p className="text-sm text-ink-3">
                {p.pagesCrawled} pages · last audit {fmtDateTime(p.lastAuditAt)}
                <span className={cn("ml-2 font-medium", p.score >= p.scorePrev ? "text-good" : "text-bad")}>
                  {p.score >= p.scorePrev ? "+" : "−"}
                  {Math.abs(p.score - p.scorePrev)} since last audit
                </span>
              </p>
              <div className="mt-2 flex gap-2">
                <SeverityBadge severity="critical" />
                <span className="text-sm text-ink-2 tabular">{p.issues.critical}</span>
                <SeverityBadge severity="warning" />
                <span className="text-sm text-ink-2 tabular">{p.issues.warning}</span>
                <SeverityBadge severity="notice" />
                <span className="text-sm text-ink-2 tabular">{p.issues.notice}</span>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={running === p.id}
              onClick={() => {
                setRunning(p.id);
                setTimeout(() => setRunning(null), 2200);
              }}
            >
              {running === p.id ? <Loader2 className="animate-spin" /> : <Play />}
              {running === p.id ? "Queued" : "Run audit"}
            </Button>
          </Card>
        ))}
      </div>

      <Card>
        <Tabs defaultValue="issues">
          <div className="px-5 pt-3">
            <TabsList>
              <TabsTrigger value="issues">
                Issues <Badge tone="neutral">{issues.filter((i) => i.status !== "fixed").length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="pages">
                Pages <Badge tone="neutral">{pages.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="tasks">
                Tasks <Badge tone="neutral">{tasks.filter((t) => t.status !== "done").length}</Badge>
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="issues" className="pt-0">
            <div className="flex items-center gap-3 px-5 py-3">
              <Tabs value={sev} onValueChange={setSev}>
                <SegmentedList aria-label="Severity">
                  <SegmentedTrigger value="all">All</SegmentedTrigger>
                  <SegmentedTrigger value="critical">Critical</SegmentedTrigger>
                  <SegmentedTrigger value="warning">Warning</SegmentedTrigger>
                  <SegmentedTrigger value="notice">Notice</SegmentedTrigger>
                </SegmentedList>
              </Tabs>
            </div>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <Th className="w-[44%]">Issue</Th>
                    <Th>Severity</Th>
                    <Th>Category</Th>
                    <Th className="text-right">Pages</Th>
                    <Th>First seen</Th>
                    <Th className="w-40">Status</Th>
                  </tr>
                </THead>
                <TBody>
                  {shown.map((i) => (
                    <Fragment key={i.id}>
                      <Tr>
                        <Td>
                          <button type="button" className="flex items-start gap-1.5 text-left" aria-expanded={expanded === i.id} onClick={() => setExpanded(expanded === i.id ? null : i.id)}>
                            <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-ink-4 transition-transform", expanded === i.id && "rotate-180")} aria-hidden="true" />
                            <span>
                              <span className="block font-medium text-ink">{i.title}</span>
                              <span className="block text-xs text-ink-3">{i.description}</span>
                            </span>
                          </button>
                        </Td>
                        <Td>
                          <SeverityBadge severity={i.severity} />
                        </Td>
                        <Td>{i.category}</Td>
                        <Td className="text-right font-semibold text-ink">{i.pages}</Td>
                        <Td>{fmtDate(i.firstSeen)}</Td>
                        <Td>
                          <Select size="sm" aria-label={`Status of ${i.title}`} value={i.status} onValueChange={(v) => setIssues((l) => l.map((x) => (x.id === i.id ? { ...x, status: v as SiteIssue["status"] } : x)))} options={STATUS_OPTS} />
                        </Td>
                      </Tr>
                      {expanded === i.id ? (
                        <tr className="bg-subtle/50">
                          <td colSpan={6} className="px-5 py-3 pl-12 text-sm text-ink-2">
                            <strong className="font-semibold text-ink">How to fix: </strong>
                            {i.howToFix}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </TabsContent>
          <TabsContent value="pages" className="pt-0">
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <Th>Page</Th>
                    <Th className="text-right">Status</Th>
                    <Th className="text-right">Issues</Th>
                    <Th className="text-right">Words</Th>
                    <Th>Schema</Th>
                    <Th>AI crawled</Th>
                    <Th className="text-right">Load</Th>
                  </tr>
                </THead>
                <TBody>
                  {pages.map((p) => (
                    <Tr key={p.url}>
                      <Td className="max-w-0">
                        <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate font-medium text-ink hover:text-accent">
                          <span className="truncate">{p.url.replace(/^https:\/\/www\./, "")}</span>
                          <ExternalLink className="size-3 shrink-0 text-ink-4" aria-hidden="true" />
                        </a>
                      </Td>
                      <Td className="text-right">
                        <Badge tone={p.statusCode === 200 ? "good" : p.statusCode >= 400 ? "bad" : "warn"}>{p.statusCode}</Badge>
                      </Td>
                      <Td className="text-right">{p.issues}</Td>
                      <Td className="text-right">{p.words.toLocaleString()}</Td>
                      <Td>
                        <span className="flex gap-1">
                          {p.schema.length ? p.schema.map((s) => <Badge key={s} tone="outline">{s}</Badge>) : <span className="text-ink-4">None</span>}
                        </span>
                      </Td>
                      <Td>{p.aiCrawled ? <span className="inline-flex items-center gap-1 text-good"><CheckCircle2 className="size-4" aria-hidden="true" /> Yes</span> : <span className="inline-flex items-center gap-1 text-ink-4"><Circle className="size-4" aria-hidden="true" /> No</span>}</Td>
                      <Td className={cn("text-right", p.loadMs > 800 && "text-warn")}>{p.loadMs} ms</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </TabsContent>
          <TabsContent value="tasks" className="pt-0">
            <ul className="divide-y divide-line border-t border-line">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-4 px-5 py-3">
                  <button
                    type="button"
                    aria-label={t.status === "done" ? `Reopen ${t.title}` : `Mark ${t.title} done`}
                    onClick={() => setTasks((l) => l.map((x) => (x.id === t.id ? { ...x, status: x.status === "done" ? "todo" : "done" } : x)))}
                    className={cn("flex size-5 items-center justify-center rounded-full border", t.status === "done" ? "border-good bg-good text-white" : "border-line-strong hover:border-accent")}
                  >
                    {t.status === "done" ? <CheckCircle2 className="size-4" /> : null}
                  </button>
                  <span className={cn("flex-1 text-sm", t.status === "done" ? "text-ink-4 line-through" : "text-ink")}>{t.title}</span>
                  <Badge tone={t.priority === "high" ? "bad" : t.priority === "medium" ? "warn" : "neutral"} className="capitalize">
                    {t.priority}
                  </Badge>
                  <span className="w-28 text-sm text-ink-3">{t.assignee}</span>
                  <span className="w-24 text-right text-sm text-ink-3">Due {fmtDate(t.due).replace(", 2026", "")}</span>
                  <Badge tone={t.status === "done" ? "good" : t.status === "in_progress" ? "info" : "outline"}>{t.status === "in_progress" ? "In progress" : t.status === "done" ? "Done" : "To do"}</Badge>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

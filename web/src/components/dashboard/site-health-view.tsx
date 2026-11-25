"use client";

import { CheckCircle2, ChevronDown, Circle, ExternalLink } from "lucide-react";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricHelp } from "@/components/ui/metric-help";
import { Select } from "@/components/ui/select";
import { SeverityBadge } from "@/components/ui/status";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { SegmentedList, SegmentedTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";
import { setIssueStatus } from "@/app/app/[orgSlug]/actions";
import type { IssueStatus, SiteIssue, SitePage, SiteProperty } from "@/lib/ui/data-types";
import { cn } from "@/lib/ui/cn";
import { fmtDate, fmtDateTime } from "@/lib/ui/format";

const STATUS_OPTS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "ignored", label: "Ignored" },
  { value: "resolved", label: "Resolved" },
];

function ScoreRing({ score }: { score: number | null }) {
  if (score === null) return <span className="flex size-16 items-center justify-center rounded-full border-4 border-muted-bg text-xs text-ink-4">n/a</span>;
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

export function SiteHealthView({ orgId, properties, issues: initialIssues, pages }: { orgId: string; properties: SiteProperty[]; issues: SiteIssue[]; pages: SitePage[] }) {
  const router = useRouter();
  const [issues, setIssues] = useState(initialIssues);
  const [sev, setSev] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
                {p.pagesCrawled} pages · {p.lastAuditAt ? `last audit ${fmtDateTime(p.lastAuditAt)}` : "not audited yet"}
                {p.status ? <span className="ml-2 capitalize">· {p.status}</span> : null}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(["critical", "high", "medium", "low"] as const).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1">
                    <SeverityBadge severity={k} />
                    <span className="text-sm text-ink-2 tabular">{p.issues[k]}</span>
                  </span>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <Tabs defaultValue="issues">
          <div className="px-5 pt-3">
            <TabsList>
              <TabsTrigger value="issues">
                Issues <Badge tone="neutral">{issues.filter((i) => i.status !== "resolved").length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="pages">
                Pages <Badge tone="neutral">{pages.length}</Badge>
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="issues" className="pt-0">
            <div className="flex items-center gap-3 px-5 py-3">
              <Tabs value={sev} onValueChange={setSev}>
                <SegmentedList aria-label="Severity">
                  <SegmentedTrigger value="all">All</SegmentedTrigger>
                  <SegmentedTrigger value="critical">Critical</SegmentedTrigger>
                  <SegmentedTrigger value="high">High</SegmentedTrigger>
                  <SegmentedTrigger value="medium">Medium</SegmentedTrigger>
                  <SegmentedTrigger value="low">Low</SegmentedTrigger>
                </SegmentedList>
              </Tabs>
              {error ? <span className="text-sm text-bad" role="alert">{error}</span> : null}
            </div>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <Th className="w-[44%]">Issue</Th>
                    <Th>Severity</Th>
                    <Th>Category</Th>
                    <Th className="text-right">Pages</Th>
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
                              <span className="block font-mono text-2xs text-ink-4">{i.code}</span>
                            </span>
                          </button>
                        </Td>
                        <Td>
                          <SeverityBadge severity={i.severity} />
                        </Td>
                        <Td>{i.category ?? "—"}</Td>
                        <Td className="text-right font-semibold text-ink">{i.pages}</Td>
                        <Td>
                          <Select size="sm" aria-label={`Status of ${i.title}`} value={i.status} onValueChange={async (v) => {
                              const prev = i.status;
                              setIssues((l) => l.map((x) => (x.id === i.id ? { ...x, status: v as IssueStatus } : x)));
                              const r = await setIssueStatus(orgId, i.id, v as IssueStatus);
                              if (!r.ok) {
                                setError(r.error);
                                setIssues((l) => l.map((x) => (x.id === i.id ? { ...x, status: prev } : x)));
                              } else router.refresh();
                            }} options={STATUS_OPTS} />
                        </Td>
                      </Tr>
                      {expanded === i.id ? (
                        <tr className="bg-subtle/50">
                          <td colSpan={5} className="px-5 py-3 pl-12 text-sm text-ink-2">
                            <strong className="font-semibold text-ink">How to fix: </strong>
                            {i.howToFix ?? "No recommendation recorded."}
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
                    <Th className="text-right">Score</Th>
                    <Th>Last crawled</Th>
                  </tr>
                </THead>
                <TBody>
                  {pages.map((p) => (
                    <Tr key={p.url}>
                      <Td className="max-w-0">
                        <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate font-medium text-ink hover:text-accent">
                          <span className="truncate">{p.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                          <ExternalLink className="size-3 shrink-0 text-ink-4" aria-hidden="true" />
                        </a>
                      </Td>
                      <Td className="text-right">
                        {p.statusCode === null ? "—" : <Badge tone={p.statusCode === 200 ? "good" : p.statusCode >= 400 ? "bad" : "warn"}>{p.statusCode}</Badge>}
                      </Td>
                      <Td className="text-right">{p.issues}</Td>
                      <Td className="text-right">{p.words === null ? "—" : p.words.toLocaleString()}</Td>
                      <Td>{p.hasSchema === null ? "—" : p.hasSchema ? <span className="inline-flex items-center gap-1 text-good"><CheckCircle2 className="size-4" aria-hidden="true" /> Yes</span> : <span className="inline-flex items-center gap-1 text-ink-4"><Circle className="size-4" aria-hidden="true" /> No</span>}</Td>
                      <Td className="text-right">{p.score ?? "—"}</Td>
                      <Td>{p.lastCrawled ? fmtDate(p.lastCrawled) : "—"}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

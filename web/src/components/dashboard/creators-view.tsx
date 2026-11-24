"use client";

import { Clapperboard, Music2 } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricHelp } from "@/components/ui/metric-help";
import { Select } from "@/components/ui/select";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { SegmentedList, SegmentedTrigger, Tabs } from "@/components/ui/tabs";
import type { Creator } from "@/lib/ui/data-types";
import { fmtDate, fmtNumber } from "@/lib/ui/format";

const STATUS = [
  { value: "new", label: "New" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "contacted", label: "Contacted" },
  { value: "partner", label: "Partner" },
];

export function CreatorsView({ creators: initial }: { creators: Creator[] }) {
  const [creators, setCreators] = useState(initial);
  const [platform, setPlatform] = useState("all");
  const list = creators.filter((c) => platform === "all" || c.platform === platform);
  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <Tabs value={platform} onValueChange={setPlatform}>
          <SegmentedList aria-label="Platform">
            <SegmentedTrigger value="all">All platforms</SegmentedTrigger>
            <SegmentedTrigger value="youtube">
              <Clapperboard /> YouTube
            </SegmentedTrigger>
            <SegmentedTrigger value="tiktok">
              <Music2 /> TikTok
            </SegmentedTrigger>
          </SegmentedList>
        </Tabs>
        <span className="ml-auto text-sm text-ink-3">Creators whose videos AI engines cite for your topics</span>
      </div>
      {list.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={Clapperboard} title="No creators found yet" description="Creator discovery runs weekly once YouTube Data API access is connected in onboarding." />
        </div>
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <Th>Creator</Th>
                <Th>Platform</Th>
                <Th className="text-right">
                  <span className="inline-flex items-center gap-1">Reach <MetricHelp id="creatorReach" /></span>
                </Th>
                <Th className="text-right">Avg. views</Th>
                <Th className="text-right">
                  <span className="inline-flex items-center gap-1">Relevance <MetricHelp id="creatorRelevance" /></span>
                </Th>
                <Th>Topics</Th>
                <Th>Mentions</Th>
                <Th>Last post</Th>
                <Th className="w-36">Status</Th>
              </tr>
            </THead>
            <TBody>
              {list.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={c.name} size={28} />
                      <span>
                        <span className="block font-medium text-ink">{c.name}</span>
                        <span className="block text-xs text-ink-4">{c.handle}</span>
                      </span>
                    </span>
                  </Td>
                  <Td>{c.platform === "youtube" ? "YouTube" : "TikTok"}</Td>
                  <Td className="text-right font-semibold text-ink">{fmtNumber(c.followers)}</Td>
                  <Td className="text-right">{fmtNumber(c.avgViews)}</Td>
                  <Td className="text-right">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-12 rounded-full bg-subtle">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${c.relevance}%` }} />
                      </span>
                      <span className="w-6 text-ink tabular">{c.relevance}</span>
                    </span>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {c.topics.map((t) => (
                        <Badge key={t} tone="outline">{t}</Badge>
                      ))}
                    </span>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {c.mentionsBrand ? <Badge tone="accent">You</Badge> : null}
                      {c.mentionsCompetitors.map((m) => (
                        <Badge key={m} tone="warn">{m}</Badge>
                      ))}
                      {!c.mentionsBrand && !c.mentionsCompetitors.length ? <span className="text-ink-4">—</span> : null}
                    </span>
                  </Td>
                  <Td>{c.lastPost ? fmtDate(c.lastPost) : "—"}</Td>
                  <Td>
                    <Select size="sm" aria-label={`Status for ${c.name}`} value={c.status} onValueChange={(v) => setCreators((l) => l.map((x) => (x.id === c.id ? { ...x, status: v as Creator["status"] } : x)))} options={STATUS} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </Card>
  );
}

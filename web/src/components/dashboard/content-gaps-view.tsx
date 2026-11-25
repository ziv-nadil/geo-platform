"use client";

import { Check, RefreshCw, Send, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { MetricHelp } from "@/components/ui/metric-help";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildJsonLd } from "@/lib/content-gaps/jsonld";
import { renderHtml, type ListicleDoc } from "@/lib/content-gaps/listicle";
import type { GapRow, ListicleRow } from "@/lib/server/queries/content-gaps";
import { detectGaps, dismissGap, generateForGap, publishToClientSite, saveDraft, transition } from "@/app/app/[orgSlug]/content-gaps/actions";

const TONE: Record<string, "neutral" | "info" | "warn" | "good"> = { draft: "info", in_review: "warn", approved: "info", published: "good" };
const LABEL: Record<string, string> = { draft: "Draft", in_review: "In review", approved: "Approved", published: "Draft sent to your site" };

type Msg = { ok: boolean; text: string } | null;

export function ContentGapsView({ orgId, role, gaps, items }: { orgId: string; role: string | null; gaps: GapRow[]; items: ListicleRow[] }) {
  const isAdmin = role === "admin" || role === "owner";
  const canWrite = isAdmin || role === "member";
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string, after?: (r: never) => void) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.ok ? okText : (r as { error: string }).error });
      if (r.ok) after?.(r as never);
    });
  const open = items.find((i) => i.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-good" : "text-sm text-bad"}>{msg.text}</p> : null}
      <Card>
        <CardHeader
          title="Gaps, ranked"
          help={<MetricHelp id="gapScore" />}
          actions={canWrite ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => detectGaps(orgId), "Gaps refreshed.")}><RefreshCw /> Detect gaps</Button> : undefined}
        />
        <CardBody className="p-0">
          <TableWrap>
            <Table>
              <THead>
                <Tr>
                  <Th>Gap (topic · persona · funnel)</Th>
                  <Th className="text-right">Score <MetricHelp id="gapScore" /></Th>
                  <Th className="text-right">Importance <MetricHelp id="gapImportance" /></Th>
                  <Th className="text-right">Competitor presence <MetricHelp id="gapPresence" /></Th>
                  <Th className="text-right">Authority <MetricHelp id="gapAuthority" /></Th>
                  <Th>Competitors</Th>
                  <Th />
                </Tr>
              </THead>
              <TBody>
                {gaps.length === 0 ? (
                  <Tr><Td colSpan={7} className="py-8 text-center text-ink-3">No gaps yet. Run prompts, then press Detect gaps.</Td></Tr>
                ) : gaps.map((g) => (
                  <Tr key={g.id}>
                    <Td>
                      <div className="font-medium text-ink">{g.label}</div>
                      <div className="text-xs text-ink-3">{g.promptCount} prompts · e.g. “{g.samplePrompts[0]}”</div>
                    </Td>
                    <Td className="tabular text-right font-semibold">{g.score.toFixed(2)}</Td>
                    <Td className="tabular text-right">{g.parts.importance?.toFixed(1)}</Td>
                    <Td className="tabular text-right">{g.parts.presence?.toFixed(2)}</Td>
                    <Td className="tabular text-right">{g.parts.authority?.toFixed(2)}</Td>
                    <Td className="text-sm text-ink-3">{g.competitors.slice(0, 3).map((c) => c.name).join(", ") || "-"}</Td>
                    <Td className="whitespace-nowrap text-right">
                      {g.itemId ? <Button size="sm" variant="subtle" onClick={() => setOpenId(g.itemId)}>Open draft</Button> : canWrite ? (
                        <Button size="sm" loading={pending} onClick={() => run(() => generateForGap(orgId, g.id), "Draft created.", (r: { data?: { itemId: string } }) => setOpenId(r.data?.itemId ?? null))}><Sparkles /> Generate listicle</Button>
                      ) : null}
                      {canWrite ? <Button size="sm" variant="ghost" onClick={() => run(() => dismissGap(orgId, g.id), "Gap dismissed.")}>Dismiss</Button> : null}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </CardBody>
      </Card>

      {items.length > 0 ? (
        <Card>
          <CardHeader title="Listicles" />
          <CardBody className="flex flex-col gap-2">
            {items.map((i) => (
              <button key={i.id} type="button" onClick={() => setOpenId(i.id)} className="flex items-center justify-between gap-3 rounded-sm border border-line px-3 py-2 text-left hover:border-line-strong">
                <span className="text-sm font-medium text-ink">{i.title}</span>
                <Badge tone={TONE[i.status] ?? "neutral"}>{LABEL[i.status] ?? i.status}</Badge>
              </button>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {open ? <Editor key={open.id + open.updatedAt} orgId={orgId} item={open} isAdmin={isAdmin} canWrite={canWrite} pending={pending} run={run} /> : null}
    </div>
  );
}

function Editor({ orgId, item, isAdmin, canWrite, pending, run }: {
  orgId: string; item: ListicleRow; isAdmin: boolean; canWrite: boolean; pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void;
}) {
  const [doc, setDoc] = useState<ListicleDoc | null>(item.doc);
  if (!doc) return null;
  const editable = canWrite && (item.status === "draft" || item.status === "in_review");
  const patch = (p: Partial<ListicleDoc>) => setDoc({ ...doc, ...p });
  const ld = buildJsonLd(doc, null);
  return (
    <Card>
      <CardHeader title={doc.title} actions={<Badge tone={TONE[item.status] ?? "neutral"}>{LABEL[item.status] ?? item.status}</Badge>} />
      <CardBody className="flex flex-col gap-4">
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="schema">JSON-LD</TabsTrigger>
          </TabsList>
          <TabsContent value="edit" className="flex flex-col gap-4 pt-4">
            <Field label="Title"><Input value={doc.title} disabled={!editable} onChange={(e) => patch({ title: e.target.value })} /></Field>
            <Field label="Meta description"><Input value={doc.metaDescription} disabled={!editable} onChange={(e) => patch({ metaDescription: e.target.value })} /></Field>
            <Field label="Intro"><Textarea rows={3} value={doc.intro} disabled={!editable} onChange={(e) => patch({ intro: e.target.value })} /></Field>
            {doc.items.map((it, n) => (
              <div key={n} className="flex flex-col gap-2 rounded-sm border border-line p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-ink">{n + 1}. {it.name} {it.isClient ? <Badge tone="accent">You</Badge> : null}</div>
                <Textarea rows={3} aria-label={`${it.name} summary`} value={it.summary} disabled={!editable}
                  onChange={(e) => patch({ items: doc.items.map((x, j) => (j === n ? { ...x, summary: e.target.value } : x)) })} />
                <Input aria-label={`${it.name} best for`} value={it.bestFor} disabled={!editable}
                  onChange={(e) => patch({ items: doc.items.map((x, j) => (j === n ? { ...x, bestFor: e.target.value } : x)) })} />
              </div>
            ))}
            {doc.faq.map((q, n) => (
              <div key={n} className="flex flex-col gap-2 rounded-sm border border-line p-3">
                <Input aria-label="Question" value={q.question} disabled={!editable} onChange={(e) => patch({ faq: doc.faq.map((x, j) => (j === n ? { ...x, question: e.target.value } : x)) })} />
                <Textarea aria-label="Answer" rows={2} value={q.answer} disabled={!editable} onChange={(e) => patch({ faq: doc.faq.map((x, j) => (j === n ? { ...x, answer: e.target.value } : x)) })} />
              </div>
            ))}
          </TabsContent>
          <TabsContent value="preview" className="pt-4">
            <article className="prose-sm max-w-none text-ink-2" dangerouslySetInnerHTML={{ __html: `<h1 style="font-size:20px;font-weight:600">${doc.title.replace(/</g, "&lt;")}</h1>${renderHtml(doc)}` }} />
          </TabsContent>
          <TabsContent value="schema" className="pt-4">
            <pre className="max-h-96 overflow-auto rounded-sm bg-subtle p-3 font-mono text-2xs text-ink-2">{JSON.stringify(ld, null, 2)}</pre>
          </TabsContent>
        </Tabs>
        {item.publishError ? <p role="alert" className="text-sm text-bad">Last delivery failed: {item.publishError}</p> : null}
        {item.postUrl ? <p className="text-sm text-ink-2">Draft in your site: <a className="text-accent underline" href={item.postUrl} target="_blank" rel="noreferrer noopener">{item.postUrl}</a>. Publish it from there when you&apos;re happy.</p> : null}
        <div className="flex flex-wrap gap-2">
          {editable ? <Button variant="secondary" loading={pending} onClick={() => run(() => saveDraft(orgId, item.id, doc), "Saved.")}>Save</Button> : null}
          {item.status === "draft" && canWrite ? <Button loading={pending} onClick={() => run(() => transition(orgId, item.id, "submit"), "Submitted for review.")}>Submit for review</Button> : null}
          {item.status === "in_review" && isAdmin ? <Button loading={pending} onClick={() => run(() => transition(orgId, item.id, "approve"), "Approved.")}><Check /> Approve</Button> : null}
          {(item.status === "in_review" || item.status === "approved") && isAdmin ? <Button variant="ghost" loading={pending} onClick={() => run(() => transition(orgId, item.id, "reject"), "Sent back to draft.")}>Send back</Button> : null}
          {item.status === "approved" && isAdmin ? <Button loading={pending} onClick={() => run(() => publishToClientSite(orgId, item.id), "Draft created in your site.")}><Send /> Send to my site as draft</Button> : null}
          {item.status === "in_review" && !isAdmin ? <span className="self-center text-sm text-ink-3">Waiting for an admin to approve.</span> : null}
        </div>
      </CardBody>
    </Card>
  );
}

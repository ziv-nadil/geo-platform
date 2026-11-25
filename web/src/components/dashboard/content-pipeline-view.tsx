"use client";
/* eslint-disable @next/next/no-img-element -- signed Storage URLs, not optimizable by next/image */

import { Check, FileText, Send, Sparkles, Wand2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { MetricHelp } from "@/components/ui/metric-help";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { articleWordCount, renderArticleHtml, type ArticleDoc, type AssetMap } from "@/lib/content/article";
import type { ArticleRow, PipelineData, SuggestionRow } from "@/lib/server/queries/content-pipeline";
import { transition } from "@/app/app/[orgSlug]/content-gaps/actions";
import { createFromSuggestion, dismissSuggestion, runPlannerNow, saveArticle, saveContentSettings, sendArticleToSite } from "@/app/app/[orgSlug]/content-gaps/pipeline-actions";

const TONE: Record<string, "neutral" | "info" | "warn" | "good"> = { draft: "info", in_review: "warn", approved: "info", published: "good" };
const LABEL: Record<string, string> = { draft: "Draft", in_review: "In review", approved: "Approved", published: "Draft sent to your site" };
type Msg = { ok: boolean; text: string } | null;

export function ContentPipelineView({ orgId, role, data }: { orgId: string; role: string | null; data: PipelineData }) {
  const isAdmin = role === "admin" || role === "owner";
  const canWrite = isAdmin || role === "member";
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [words, setWords] = useState(String(data.settings.defaultWords));
  const [s, setS] = useState({ mode: data.settings.mode as string, defaultWords: String(data.settings.defaultWords), cadence: data.settings.cadence as string, maxPerRun: String(data.settings.maxPerRun) });
  const run = <T extends { ok: boolean }>(fn: () => Promise<T>, okText: string, after?: (r: T) => void) =>
    start(async () => { const r = await fn(); setMsg({ ok: r.ok, text: r.ok ? okText : (r as unknown as { error: string }).error }); if (r.ok) after?.(r); });
  const sel = data.suggestions.find((x) => x.id === selId) ?? null;
  const open = data.articles.find((a) => a.id === openId) ?? null;
  const groups = [...data.suggestions.reduce((m, x) => m.set(x.gapId, [...(m.get(x.gapId) ?? []), x]), new Map<string, SuggestionRow[]>()).values()];
  const missing = [!data.keys.anthropic && "ANTHROPIC_API_KEY", !data.keys.bria && "BRIA_API_KEY (images)", !data.keys.dataforseo && "DATAFORSEO_LOGIN/PASSWORD (organic SERP research)"].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-6">
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-good" : "text-sm text-bad"}>{msg.text}</p> : null}
      {missing.length ? <p className="text-sm text-ink-3">Not configured on this server: {missing.join(", ")}. Those steps return “not configured” instead of fake output.</p> : null}

      <Card>
        <CardHeader title="Pipeline settings" description="Applies to the daily planner run and to every article you create." />
        <CardBody className="grid gap-4 sm:grid-cols-4">
          <Field label={<span className="inline-flex items-center gap-1">Mode <MetricHelp id="contentMode" /></span>}>
            <Select aria-label="Mode" value={s.mode} onValueChange={(v) => setS({ ...s, mode: v })} options={[{ value: "approve", label: "Approve (you pick and approve)" }, { value: "auto", label: "Auto (deliver CMS drafts)" }]} />
          </Field>
          <Field label={<span className="inline-flex items-center gap-1">Default length <MetricHelp id="contentWords" /></span>}>
            <Input type="number" min={600} max={5000} step={100} value={s.defaultWords} onChange={(e) => setS({ ...s, defaultWords: e.target.value })} />
          </Field>
          <Field label={<span className="inline-flex items-center gap-1">Planner <MetricHelp id="contentCadence" /></span>}>
            <Select aria-label="Planner cadence" value={s.cadence} onValueChange={(v) => setS({ ...s, cadence: v })} options={[{ value: "off", label: "Off" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }]} />
          </Field>
          <Field label="Articles per run (auto)">
            <Input type="number" min={1} max={10} value={s.maxPerRun} onChange={(e) => setS({ ...s, maxPerRun: e.target.value })} />
          </Field>
          <div className="sm:col-span-4 flex items-center gap-3">
            {isAdmin ? <Button variant="secondary" loading={pending} onClick={() => run(() => saveContentSettings(orgId, { mode: s.mode, defaultWords: Number(s.defaultWords), cadence: s.cadence, maxPerRun: Number(s.maxPerRun) }), "Settings saved.")}>Save settings</Button> : <span className="text-sm text-ink-3">Only admins can change these.</span>}
            {s.mode === "auto" ? <span className="text-sm text-ink-3">Auto mode never publishes live: it creates a draft in your CMS or a draft pull request.</span> : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Suggested titles" description="Pick one title per gap. The planner explains why each one should win citations."
          actions={canWrite ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => runPlannerNow(orgId), "New titles planned.")}><Wand2 /> Plan titles</Button> : undefined} />
        <CardBody className="flex flex-col gap-5">
          {groups.length === 0 ? <p className="py-4 text-center text-ink-3">No suggestions yet. Detect gaps on the other tab, then press Plan titles.</p> : groups.map((g) => (
            <div key={g[0].gapId} className="flex flex-col gap-2">
              <div className="text-sm font-medium text-ink">{g[0].gapLabel} {g[0].promptText ? <span className="font-normal text-ink-3">· “{g[0].promptText}”</span> : null}</div>
              {g.map((x) => (
                <label key={x.id} className={`flex cursor-pointer gap-3 rounded-sm border p-3 ${selId === x.id ? "border-accent bg-subtle" : "border-line"}`}>
                  <input type="radio" name="title" className="mt-1" checked={selId === x.id} onChange={() => setSelId(x.id)} />
                  <span className="flex-1">
                    <span className="block font-medium text-ink">{x.title}</span>
                    <span className="block text-sm text-ink-2">{x.rationale}</span>
                    {x.angle ? <Badge tone="outline" className="mt-1">{x.angle}</Badge> : null}
                  </span>
                  {canWrite ? <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); run(() => dismissSuggestion(orgId, x.id), "Dismissed."); }}>Dismiss</Button> : null}
                </label>
              ))}
            </div>
          ))}
          {sel && canWrite ? (
            <div className="flex flex-wrap items-end gap-3 rounded-sm border border-line p-3">
              <div className="min-w-48 flex-1 text-sm"><span className="text-ink-3">Selected:</span> <span className="font-medium text-ink">{sel.title}</span></div>
              <Field label={<span className="inline-flex items-center gap-1">Length (words) <MetricHelp id="contentWords" /></span>} className="w-40">
                <Input type="number" min={600} max={5000} step={100} value={words} onChange={(e) => setWords(e.target.value)} />
              </Field>
              <Tooltip content="Researches what AI engines cite and the top Google results, writes the brief, drafts the article, then builds images and charts. Takes a few minutes.">
                <Button loading={pending} onClick={() => run(() => createFromSuggestion(orgId, sel.id, Number(words)), "Article created.", (r) => { setOpenId((r as { data?: { itemId: string } }).data?.itemId ?? null); setSelId(null); })}><Sparkles /> Create</Button>
              </Tooltip>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {data.articles.length > 0 ? (
        <Card>
          <CardHeader title="Articles" />
          <CardBody className="flex flex-col gap-2">
            {data.articles.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line p-3">
                <div>
                  <div className="font-medium text-ink">{a.title}</div>
                  <div className="text-xs text-ink-3">{a.words ?? 0} words{a.targetWords ? ` (target ${a.targetWords})` : ""}{a.autoCreated ? " · created automatically" : ""}</div>
                </div>
                <div className="flex items-center gap-2"><Badge tone={TONE[a.status] ?? "neutral"}>{LABEL[a.status] ?? a.status}</Badge><Button size="sm" variant="subtle" onClick={() => setOpenId(a.id)}><FileText /> Open</Button></div>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {open ? <Editor key={open.id} orgId={orgId} item={open} isAdmin={isAdmin} canWrite={canWrite} pending={pending} run={run} /> : null}
    </div>
  );
}

function Editor({ orgId, item, isAdmin, canWrite, pending, run }: { orgId: string; item: ArticleRow; isAdmin: boolean; canWrite: boolean; pending: boolean; run: <T extends { ok: boolean }>(fn: () => Promise<T>, okText: string, after?: (r: T) => void) => void }) {
  const [doc, setDoc] = useState<ArticleDoc | null>(item.doc);
  if (!doc) return null;
  const editable = canWrite && (item.status === "draft" || item.status === "in_review");
  const patch = (p: Partial<ArticleDoc>) => setDoc({ ...doc, ...p });
  const assets: AssetMap = {};
  for (const im of item.images) if (im.url) assets[im.id] = { url: im.url, alt: im.alt };
  const r = item.research;
  return (
    <Card>
      <CardHeader title={doc.title} description={`${articleWordCount(doc)} words`} actions={<Badge tone={TONE[item.status] ?? "neutral"}>{LABEL[item.status] ?? item.status}</Badge>} />
      <CardBody className="flex flex-col gap-4">
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="research">Research and brief</TabsTrigger>
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="schema">JSON-LD</TabsTrigger>
          </TabsList>
          <TabsContent value="edit" className="flex flex-col gap-4 pt-4">
            <Field label="Title"><Input value={doc.title} disabled={!editable} onChange={(e) => patch({ title: e.target.value })} /></Field>
            <Field label="Meta description"><Input value={doc.metaDescription} disabled={!editable} onChange={(e) => patch({ metaDescription: e.target.value })} /></Field>
            <Field label="Direct answer (shown first)"><Textarea rows={3} value={doc.directAnswer} disabled={!editable} onChange={(e) => patch({ directAnswer: e.target.value })} /></Field>
            {doc.sections.map((sec, n) => (
              <div key={n} className="flex flex-col gap-2 rounded-sm border border-line p-3">
                <Input aria-label="Section heading" value={sec.heading} disabled={!editable} onChange={(e) => patch({ sections: doc.sections.map((x, j) => (j === n ? { ...x, heading: e.target.value } : x)) })} />
                <Textarea aria-label={`${sec.heading} text`} rows={7} value={sec.body} disabled={!editable} onChange={(e) => patch({ sections: doc.sections.map((x, j) => (j === n ? { ...x, body: e.target.value } : x)) })} />
                {sec.table ? <p className="text-xs text-ink-3">Table: {sec.table.caption || sec.table.columns.join(", ")} ({sec.table.rows.length} rows)</p> : null}
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
            <article className="prose-sm max-w-none text-ink-2" dangerouslySetInnerHTML={{ __html: `<h1 style="font-size:20px;font-weight:600">${doc.title.replace(/</g, "&lt;")}</h1>${renderArticleHtml(doc, assets)}` }} />
          </TabsContent>
          <TabsContent value="research" className="flex flex-col gap-3 pt-4 text-sm text-ink-2">
            {r ? (
              <>
                <p className="flex items-center gap-1 font-medium text-ink">Benchmarks <MetricHelp id="researchBenchmarks" /></p>
                <p>{String(r.summary.analysed ?? 0)} of {String(r.summary.attempted ?? 0)} pages analysed. Median {String(r.summary.medianWords ?? 0)} words, {String(r.summary.pctTables ?? 0)}% with tables, {String(r.summary.pctFaq ?? 0)}% with FAQ, {String(r.summary.pctSchema ?? 0)}% with schema{r.summary.medianAgeDays != null ? `, median age ${String(r.summary.medianAgeDays)} days` : ""}.</p>
                {r.notes.map((n) => <p key={n} className="text-ink-3">{n}</p>)}
                <ul className="list-disc pl-5">{r.sources.map((x) => <li key={x.url}><a className="text-accent underline" href={x.url} target="_blank" rel="noreferrer noopener">{x.url}</a> <span className="text-ink-3">({x.kind === "cited" ? "cited by AI" : "top organic"}{x.words ? `, ${x.words} words` : ""})</span></li>)}</ul>
              </>
            ) : <p className="text-ink-3">No research stored for this article.</p>}
            {item.brief ? (
              <>
                <p className="font-medium text-ink">How we beat them</p>
                <ul className="list-disc pl-5">{(item.brief.how_we_beat_them ?? []).map((x) => <li key={x}>{x}</li>)}</ul>
                {(item.brief.competitor_weaknesses ?? []).length ? <><p className="font-medium text-ink">Where the competing pages are weak</p><ul className="list-disc pl-5">{item.brief.competitor_weaknesses!.map((x) => <li key={x}>{x}</li>)}</ul></> : null}
              </>
            ) : null}
            {item.lint ? <p className="text-ink-3">Style cleanup applied: {Object.entries(item.lint).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing needed"}.</p> : null}
          </TabsContent>
          <TabsContent value="images" className="pt-4">
            {item.images.length === 0 ? <p className="text-sm text-ink-3">No images yet.{item.notes.length ? ` ${item.notes.join(" ")}` : ""}</p> : (
              <div className="grid gap-3 sm:grid-cols-2">{item.images.map((im) => (
                <figure key={im.id} className="rounded-sm border border-line p-2">
                  {im.url ? <img src={im.url} alt={im.alt} className="w-full rounded-xs" /> : null}
                  <figcaption className="mt-1 text-xs text-ink-3"><span className="font-medium text-ink-2">{im.kind}</span> · alt: {im.alt}</figcaption>
                </figure>
              ))}</div>
            )}
            {item.images.length > 0 && item.notes.length ? <p className="mt-2 text-xs text-ink-3">{item.notes.join(" ")}</p> : null}
          </TabsContent>
          <TabsContent value="schema" className="pt-4">
            <p className="mb-2 text-xs text-ink-3">Article, FAQPage and ItemList (when the article lists things) are generated from the saved text and added to the draft you send.</p>
            <pre className="max-h-96 overflow-auto rounded-sm bg-subtle p-3 font-mono text-2xs text-ink-2">{JSON.stringify({ faq: doc.faq.length, itemList: doc.itemList?.items.length ?? 0, charts: doc.charts.map((c) => c.id), citations: doc.citations.length }, null, 2)}</pre>
          </TabsContent>
        </Tabs>
        {item.publishError ? <p role="alert" className="text-sm text-bad">Last delivery failed: {item.publishError}</p> : null}
        {item.postUrl ? <p className="text-sm text-ink-2">Draft in your site: <a className="text-accent underline" href={item.postUrl} target="_blank" rel="noreferrer noopener">{item.postUrl}</a>. Publish it from there when you&apos;re happy.</p> : null}
        <div className="flex flex-wrap gap-2">
          {editable ? <Button variant="secondary" loading={pending} onClick={() => run(() => saveArticle(orgId, item.id, doc), "Saved.")}>Save</Button> : null}
          {item.status === "draft" && canWrite ? <Button loading={pending} onClick={() => run(() => transition(orgId, item.id, "submit"), "Submitted for review.")}>Submit for review</Button> : null}
          {item.status === "in_review" && isAdmin ? <Button loading={pending} onClick={() => run(() => transition(orgId, item.id, "approve"), "Approved.")}><Check /> Approve</Button> : null}
          {(item.status === "in_review" || item.status === "approved") && isAdmin ? <Button variant="ghost" loading={pending} onClick={() => run(() => transition(orgId, item.id, "reject"), "Sent back to draft.")}>Send back</Button> : null}
          {item.status === "approved" && isAdmin ? (
            <Tooltip content="Uploads the images and creates a draft post (WordPress, Ghost, Sanity, Webflow) or a draft GitHub pull request. Nothing goes live."><Button loading={pending} onClick={() => run(() => sendArticleToSite(orgId, item.id), "Draft created in your site.")}><Send /> Send to blog as draft</Button></Tooltip>
          ) : null}
          {item.status === "in_review" && !isAdmin ? <span className="self-center text-sm text-ink-3">Waiting for an admin to approve.</span> : null}
        </div>
      </CardBody>
    </Card>
  );
}

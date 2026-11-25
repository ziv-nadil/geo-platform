"use client";

import { Check, ExternalLink, Play, Send, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { approveTitle, createSlackBot, postToSlack, rejectTitle, runPulseNow, savePulseSettings } from "@/app/app/[orgSlug]/social-pulse/actions";
import type { SocialPulseData } from "@/lib/server/queries/social-pulse";

const TONE: Record<string, BadgeTone> = { positive: "good", negative: "bad", mixed: "warn", neutral: "neutral" };
const STATUS: Record<string, string> = { suggested: "", approved: "Creating…", created: "Article drafted", rejected: "Rejected", failed: "Failed" };
type Msg = { ok: boolean; text: string } | null;

export function SocialPulseView({ orgId, role, data }: { orgId: string; role: string | null; data: SocialPulseData }) {
  const isAdmin = role === "admin" || role === "owner";
  const canWrite = isAdmin || role === "member";
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const st = data.settings;
  const [f, setF] = useState({ enabled: st.enabled, platforms: st.platforms, keywords: st.keywords.join(", "), maxItems: String(st.maxItems), maxRuns: String(st.maxRuns), budget: String(st.budgetUsd), channel: st.channel ?? "" });
  const run = <T extends { ok: boolean }>(fn: () => Promise<T>, okText: (r: T) => string) =>
    start(async () => { const r = await fn(); setMsg({ ok: r.ok, text: r.ok ? okText(r) : (r as unknown as { error: string }).error }); });
  const missing = [!data.keys.apify && "APIFY_TOKEN", !data.keys.anthropic && "ANTHROPIC_API_KEY"].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-6">
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-good" : "text-sm text-bad"}>{msg.text}</p> : null}
      {data.killSwitch ? <p role="alert" className="text-sm text-bad">The global kill switch (SOCIAL_PULSE_DISABLED) is on: nothing runs and nothing posts.</p> : null}
      {missing.length ? <p className="text-sm text-ink-3">Not configured on this server: {missing.join(", ")}. Runs return “not configured” instead of fake output.</p> : null}

      <Card>
        <CardHeader title="Today's insights" description={`Public posts from the last 24 hours. This month's Apify spend: $${data.monthSpentUsd.toFixed(2)} of $${st.budgetUsd.toFixed(2)}.`}
          actions={<div className="flex gap-2">
            {isAdmin ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => runPulseNow(orgId), (r) => { const d = (r as { data?: { insights: number; items: number; costUsd: number } }).data; return `Found ${d?.insights ?? 0} insights from ${d?.items ?? 0} posts (Apify cost $${(d?.costUsd ?? 0).toFixed(3)}).`; })}><Play /> Run now</Button> : null}
            {canWrite ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => postToSlack(orgId), (r) => (r as { data?: { message: string } }).data?.message ?? "Posted.")}><Send /> Post to Slack</Button> : null}
          </div>} />
        <CardBody className="flex flex-col gap-5">
          {data.insights.length === 0 ? <p className="py-4 text-center text-ink-3">No insights yet. Turn Social pulse on below; it runs once a day, or press Run now.</p> : data.insights.map((i) => (
            <div key={i.id} className="flex flex-col gap-3 rounded-sm border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-ink">{i.title}</h3>
                <Badge tone={TONE[i.sentiment] ?? "neutral"}>{i.sentiment}</Badge>
                {i.platforms.map((p) => <Badge key={p} tone="outline">{p}</Badge>)}
                {i.postedToSlack ? <Badge tone="info">In Slack</Badge> : null}
              </div>
              <p className="text-sm text-ink-2">{i.summary}</p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {i.sources.map((s) => <li key={s.url}><a className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.platform}: {s.title.slice(0, 60)} <ExternalLink className="size-3" aria-hidden /></a></li>)}
              </ul>
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Content titles</div>
                {i.titles.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-60 flex-1">
                      <div className="text-sm font-medium text-ink">{t.title}</div>
                      <div className="text-xs text-ink-3">{t.rationale}{t.promptText ? ` · prompt: “${t.promptText}”` : ""}</div>
                      {t.error ? <div className="text-xs text-bad">{t.error}</div> : null}
                    </div>
                    {t.status === "suggested" ? (canWrite ? (
                      <div className="flex gap-2">
                        <Button size="sm" loading={pending} onClick={() => run(() => approveTitle(orgId, t.id), () => "Approved. The article draft is ready in Content.")}><Check /> Approve</Button>
                        <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => rejectTitle(orgId, t.id), () => "Rejected.")}><X /> Reject</Button>
                      </div>
                    ) : null) : (
                      <div className="flex items-center gap-2">
                        <Badge tone={t.status === "created" ? "good" : t.status === "failed" ? "bad" : "neutral"}>{STATUS[t.status] ?? t.status}{t.decidedVia === "slack" ? " (Slack)" : ""}</Badge>
                        {t.itemId ? <Link className="text-xs text-accent hover:underline" href="content">Open draft</Link> : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Settings" description={`Sources: ${data.actors.map((a) => `${a.label} (${a.id})`).join(", ")}. Public data only; Beacon never logs in to social accounts.`} />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" checked={f.enabled} disabled={!isAdmin} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Run daily</label>
          <fieldset className="flex gap-4 text-sm sm:col-span-3" disabled={!isAdmin}>
            {data.actors.map((a) => <label key={a.platform} className="flex items-center gap-1"><input type="checkbox" checked={f.platforms.includes(a.platform)} onChange={(e) => setF({ ...f, platforms: e.target.checked ? [...f.platforms, a.platform] : f.platforms.filter((p) => p !== a.platform) })} /> {a.label}</label>)}
          </fieldset>
          <Field label="Extra keywords (comma separated)" className="sm:col-span-3"><Textarea rows={2} value={f.keywords} disabled={!isAdmin} onChange={(e) => setF({ ...f, keywords: e.target.value })} /></Field>
          <Field label="Max items per platform"><Input type="number" min={5} max={100} value={f.maxItems} disabled={!isAdmin} onChange={(e) => setF({ ...f, maxItems: e.target.value })} /></Field>
          <Field label="Max Apify runs per day"><Input type="number" min={1} max={10} value={f.maxRuns} disabled={!isAdmin} onChange={(e) => setF({ ...f, maxRuns: e.target.value })} /></Field>
          <Field label="Monthly budget (USD)"><Input type="number" min={0} max={1000} step={1} value={f.budget} disabled={!isAdmin} onChange={(e) => setF({ ...f, budget: e.target.value })} /></Field>
          <Field label="Slack channel" className="sm:col-span-3"><Input placeholder="geo-social-pulse" value={f.channel} disabled={!isAdmin} onChange={(e) => setF({ ...f, channel: e.target.value })} /></Field>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            {isAdmin ? <>
              <Button variant="secondary" loading={pending} onClick={() => run(() => savePulseSettings(orgId, { enabled: f.enabled, platforms: f.platforms, keywords: f.keywords, maxItems: Number(f.maxItems), maxRuns: Number(f.maxRuns), budgetUsd: Number(f.budget), channel: f.channel }), () => "Settings saved.")}>Save settings</Button>
              <Button variant="secondary" loading={pending} onClick={() => run(() => createSlackBot(orgId), (r) => { const d = (r as { data?: { installUrl: string | null } }).data; return `Slack app created. Install it to your workspace${d?.installUrl ? `: ${d.installUrl}` : ""}, then paste its bot token in the onboarding Slack step.`; })}>{st.slackAppId ? "Recreate Slack bot" : "Create Slack bot"}</Button>
            </> : <span className="text-sm text-ink-3">Only admins can change these.</span>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

"use client";

import { AlertTriangle, Check, Clapperboard, ExternalLink, Plus, Save, X } from "lucide-react";
import { useState, useTransition } from "react";
import { approve, draftVideo, reject, saveVideo, saveYoutubeSettings } from "@/app/app/[orgSlug]/youtube/actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { chapterLines, type VideoMetadata } from "@/lib/youtube/metadata";
import { estimateSeconds, type VideoScript } from "@/lib/youtube/script";

export interface YtChannel { status: "not_connected" | "connected" | "reauth_needed"; title: string | null; personaName: string; personaBlurb: string; mode: string; privacy: string; dailyLimit: number; lastError: string | null }
export interface YtVideo { id: string; status: string; articleTitle: string; script: VideoScript; meta: VideoMetadata; lint: string[]; youtubeId: string | null; privacyStatus: string | null; error: string | null; durationSec: number | null; createdAt: string; previewUrl: string | null }

const TONE: Record<string, BadgeTone> = { draft: "info", approved: "accent", assets_ready: "accent", rendering: "warn", rendered: "accent", uploading: "warn", uploaded: "good", failed: "bad", rejected: "neutral" };
const LABEL: Record<string, string> = { draft: "Needs review", approved: "Approved, making voice and images", assets_ready: "Waiting for render", rendering: "Rendering", rendered: "Ready to upload", uploading: "Uploading", uploaded: "Uploaded", failed: "Failed", rejected: "Rejected" };
const FLASH: Record<string, string> = { connected: "Channel connected. Uploads are now hands-free.", cancelled: "Connection cancelled.", denied: "Only an admin can connect the channel.", no_vault: "The secrets vault is not set up for this account yet.", no_channel: "That Google account has no YouTube channel. Create the Brand Account channel first (see the checklist).", vault_failed: "Could not store the token safely. Try again.", error: "Google refused the connection." };

const CHECKLIST = [
  "Use a Google account owned by the client (not the agency) and sign in at youtube.com.",
  "Create a new channel as a Brand Account (avatar > Create a channel). Channels cannot be created through the API.",
  "Name it like \"<Brand> Insights\" or \"<Brand> Academy\". Use a branded name, never a person's name. Keep it separate from the main brand channel.",
  "In About, state that videos use an AI presenter voice and link your blog first. Add banner and avatar from your brand assets.",
  "Verify the channel by phone (needed for custom thumbnails). Set defaults: category Education, made for kids: No.",
  "Come back here, press Connect channel, pick the Brand Account channel in Google's picker and accept. This happens once.",
];

export function YoutubeView({ orgId, orgName, channel, videos, readyArticles, canAdmin, missingEnv, flash, quota }: {
  orgId: string; orgName: string; channel: YtChannel; videos: YtVideo[]; readyArticles: number; canAdmin: boolean; missingEnv: string[]; flash: { code: string; msg: string } | null; quota: { model: string; perVideo: number; insert: number };
}) {
  const [sel, setSel] = useState<string | null>(videos[0]?.id ?? null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(flash ? { ok: flash.code === "connected", text: flash.msg || FLASH[flash.code] || "Done." } : null);
  const [pending, start] = useTransition();
  const current = videos.find((v) => v.id === sel) ?? null;
  const act = (f: () => Promise<{ ok: boolean; error?: string }>, okText: string) => start(async () => { const r = await f(); setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Failed." }); });

  return (
    <div className="flex flex-col gap-5">
      {msg ? <p role="status" className={msg.ok ? "text-sm text-good" : "text-sm text-bad"}>{msg.text}</p> : null}
      <ChannelCard orgId={orgId} orgName={orgName} channel={channel} canAdmin={canAdmin} missingEnv={missingEnv} quota={quota} onMsg={setMsg} />
      <Tabs defaultValue="queue">
        <TabsList><TabsTrigger value="queue">Queue</TabsTrigger><TabsTrigger value="setup">Channel setup</TabsTrigger></TabsList>
        <TabsContent value="queue">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-3">{readyArticles} article{readyArticles === 1 ? "" : "s"} ready for a video.</p>
            <Button size="sm" loading={pending} disabled={readyArticles === 0 || channel.status !== "connected"} onClick={() => act(() => draftVideo(orgId), "Draft created.")}><Plus className="size-4" aria-hidden="true" />Draft next video</Button>
          </div>
          {videos.length === 0 ? <EmptyState title="No videos yet" description="Approved articles with a public blog URL are turned into a script and metadata draft, one a day." /> : (
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <ul className="flex flex-col gap-2" aria-label="Video queue">
                {videos.map((v) => (
                  <li key={v.id}>
                    <button type="button" onClick={() => setSel(v.id)} aria-pressed={sel === v.id} className={`w-full rounded-md border p-3 text-left transition-colors ${sel === v.id ? "border-accent bg-subtle" : "border-line hover:bg-subtle"}`}>
                      <div className="mb-1 flex items-center justify-between gap-2"><Badge tone={TONE[v.status] ?? "neutral"}>{LABEL[v.status] ?? v.status}</Badge>{v.lint.length ? <AlertTriangle className="size-4 text-warn" aria-label="Has issues" /> : null}</div>
                      <p className="line-clamp-2 text-sm font-medium text-ink">{v.meta.title || v.articleTitle}</p>
                      <p className="mt-0.5 text-xs text-ink-4">{v.durationSec ? `${Math.round(v.durationSec)} s` : `about ${estimateSeconds(v.script)} s`}</p>
                    </button>
                  </li>
                ))}
              </ul>
              {current ? <Editor key={current.id + current.status} orgId={orgId} v={current} pending={pending} act={act} /> : null}
            </div>
          )}
        </TabsContent>
        <TabsContent value="setup"><Settings orgId={orgId} channel={channel} orgName={orgName} canAdmin={canAdmin} onMsg={setMsg} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ChannelCard({ orgId, channel, canAdmin, missingEnv, quota, onMsg }: { orgId: string; orgName: string; channel: YtChannel; canAdmin: boolean; missingEnv: string[]; quota: { model: string; perVideo: number; insert: number }; onMsg: (m: { ok: boolean; text: string } | null) => void }) {
  void onMsg;
  const connected = channel.status === "connected";
  return (
    <Card>
      <CardHeader title="Channel" description={connected ? `Connected to ${channel.title}. Uploads are hands-free.` : channel.status === "reauth_needed" ? "Access expired or was revoked. Reconnect to resume uploads." : "Not connected yet."} />
      <CardBody className="flex flex-wrap items-center gap-3">
        <Badge tone={connected ? "good" : channel.status === "reauth_needed" ? "warn" : "neutral"}>{connected ? "Connected" : channel.status === "reauth_needed" ? "Reconnect needed" : "Not connected"}</Badge>
        {missingEnv.length ? <span className="text-sm text-warn">Platform setup needed: set {missingEnv.join(", ")}.</span>
          : canAdmin ? <ButtonLink size="sm" variant={connected ? "secondary" : "primary"} href={`/api/youtube/oauth/start?org=${orgId}`}><Clapperboard className="size-4" aria-hidden="true" />{connected ? "Reconnect" : "Connect channel"}</ButtonLink>
          : <span className="text-sm text-ink-3">An admin connects the channel.</span>}
        {channel.lastError ? <span className="text-sm text-bad">{channel.lastError}</span> : null}
        <span className="ml-auto text-xs text-ink-4">A full upload costs about {quota.perVideo} of 10,000 daily quota units ({quota.model} model).</span>
      </CardBody>
    </Card>
  );
}

function Settings({ orgId, channel, orgName, canAdmin, onMsg }: { orgId: string; channel: YtChannel; orgName: string; canAdmin: boolean; onMsg: (m: { ok: boolean; text: string }) => void }) {
  const [s, setS] = useState({ personaName: channel.personaName || `${orgName} Insights Desk`, personaBlurb: channel.personaBlurb, mode: channel.mode, privacy: channel.privacy, dailyLimit: channel.dailyLimit });
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Presenter and publishing" description="The presenter is a branded persona, never a real person. Videos are marked as synthetic media and the description discloses the AI voice." />
        <CardBody className="flex flex-col gap-3">
          <Field label="Persona name" htmlFor="yt-persona" help="No titles or credentials. Example: Acme Insights Desk."><Input id="yt-persona" value={s.personaName} onChange={(e) => setS({ ...s, personaName: e.target.value })} disabled={!canAdmin} /></Field>
          <Field label="Persona description" htmlFor="yt-blurb"><Textarea id="yt-blurb" rows={2} value={s.personaBlurb} onChange={(e) => setS({ ...s, personaBlurb: e.target.value })} disabled={!canAdmin} /></Field>
          <Field label="Publishing" htmlFor="yt-mode" help="Approve first means a person approves every video. Automatic approves drafts that pass every check.">
            <NativeSelect id="yt-mode" value={s.mode} onChange={(e) => setS({ ...s, mode: e.target.value })} disabled={!canAdmin}><option value="approve">Approve first</option><option value="auto">Automatic</option></NativeSelect>
          </Field>
          <Field label="Visibility on upload" htmlFor="yt-priv" help="Start private, review in YouTube Studio, then switch to public.">
            <NativeSelect id="yt-priv" value={s.privacy} onChange={(e) => setS({ ...s, privacy: e.target.value })} disabled={!canAdmin}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></NativeSelect>
          </Field>
          <Field label="Videos per day" htmlFor="yt-lim"><Input id="yt-lim" type="number" min={0} max={10} value={s.dailyLimit} onChange={(e) => setS({ ...s, dailyLimit: Number(e.target.value) })} disabled={!canAdmin} /></Field>
          {canAdmin ? <div><Button size="sm" loading={pending} onClick={() => start(async () => { const r = await saveYoutubeSettings(orgId, s); onMsg({ ok: r.ok, text: r.ok ? "Saved." : r.error }); })}><Save className="size-4" aria-hidden="true" />Save</Button></div> : null}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="One-time channel checklist" description="YouTube cannot create channels through its API, so a person does these steps once." />
        <CardBody><ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-ink-2">{CHECKLIST.map((c) => <li key={c}>{c}</li>)}</ol></CardBody>
      </Card>
    </div>
  );
}

function Editor({ orgId, v, pending, act }: { orgId: string; v: YtVideo; pending: boolean; act: (f: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void }) {
  const editable = ["draft", "approved", "failed"].includes(v.status);
  const [script, setScript] = useState<VideoScript>(v.script);
  const [meta, setMeta] = useState<VideoMetadata>(v.meta);
  const setScene = (i: number, p: Partial<VideoScript["scenes"][number]>) => setScript((s) => ({ ...s, scenes: s.scenes.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
  const dirty = JSON.stringify(script) !== JSON.stringify(v.script) || JSON.stringify(meta) !== JSON.stringify(v.meta);
  return (
    <Card>
      <CardHeader title={meta.title || v.articleTitle} description={`From the article "${v.articleTitle}"`} actions={<Badge tone={TONE[v.status] ?? "neutral"}>{LABEL[v.status] ?? v.status}</Badge>} />
      <CardBody className="flex flex-col gap-4">
        {v.error ? <p role="alert" className="text-sm text-bad">{v.error}</p> : null}
        {v.lint.length ? <ul className="list-disc pl-5 text-sm text-warn">{v.lint.map((l) => <li key={l}>{l}</li>)}</ul> : null}
        {v.previewUrl ? <video controls preload="metadata" src={v.previewUrl} className="w-full max-w-2xl rounded-md border border-line" aria-label="Rendered video preview" /> : null}
        {v.youtubeId ? <p className="text-sm"><a className="inline-flex items-center gap-1 text-accent underline" href={`https://www.youtube.com/watch?v=${v.youtubeId}`} target="_blank" rel="noreferrer">Open on YouTube<ExternalLink className="size-3.5" aria-hidden="true" /></a>{v.privacyStatus ? <span className="ml-2 text-ink-3">Visibility: {v.privacyStatus}</span> : null}<span className="ml-2 text-ink-4">Check the &quot;altered or synthetic content&quot; label in YouTube Studio, and pin the link comment by hand.</span></p> : null}
        <fieldset disabled={!editable} className="flex flex-col gap-4">
          <Field label="Title" htmlFor="yt-title" help={`${meta.title.length}/70 characters. Pick a variant or write your own.`}>
            <Input id="yt-title" value={meta.title} maxLength={100} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
            <div className="mt-1 flex flex-wrap gap-1">{meta.titleVariants.map((t) => <button key={t} type="button" className="rounded-sm border border-line px-2 py-0.5 text-xs text-ink-2 hover:bg-subtle" onClick={() => setMeta({ ...meta, title: t })}>{t}</button>)}</div>
          </Field>
          <Field label="Description" htmlFor="yt-desc" help="The first line holds the answer and the blog link. Chapters and the AI-voice disclosure are kept in step automatically.">
            <Textarea id="yt-desc" rows={12} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tags" htmlFor="yt-tags" help="Comma separated."><Input id="yt-tags" value={meta.tags.join(", ")} onChange={(e) => setMeta({ ...meta, tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>
            <Field label="Playlist" htmlFor="yt-pl"><Input id="yt-pl" value={meta.playlist} onChange={(e) => setMeta({ ...meta, playlist: e.target.value })} /></Field>
          </div>
          <Field label="Source blog post" htmlFor="yt-blog"><Input id="yt-blog" value={meta.blogUrl} readOnly /></Field>
          <div>
            <p className="mb-1 text-sm font-medium text-ink">Chapters</p>
            <pre className="whitespace-pre-wrap rounded-md bg-subtle p-2 text-xs text-ink-2">{meta.chapters.length ? chapterLines(meta.chapters).join("\n") : "Not enough scenes for chapters."}</pre>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-ink">Script ({estimateSeconds(script)} s)</p>
            <Textarea aria-label="Hook" rows={2} value={script.hook} onChange={(e) => setScript({ ...script, hook: e.target.value })} />
            {script.scenes.map((s, i) => (
              <div key={i} className="grid gap-2 rounded-md border border-line p-2 sm:grid-cols-[1fr_200px]">
                <Textarea aria-label={`Scene ${i + 1} narration`} rows={3} value={s.text} onChange={(e) => setScene(i, { text: e.target.value })} />
                <div className="flex flex-col gap-2">
                  <Input aria-label={`Scene ${i + 1} chapter label`} value={s.onScreen} maxLength={60} onChange={(e) => setScene(i, { onScreen: e.target.value })} />
                  <Textarea aria-label={`Scene ${i + 1} image prompt`} rows={2} value={s.imagePrompt} disabled={!!s.chartId} onChange={(e) => setScene(i, { imagePrompt: e.target.value })} />
                </div>
              </div>
            ))}
            <Textarea aria-label="Outro" rows={2} value={script.outro} onChange={(e) => setScript({ ...script, outro: e.target.value })} />
          </div>
          <p className="text-xs text-ink-4">Marked as altered or synthetic content (AI voice). The description discloses it. The flag cannot be turned off here.</p>
        </fieldset>
        {editable || v.status === "rendered" ? (
          <div className="flex flex-wrap gap-2">
            {editable ? <Button size="sm" variant="secondary" loading={pending} disabled={!dirty} onClick={() => act(() => saveVideo(orgId, v.id, { script, meta }), "Saved. Review the checks, then approve.")}><Save className="size-4" aria-hidden="true" />Save changes</Button> : null}
            {v.status === "draft" || v.status === "failed" ? <Button size="sm" loading={pending} disabled={dirty} onClick={() => act(() => approve(orgId, v.id), "Approved. The voice and images are made next, then it renders and uploads.")}><Check className="size-4" aria-hidden="true" />Approve</Button> : null}
            <Button size="sm" variant="ghost" loading={pending} onClick={() => act(() => reject(orgId, v.id), "Rejected.")}><X className="size-4" aria-hidden="true" />Reject</Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

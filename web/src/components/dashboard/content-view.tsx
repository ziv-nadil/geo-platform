"use client";

import { Check, FilePlus2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Slider } from "@/components/ui/controls";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveBrandKit } from "@/app/app/[orgSlug]/actions";
import type { BrandKit, BrandStyle, ContentDraft } from "@/lib/ui/data-types";
import { fmtDate } from "@/lib/ui/format";

const TONES: { key: keyof BrandStyle["tone"]; left: string; right: string }[] = [
  { key: "formal", left: "Casual", right: "Formal" },
  { key: "playful", left: "Serious", right: "Playful" },
  { key: "technical", left: "Plain", right: "Technical" },
  { key: "confident", left: "Modest", right: "Confident" },
];

const STATUS_TONE: Record<string, "neutral" | "info" | "warn" | "good"> = { idea: "neutral", draft: "info", in_review: "warn", approved: "info", published: "good", archived: "neutral" };

export function ContentView({ orgId, kit: initialKit, drafts }: { orgId: string; kit: BrandKit; drafts: ContentDraft[] }) {
  const [kit, setKitState] = useState<BrandStyle>(initialKit.style);
  const [terms, setTerms] = useState(initialKit.terminology);
  const [saved, setSaved] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState("");
  const set = <K extends keyof BrandStyle>(k: K, v: BrandStyle[K]) => {
    setKitState((x) => ({ ...x, [k]: v }));
    setSaved(null);
  };

  return (
    <Tabs defaultValue="kit">
      <TabsList>
        <TabsTrigger value="kit">Brand kit</TabsTrigger>
        <TabsTrigger value="drafts">
          Drafts <Badge tone="neutral">{drafts.length}</Badge>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="kit">
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Voice & audience" description="Every generated draft follows this kit. Keep it short and specific." />
            <CardBody className="flex flex-col gap-5">
              <Field label="Brand voice" htmlFor="bk-voice" help="How you sound, in two or three sentences.">
                <Textarea id="bk-voice" rows={3} value={kit.voice} onChange={(e) => set("voice", e.target.value)} />
              </Field>
              <Field label="Audience" htmlFor="bk-aud">
                <Textarea id="bk-aud" rows={2} value={kit.audience} onChange={(e) => set("audience", e.target.value)} />
              </Field>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Perspective" htmlFor="bk-persp">
                  <Select
                    id="bk-persp"
                    value={kit.perspective}
                    onValueChange={(v) => set("perspective", v as BrandStyle["perspective"])}
                    options={[
                      { value: "first_plural", label: "We / our" },
                      { value: "second", label: "You / your" },
                      { value: "third", label: "Third person" },
                    ]}
                  />
                </Field>
                <Field label="Default channel" htmlFor="bk-channel">
                  <Select
                    id="bk-channel"
                    value={kit.channel}
                    onValueChange={(v) => set("channel", v as BrandStyle["channel"])}
                    options={[
                      { value: "blog", label: "Blog" },
                      { value: "docs", label: "Docs / help center" },
                      { value: "social", label: "Social" },
                      { value: "email", label: "Email" },
                      { value: "landing", label: "Landing page" },
                    ]}
                  />
                </Field>
                <Field label="Locale" htmlFor="bk-locale">
                  <Select
                    id="bk-locale"
                    value={kit.locale}
                    onValueChange={(v) => set("locale", v)}
                    options={[
                      { value: "en-US", label: "English (US)" },
                      { value: "en-GB", label: "English (UK)" },
                      { value: "de-DE", label: "German" },
                      { value: "fr-FR", label: "French" },
                      { value: "es-ES", label: "Spanish" },
                    ]}
                  />
                </Field>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-ink">Terminology</p>
                <TableWrap className="rounded-sm border border-line">
                  <Table>
                    <THead>
                      <tr>
                        <Th>Use</Th>
                        <Th>Avoid</Th>
                        <Th className="w-10"><span className="sr-only">Remove</span></Th>
                      </tr>
                    </THead>
                    <TBody>
                      {terms.map((t, i) => (
                        <Tr key={i}>
                          <Td>
                            <Input aria-label={`Use term ${i + 1}`} value={t.use} onChange={(e) => setTerms((l) => l.map((x, j) => (j === i ? { ...x, use: e.target.value } : x)))} />
                          </Td>
                          <Td>
                            <Input aria-label={`Avoid term ${i + 1}`} value={t.avoid} onChange={(e) => setTerms((l) => l.map((x, j) => (j === i ? { ...x, avoid: e.target.value } : x)))} />
                          </Td>
                          <Td>
                            <button type="button" aria-label="Remove term" className="rounded-xs p-1 text-ink-4 hover:bg-bad-soft hover:text-bad" onClick={() => setTerms((l) => l.filter((_, j) => j !== i))}>
                              <Trash2 className="size-4" />
                            </button>
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => setTerms((l) => [...l, { use: "", avoid: "" }])}>
                  <Plus /> Add term
                </Button>
              </div>
              <Field label="Disclosures" htmlFor="bk-disc" help="Added to the end of every article that needs it.">
                <Textarea id="bk-disc" rows={2} value={kit.disclosures} onChange={(e) => set("disclosures", e.target.value)} />
              </Field>
            </CardBody>
            <CardFooter>
              {saved ? (
                <span className={`mr-auto inline-flex items-center gap-1 text-sm ${saved.ok ? "text-good" : "text-bad"}`} role="status">
                  {saved.ok ? <Check className="size-4" aria-hidden="true" /> : null} {saved.text}
                </span>
              ) : null}
              <Button variant="secondary" onClick={() => { setKitState(initialKit.style); setTerms(initialKit.terminology); setSaved(null); }}>
                Discard changes
              </Button>
              <Button
                loading={saving}
                onClick={async () => {
                  setSaving(true);
                  const r = await saveBrandKit(orgId, kit, terms);
                  setSaving(false);
                  setSaved(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
                }}
              >
                Save brand kit
              </Button>
            </CardFooter>
          </Card>
          <div className="flex flex-col gap-6">
            {initialKit.profile ? (
              <Card>
                <CardHeader title={initialKit.profile.name || "Brand profile"} description={initialKit.profile.industry ?? undefined} />
                <CardBody className="flex flex-col gap-2 text-sm text-ink-2">
                  {initialKit.profile.tagline ? <p className="font-medium text-ink">{initialKit.profile.tagline}</p> : null}
                  {initialKit.profile.description ? <p>{initialKit.profile.description}</p> : null}
                  {initialKit.messaging.slice(0, 4).map((m, i) => (
                    <p key={i} className="text-xs">
                      <Badge tone="outline" className="mr-1 capitalize">{m.kind.replace("_", " ")}</Badge>
                      {m.content}
                    </p>
                  ))}
                  <p className="text-xs text-ink-4">From the brand book in onboarding.</p>
                </CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader title="Tone" description="Where each draft should land" />
              <CardBody className="flex flex-col gap-5">
                {TONES.map((t) => (
                  <div key={t.key} className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs text-ink-3">
                      <span>{t.left}</span>
                      <span className="font-semibold text-ink tabular">{kit.tone[t.key]}</span>
                      <span>{t.right}</span>
                    </div>
                    <Slider aria-label={`${t.left} to ${t.right}`} value={[kit.tone[t.key]]} max={100} step={5} onValueChange={([v]) => set("tone", { ...kit.tone, [t.key]: v ?? 0 })} />
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Writing rules" description="Hard rules the generator never breaks" />
              <CardBody>
                <ol className="flex flex-col gap-2">
                  {kit.rules.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-ink-2">
                      <span className="mt-0.5 w-4 shrink-0 text-xs text-ink-4 tabular">{i + 1}.</span>
                      <span className="flex-1">{r}</span>
                      <button type="button" aria-label={`Remove rule ${i + 1}`} className="rounded-xs p-0.5 text-ink-4 hover:text-bad" onClick={() => set("rules", kit.rules.filter((_, j) => j !== i))}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ol>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newRule.trim()) {
                      set("rules", [...kit.rules, newRule.trim()]);
                      setNewRule("");
                    }
                  }}
                >
                  <Input aria-label="New rule" placeholder="Add a rule" value={newRule} onChange={(e) => setNewRule(e.target.value)} />
                  <Button type="submit" variant="secondary" disabled={!newRule.trim()}>
                    Add
                  </Button>
                </form>
              </CardBody>
            </Card>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="drafts">
        <Card>
          <CardHeader
            title="Content drafts"
            description="Articles planned against prompts where you are missing or losing. Drafts go to your CMS for review; nothing is published automatically."

          />
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>Title</Th>
                  <Th>Type</Th>
                  <Th>Target prompt</Th>
                  <Th>Status</Th>
                  <Th>Updated</Th>
                </tr>
              </THead>
              <TBody>
                {drafts.map((d) => (
                  <Tr key={d.id}>
                    <Td className="font-medium text-ink">{d.title}</Td>
                    <Td className="capitalize">{d.type}</Td>
                    <Td className="max-w-64 truncate text-ink-3">{d.targetPrompt ?? "—"}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[d.status] ?? "neutral"} className="capitalize">{d.status.replace("_", " ")}</Badge>
                    </Td>
                    <Td>{fmtDate(d.updatedAt)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          {drafts.length === 0 ? <CardBody><p className="text-sm text-ink-3">No drafts yet.</p></CardBody> : null}
        </Card>
      </TabsContent>
    </Tabs>
  );
}


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
import type { BrandKit, ContentDraft } from "@/lib/mock/types";
import { fmtDate } from "@/lib/ui/format";

const TONES: { key: keyof BrandKit["tone"]; left: string; right: string }[] = [
  { key: "formal", left: "Casual", right: "Formal" },
  { key: "playful", left: "Serious", right: "Playful" },
  { key: "technical", left: "Plain", right: "Technical" },
  { key: "confident", left: "Modest", right: "Confident" },
];

const STATUS_TONE = { idea: "neutral", drafting: "info", review: "warn", published: "good" } as const;

export function ContentView({ kit: initialKit, drafts: initialDrafts, prompts }: { kit: BrandKit; drafts: ContentDraft[]; prompts: string[] }) {
  const [kit, setKit] = useState(initialKit);
  const [saved, setSaved] = useState(false);
  const [drafts, setDrafts] = useState(initialDrafts);
  const [newRule, setNewRule] = useState("");
  const set = <K extends keyof BrandKit>(k: K, v: BrandKit[K]) => {
    setKit((x) => ({ ...x, [k]: v }));
    setSaved(false);
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
                    onValueChange={(v) => set("perspective", v as BrandKit["perspective"])}
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
                    onValueChange={(v) => set("channel", v as BrandKit["channel"])}
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
                      {kit.terminology.map((t, i) => (
                        <Tr key={i}>
                          <Td>
                            <Input aria-label={`Use term ${i + 1}`} value={t.use} onChange={(e) => set("terminology", kit.terminology.map((x, j) => (j === i ? { ...x, use: e.target.value } : x)))} />
                          </Td>
                          <Td>
                            <Input aria-label={`Avoid term ${i + 1}`} value={t.avoid} onChange={(e) => set("terminology", kit.terminology.map((x, j) => (j === i ? { ...x, avoid: e.target.value } : x)))} />
                          </Td>
                          <Td>
                            <button type="button" aria-label="Remove term" className="rounded-xs p-1 text-ink-4 hover:bg-bad-soft hover:text-bad" onClick={() => set("terminology", kit.terminology.filter((_, j) => j !== i))}>
                              <Trash2 className="size-4" />
                            </button>
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => set("terminology", [...kit.terminology, { use: "", avoid: "" }])}>
                  <Plus /> Add term
                </Button>
              </div>
              <Field label="Disclosures" htmlFor="bk-disc" help="Added to the end of every article that needs it.">
                <Textarea id="bk-disc" rows={2} value={kit.disclosures} onChange={(e) => set("disclosures", e.target.value)} />
              </Field>
            </CardBody>
            <CardFooter>
              {saved ? (
                <span className="mr-auto inline-flex items-center gap-1 text-sm text-good">
                  <Check className="size-4" aria-hidden="true" /> Saved (demo: kept for this session)
                </span>
              ) : null}
              <Button variant="secondary" onClick={() => { setKit(initialKit); setSaved(false); }}>
                Discard changes
              </Button>
              <Button onClick={() => setSaved(true)}>Save brand kit</Button>
            </CardFooter>
          </Card>
          <div className="flex flex-col gap-6">
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
            actions={<NewDraft prompts={prompts} onCreate={(d) => setDrafts((l) => [d, ...l])} />}
          />
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>Title</Th>
                  <Th>Type</Th>
                  <Th>Target prompt</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Words</Th>
                  <Th>Owner</Th>
                  <Th>Updated</Th>
                </tr>
              </THead>
              <TBody>
                {drafts.map((d) => (
                  <Tr key={d.id}>
                    <Td className="font-medium text-ink">{d.title}</Td>
                    <Td className="capitalize">{d.type}</Td>
                    <Td className="max-w-64 truncate text-ink-3">{d.targetPrompt}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[d.status]} className="capitalize">{d.status}</Badge>
                    </Td>
                    <Td className="text-right">{d.words ? d.words.toLocaleString() : "—"}</Td>
                    <Td>{d.owner}</Td>
                    <Td>{fmtDate(d.updatedAt)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function NewDraft({ prompts, onCreate }: { prompts: string[]; onCreate: (d: ContentDraft) => void }) {
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState(prompts[0] ?? "");
  const [type, setType] = useState<ContentDraft["type"]>("article");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          <FilePlus2 /> New draft
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Plan a new draft"
        description="We generate an outline with your brand kit, then a full draft for review."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button disabled={!title.trim()} onClick={() => onCreate({ id: `d${title.length}${target.length}`, title: title.trim(), type, targetPrompt: target, status: "idea", words: 0, updatedAt: "2026-11-24", owner: "Maya Okafor" })}>
                Create draft
              </Button>
            </DialogClose>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Working title" htmlFor="nd-title" required>
            <Input id="nd-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Target prompt" htmlFor="nd-target">
            <Select id="nd-target" value={target} onValueChange={setTarget} options={prompts.map((p) => ({ value: p, label: p }))} />
          </Field>
          <Field label="Format" htmlFor="nd-type">
            <Select
              id="nd-type"
              value={type}
              onValueChange={(v) => setType(v as ContentDraft["type"])}
              options={[
                { value: "article", label: "Article" },
                { value: "comparison", label: "Comparison" },
                { value: "listicle", label: "Listicle" },
                { value: "faq", label: "FAQ" },
                { value: "landing", label: "Landing page" },
              ]}
            />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

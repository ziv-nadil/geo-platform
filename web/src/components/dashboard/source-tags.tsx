"use client";

import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { SourceTag } from "@/lib/mock/types";
import { SERIES } from "@/lib/ui/chart-colors";

const COLORS = [SERIES[0], SERIES[1], SERIES[6], SERIES[2], SERIES[4], SERIES[3]];

/** Source tags CRUD. Local state in demo mode; maps to /api source-tag routes once wired. */
export function SourceTags({ initial, knownDomains }: { initial: SourceTag[]; knownDomains: string[] }) {
  const [tags, setTags] = useState(initial);
  const [editing, setEditing] = useState<SourceTag | null>(null);
  const [open, setOpen] = useState(false);

  function startNew() {
    setEditing({ id: `t${Date.now()}`, name: "", color: COLORS[tags.length % COLORS.length]!, domains: [], description: "" });
    setOpen(true);
  }

  return (
    <Card>
      <CardHeader
        title="Source tags"
        description="Group domains you care about (review sites, PR targets, communities) to filter and report on them."
        actions={
          <Button size="sm" variant="secondary" onClick={startNew}>
            <Plus /> New tag
          </Button>
        }
      />
      <CardBody>
        {tags.length === 0 ? (
          <EmptyState icon={Tag} title="No source tags yet" description="Create a tag and assign domains to it." />
        ) : (
          <ul className="grid gap-3 md:grid-cols-3">
            {tags.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 rounded-sm border border-line p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <span className="size-2.5 rounded-full" style={{ background: t.color }} aria-hidden="true" />
                    {t.name}
                  </span>
                  <span className="flex gap-0.5">
                    <button type="button" className="rounded-xs p-1 text-ink-4 hover:bg-subtle hover:text-ink" aria-label={`Edit ${t.name}`} onClick={() => { setEditing(t); setOpen(true); }}>
                      <Pencil className="size-3.5" />
                    </button>
                    <button type="button" className="rounded-xs p-1 text-ink-4 hover:bg-bad-soft hover:text-bad" aria-label={`Delete ${t.name}`} onClick={() => setTags((l) => l.filter((x) => x.id !== t.id))}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
                {t.description ? <p className="text-xs text-ink-3">{t.description}</p> : null}
                <div className="flex flex-wrap gap-1">
                  {t.domains.map((d) => (
                    <span key={d} className="rounded-xs bg-subtle px-1.5 py-0.5 font-mono text-2xs text-ink-2">
                      {d}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <Dialog open={open} onOpenChange={setOpen}>
        {editing ? (
          <TagForm
            key={editing.id}
            tag={editing}
            knownDomains={knownDomains}
            onSave={(t) => setTags((l) => (l.some((x) => x.id === t.id) ? l.map((x) => (x.id === t.id ? t : x)) : [...l, t]))}
          />
        ) : null}
      </Dialog>
    </Card>
  );
}

function TagForm({ tag, knownDomains, onSave }: { tag: SourceTag; knownDomains: string[]; onSave: (t: SourceTag) => void }) {
  const [name, setName] = useState(tag.name);
  const [description, setDescription] = useState(tag.description ?? "");
  const [domains, setDomains] = useState(tag.domains.join("\n"));
  const list = domains.split(/[\s,]+/).map((d) => d.trim().toLowerCase()).filter(Boolean);
  return (
    <DialogContent
      title={tag.name ? `Edit “${tag.name}”` : "New source tag"}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button disabled={!name.trim()} onClick={() => onSave({ ...tag, name: name.trim(), description, domains: list })}>
              Save tag
            </Button>
          </DialogClose>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="tag-name" required>
          <Input id="tag-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Review sites" />
        </Field>
        <Field label="Description" htmlFor="tag-desc">
          <Input id="tag-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Domains" htmlFor="tag-domains" help={`One per line. Seen in answers: ${knownDomains.slice(0, 6).join(", ")}…`}>
          <Textarea id="tag-domains" rows={5} className="font-mono text-sm" value={domains} onChange={(e) => setDomains(e.target.value)} />
        </Field>
      </div>
    </DialogContent>
  );
}

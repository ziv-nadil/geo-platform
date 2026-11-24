"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useId } from "react";
import type { FieldDef } from "@/config/onboarding";
import { Button } from "@/components/ui/button";
import { Checkbox, RadioGroup } from "@/components/ui/controls";
import { FileDrop } from "@/components/ui/file-drop";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SecretInput } from "@/components/ui/secret-input";
import { Select } from "@/components/ui/select";
import { uploadFile } from "@/lib/ui/api-client";
import { cn } from "@/lib/ui/cn";
import { isVisible, type FieldValue, type FileRef, type Row, type SecretRef } from "@/lib/ui/onboarding-logic";

interface Ctx {
  orgId: string;
  stepId: string;
  /** Path prefix for nested fields, e.g. "icp_profiles.0." */
  path: string;
}

export function FieldList({
  fields,
  values,
  onChange,
  ctx,
  compact,
}: {
  fields: FieldDef[];
  values: Record<string, FieldValue>;
  onChange: (id: string, v: FieldValue) => void;
  ctx: Ctx;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-x-5 gap-y-5", compact ? "md:grid-cols-2" : "md:grid-cols-2")}>
      {fields.map((f) =>
        isVisible(f, values) ? (
          <div key={f.id} className={cn(["textarea", "table", "repeater", "radio", "multiselect"].includes(f.type) || (f.type === "file" && f.id.includes("design")) ? "md:col-span-2" : undefined)}>
            <FieldControl field={f} value={values[f.id]} onChange={(v) => onChange(f.id, v)} ctx={ctx} />
          </div>
        ) : null,
      )}
    </div>
  );
}

export function FieldControl({ field: f, value, onChange, ctx }: { field: FieldDef; value: FieldValue; onChange: (v: FieldValue) => void; ctx: Ctx }) {
  const uid = useId();
  const id = `${ctx.path}${f.id}`.replace(/\./g, "-") + uid.replace(/:/g, "");
  const helpId = f.help ? `${id}-help` : undefined;
  const str = typeof value === "string" ? value : "";

  if (f.type === "table") return <TableField field={f} rows={(value as Row[]) ?? []} onChange={onChange} />;
  if (f.type === "repeater") return <RepeaterField field={f} rows={(value as Row[]) ?? []} onChange={onChange} ctx={ctx} />;

  let control: React.ReactNode;
  switch (f.type) {
    case "textarea":
      control = <Textarea id={id} aria-describedby={helpId} rows={3} placeholder={f.placeholder} value={str} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "select":
      control = <Select id={id} value={str || undefined} onValueChange={onChange} options={f.options ?? []} placeholder={f.placeholder ?? "Choose…"} />;
      break;
    case "radio":
      control = <RadioGroup value={str || undefined} onValueChange={onChange} options={f.options ?? []} aria-labelledby={`${id}-label`} />;
      break;
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      control = (
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-label`}>
          {(f.options ?? []).map((o) => {
            const on = arr.includes(o.value);
            return (
              <label key={o.value} className={cn("flex h-8 cursor-pointer items-center gap-2 rounded-sm border px-2.5 text-sm", on ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong text-ink-2 hover:border-ink-4")}>
                <Checkbox checked={on} onCheckedChange={(c) => onChange(c ? [...arr, o.value] : arr.filter((x) => x !== o.value))} />
                {o.label}
              </label>
            );
          })}
        </div>
      );
      break;
    }
    case "file": {
      const fv = value as FileRef | undefined;
      control = (
        <FileDrop
          id={id}
          accept={f.accept}
          describedBy={helpId}
          darkPreview={f.id.includes("dark")}
          value={fv ?? null}
          onClear={() => onChange(undefined)}
          onFile={async (file) => {
            const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
            const base: FileRef = { kind: "file", name: file.name, size: file.size, type: file.type, previewUrl, status: "uploading" };
            onChange(base);
            const res = await uploadFile(ctx.orgId, ctx.stepId, `${ctx.path}${f.id}`, file);
            onChange(res.available ? { ...base, status: "stored", path: res.data.path } : { ...base, status: "local", note: `Not uploaded: ${res.error}` });
          }}
        />
      );
      break;
    }
    case "secret":
      control = (
        <SecretInput
          id={id}
          orgId={ctx.orgId}
          stepId={ctx.stepId}
          fieldId={`${ctx.path}${f.id}`}
          describedBy={helpId}
          placeholder={f.placeholder}
          state={value as SecretRef | undefined}
          onStored={(s) => onChange({ kind: "secret", ...s })}
        />
      );
      break;
    default:
      control = (
        <Input
          id={id}
          aria-describedby={helpId}
          type={f.type === "url" ? "url" : f.type === "email" ? "email" : "text"}
          inputMode={f.type === "url" ? "url" : f.type === "email" ? "email" : undefined}
          placeholder={f.placeholder}
          value={str}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
  const urlError = f.type === "url" && str && !/^https?:\/\/[^\s.]+\.[^\s]+$/.test(str) ? "Enter a full URL starting with https://" : undefined;
  const emailError = f.type === "email" && str && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str) ? "Enter a valid email address" : undefined;
  return (
    <Field label={<span id={`${id}-label`}>{f.label}</span>} htmlFor={["radio", "multiselect"].includes(f.type) ? undefined : id} required={f.required} help={f.help ? <span id={helpId}>{f.help}</span> : undefined} error={urlError ?? emailError}>
      {control}
    </Field>
  );
}

function TableField({ field: f, rows, onChange }: { field: FieldDef; rows: Row[]; onChange: (v: FieldValue) => void }) {
  const cols = f.columns ?? [];
  const max = f.max ?? 50;
  const update = (i: number, id: string, v: FieldValue) => onChange(rows.map((r, j) => (j === i ? { ...r, [id]: v } : r)));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-ink">
        {f.label}
        {f.required ? <span className="ml-0.5 text-bad" aria-hidden="true">*</span> : null}
        <span className="ml-2 text-xs font-normal text-ink-3">
          {rows.length}
          {f.min ? ` of ${f.min}` : ""} added
        </span>
      </legend>
      {f.help ? <p className="-mt-1 text-xs text-ink-3">{f.help}</p> : null}
      <div className="overflow-x-auto rounded-sm border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-subtle/60">
            <tr>
              <th className="w-8 px-2 py-2 text-left text-2xs font-semibold text-ink-4">#</th>
              {cols.map((c) => (
                <th key={c.id} className="px-2 py-2 text-left text-2xs font-semibold tracking-wide text-ink-3 uppercase">
                  {c.label}
                  {c.required ? <span className="ml-0.5 text-bad" aria-hidden="true">*</span> : null}
                </th>
              ))}
              <th className="w-9"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, i) => (
              <tr key={i} className="align-top">
                <td className="px-2 py-2 text-xs text-ink-4 tabular">{i + 1}</td>
                {cols.map((c) => (
                  <td key={c.id} className="min-w-40 px-1.5 py-1.5">
                    {c.type === "textarea" ? (
                      <Textarea aria-label={`${c.label}, row ${i + 1}`} rows={2} className="min-h-9 py-1.5 text-sm" value={(row[c.id] as string) ?? ""} onChange={(e) => update(i, c.id, e.target.value)} />
                    ) : (
                      <Input aria-label={`${c.label}, row ${i + 1}`} className="text-sm" type={c.type === "url" ? "url" : "text"} placeholder={c.type === "url" ? "https://" : undefined} value={(row[c.id] as string) ?? ""} onChange={(e) => update(i, c.id, e.target.value)} />
                    )}
                  </td>
                ))}
                <td className="px-1 py-2">
                  <button type="button" aria-label={`Remove row ${i + 1}`} className="rounded-xs p-1 text-ink-4 hover:bg-bad-soft hover:text-bad" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                    <X className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="px-3 py-4 text-center text-sm text-ink-3">No rows yet.</p> : null}
      </div>
      {rows.length < max ? (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => onChange([...rows, {}])}>
          <Plus /> Add row
        </Button>
      ) : null}
    </fieldset>
  );
}

function RepeaterField({ field: f, rows, onChange, ctx }: { field: FieldDef; rows: Row[]; onChange: (v: FieldValue) => void; ctx: Ctx }) {
  const children = f.fields ?? [];
  const max = f.max ?? 20;
  const nested = ctx.path.length > 0;
  const singular = f.label.replace(/\s*\(.*\)$/, "").replace(/s$/, "");
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-sm font-medium text-ink">
        {f.label}
        {f.required ? <span className="ml-0.5 text-bad" aria-hidden="true">*</span> : null}
        <span className="ml-2 text-xs font-normal text-ink-3">
          {rows.length}
          {f.min ? ` of ${f.min}` : ""} added
        </span>
      </legend>
      {f.help ? <p className="-mt-2 text-xs text-ink-3">{f.help}</p> : null}
      {rows.map((row, i) => (
        <div key={i} className={cn("rounded-sm border border-line p-4", nested ? "bg-surface" : "bg-subtle/50")}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">
              {singular} {i + 1}
            </p>
            <button type="button" className="inline-flex items-center gap-1 rounded-xs px-1.5 py-1 text-xs text-ink-3 hover:bg-bad-soft hover:text-bad" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <Trash2 className="size-3.5" aria-hidden="true" /> Remove
            </button>
          </div>
          <FieldList
            fields={children}
            values={row}
            ctx={{ ...ctx, path: `${ctx.path}${f.id}.${i}.` }}
            onChange={(id, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [id]: v } : r)))}
          />
        </div>
      ))}
      {rows.length < max ? (
        <Button size="sm" variant="secondary" className="self-start" onClick={() => onChange([...rows, {}])}>
          <Plus /> Add {singular.toLowerCase()}
        </Button>
      ) : null}
    </fieldset>
  );
}

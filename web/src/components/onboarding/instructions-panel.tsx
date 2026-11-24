"use client";

import { BookOpen, ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { InstructionBlock, OnboardingStep } from "@/config/onboarding";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/ui/cn";
import { substitute, variantSelector, type StepValues } from "@/lib/ui/onboarding-logic";

/** Render a step string: placeholders become copyable values, ``` fences become code blocks. */
function StepText({ text, placeholders }: { text: string; placeholders: Record<string, string> }) {
  const fence = text.match(/^([\s\S]*?)```(\w+)?\n([\s\S]*?)```([\s\S]*)$/);
  if (fence) {
    const [, before, lang, code, after] = fence;
    const body = substitute(code!.replace(/\n$/, ""), placeholders);
    return (
      <div className="flex flex-col gap-2">
        {before?.trim() ? <InlineText text={before.trim()} placeholders={placeholders} /> : null}
        <div className="relative rounded-sm border border-line bg-[#0f1720]">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
            <span className="font-mono text-2xs text-white/60 uppercase">{lang ?? "text"}</span>
            <CopyButton value={body} className="border-white/15 bg-white/5 text-white/80 hover:border-white/30 hover:text-white" />
          </div>
          <pre className="max-h-72 overflow-auto p-3 font-mono text-xs leading-relaxed text-[#e6edf3]">{body}</pre>
        </div>
        {after?.trim() ? <InlineText text={after.trim()} placeholders={placeholders} /> : null}
      </div>
    );
  }
  return <InlineText text={text} placeholders={placeholders} />;
}

function InlineText({ text, placeholders }: { text: string; placeholders: Record<string, string> }) {
  const parts = text.split(/(\{\{[A-Z0-9_]+\}\})/g);
  const out: ReactNode[] = parts.map((p, i) => {
    const m = p.match(/^\{\{([A-Z0-9_]+)\}\}$/);
    if (m) {
      const v = placeholders[m[1]!];
      if (!v) return <code key={i} className="rounded-xs bg-warn-soft px-1 font-mono text-xs text-warn">{p}</code>;
      return (
        <span key={i} className="inline-flex items-center gap-1 align-middle">
          <code className="rounded-xs border border-line bg-subtle px-1.5 py-0.5 font-mono text-xs break-all text-ink">{v}</code>
          <CopyButton value={v} label="Copy" />
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
  return <span>{out}</span>;
}

function Block({ block, placeholders }: { block: InstructionBlock; placeholders: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-sans text-sm font-semibold text-ink">{block.title}</h4>
      <ol className="flex flex-col gap-2.5">
        {block.steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 text-sm leading-relaxed text-ink-2">
            <span className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-subtle text-2xs font-semibold text-ink-3 tabular">{i + 1}</span>
            <div className="min-w-0">
              <StepText text={s} placeholders={placeholders} />
            </div>
          </li>
        ))}
      </ol>
      {block.links?.length ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {block.links.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                {l.label} <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function InstructionsPanel({ step, values, placeholders }: { step: OnboardingStep; values: StepValues; placeholders: Record<string, string> }) {
  const selector = variantSelector(step);
  const variantIds = [...new Set(step.instructions.map((b) => b.variant).filter(Boolean) as string[])];
  const ordered = selector?.options ? selector.options.map((o) => o.value).filter((v) => variantIds.includes(v)) : variantIds;
  const chosen = selector ? (values[selector.id] as string | undefined) : undefined;
  const [manual, setManual] = useState<{ chosen: string | undefined; tab: string } | null>(null);
  // Follow the field value; a manual tab click sticks until the field value changes.
  const active = manual && manual.chosen === chosen ? manual.tab : chosen && ordered.includes(chosen) ? chosen : ordered[0];
  const general = step.instructions.filter((b) => !b.variant);
  const variantBlocks = step.instructions.filter((b) => b.variant === active);
  const labelOf = (v: string) => selector?.options?.find((o) => o.value === v)?.label ?? v;

  if (!step.instructions.length) return null;
  return (
    <section className="rounded-md border border-line bg-surface" aria-labelledby={`instr-${step.id}`}>
      <header className="flex items-center gap-2 border-b border-line px-5 py-3">
        <BookOpen className="size-4 text-accent" aria-hidden="true" />
        <h3 id={`instr-${step.id}`} className="font-sans text-md font-semibold text-ink">
          How to grant access
        </h3>
      </header>
      <div className="flex flex-col gap-5 px-5 py-4">
        {general.map((b) => (
          <Block key={b.title} block={b} placeholders={placeholders} />
        ))}
        {ordered.length ? (
          <div className="flex flex-col gap-4">
            <div role="tablist" aria-label={selector?.label ?? "Variant"} className="flex flex-wrap gap-1 rounded-sm bg-subtle p-1">
              {ordered.map((v) => (
                <button
                  key={v}
                  role="tab"
                  type="button"
                  aria-selected={active === v}
                  onClick={() => setManual({ chosen, tab: v })}
                  className={cn(
                    "h-7 rounded-xs px-2.5 text-sm font-medium",
                    active === v ? "bg-surface text-ink shadow-xs" : "text-ink-3 hover:text-ink",
                  )}
                >
                  {labelOf(v)}
                  {chosen === v ? <span className="ml-1 text-2xs text-accent">· your choice</span> : null}
                </button>
              ))}
            </div>
            {!chosen && selector ? <p className="-mt-2 text-xs text-ink-3">Choose “{selector.label}” above to see the matching guide first.</p> : null}
            <div role="tabpanel" className="flex flex-col gap-5">
              {variantBlocks.map((b) => (
                <Block key={b.title} block={b} placeholders={placeholders} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

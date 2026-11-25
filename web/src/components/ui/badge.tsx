import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

export type BadgeTone = "neutral" | "accent" | "good" | "warn" | "bad" | "info" | "outline";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-subtle text-ink-2 border-line",
  accent: "bg-accent-soft text-accent-ink border-accent-soft-2",
  good: "bg-good-soft text-good border-[#c5e6d1]",
  warn: "bg-warn-soft text-warn border-[#f5dcae]",
  bad: "bg-bad-soft text-bad border-[#f3c9c7]",
  info: "bg-info-soft text-info border-[#cfdcf6]",
  outline: "bg-surface text-ink-2 border-line-strong",
};

export function Badge({ tone = "neutral", className, ...rest }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-xs border px-1.5 text-2xs font-medium whitespace-nowrap [&_svg]:size-3",
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}


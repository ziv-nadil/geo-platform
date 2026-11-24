"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/ui/cn";

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-xs border border-line bg-surface px-1.5 text-2xs font-medium text-ink-3 hover:border-line-strong hover:text-ink",
        className,
      )}
      aria-label={copied ? "Copied" : `${label}: ${value.slice(0, 40)}`}
    >
      {copied ? <Check className="size-3 text-good" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
      {copied ? "Copied" : label}
    </button>
  );
}

"use client";

import * as RS from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export interface SelectOption {
  value: string;
  label: string;
}

/** Radix select with the system's control styling. */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  id,
  className,
  "aria-label": ariaLabel,
  size = "md",
}: {
  value?: string;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
  size?: "sm" | "md";
}) {
  return (
    <RS.Root value={value} onValueChange={onValueChange}>
      <RS.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 rounded-sm border border-line-strong bg-surface px-3 text-left text-ink hover:border-ink-4 data-[placeholder]:text-ink-4",
          size === "sm" ? "h-8 text-sm" : "h-9 text-base",
          className,
        )}
      >
        <span className="truncate"><RS.Value placeholder={placeholder} /></span>
        <RS.Icon>
          <ChevronDown className="size-4 text-ink-3" />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content position="popper" sideOffset={4} className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-sm border border-line bg-surface shadow-pop">
          <RS.Viewport className="p-1">
            {options.map((o) => (
              <RS.Item
                key={o.value}
                value={o.value}
                className="relative flex h-8 cursor-default items-center rounded-xs pr-8 pl-2.5 text-sm text-ink outline-none select-none data-[highlighted]:bg-subtle"
              >
                <RS.ItemText>{o.label}</RS.ItemText>
                <RS.ItemIndicator className="absolute right-2">
                  <Check className="size-4 text-accent" />
                </RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}

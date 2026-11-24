"use client";

import * as RSwitch from "@radix-ui/react-switch";
import * as RSlider from "@radix-ui/react-slider";
import * as RCheckbox from "@radix-ui/react-checkbox";
import * as RRadio from "@radix-ui/react-radio-group";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

export function Switch({ className, ...rest }: ComponentProps<typeof RSwitch.Root>) {
  return (
    <RSwitch.Root
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent", className)}
      {...rest}
    >
      <RSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-xs transition-transform data-[state=checked]:translate-x-[18px]" />
    </RSwitch.Root>
  );
}

export function Slider({ className, ...rest }: ComponentProps<typeof RSlider.Root>) {
  return (
    <RSlider.Root className={cn("relative flex h-5 w-full touch-none items-center select-none", className)} {...rest}>
      <RSlider.Track className="relative h-1.5 grow rounded-full bg-muted-bg">
        <RSlider.Range className="absolute h-full rounded-full bg-accent" />
      </RSlider.Track>
      <RSlider.Thumb
        aria-label={rest["aria-label"]}
        className="block size-4 rounded-full border-2 border-accent bg-white shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
    </RSlider.Root>
  );
}

export function Checkbox({ className, ...rest }: ComponentProps<typeof RCheckbox.Root>) {
  return (
    <RCheckbox.Root
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-xs border border-line-strong bg-surface data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        className,
      )}
      {...rest}
    >
      <RCheckbox.Indicator>
        <Check className="size-3 text-white" strokeWidth={3} />
      </RCheckbox.Indicator>
    </RCheckbox.Root>
  );
}

export function RadioGroup({
  value,
  onValueChange,
  options,
  name,
  className,
  "aria-labelledby": labelledBy,
}: {
  value?: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string; description?: string }[];
  name?: string;
  className?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <RRadio.Root value={value} onValueChange={onValueChange} name={name} aria-labelledby={labelledBy} className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {options.map((o) => (
        <label
          key={o.value}
          className="flex cursor-pointer items-start gap-3 rounded-sm border border-line-strong bg-surface p-3 hover:border-ink-4 has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent-soft/50"
        >
          <RRadio.Item
            value={o.value}
            className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface data-[state=checked]:border-accent"
          >
            <RRadio.Indicator className="block size-2 rounded-full bg-accent" />
          </RRadio.Item>
          <span className="flex flex-col">
            <span className="text-sm font-medium text-ink">{o.label}</span>
            {o.description ? <span className="text-xs text-ink-3">{o.description}</span> : null}
          </span>
        </label>
      ))}
    </RRadio.Root>
  );
}

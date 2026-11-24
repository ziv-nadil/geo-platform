"use client";

import * as RTabs from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

export const Tabs = RTabs.Root;

export function TabsList({ className, ...rest }: ComponentProps<typeof RTabs.List>) {
  return <RTabs.List className={cn("flex items-center gap-1 overflow-x-auto border-b border-line", className)} {...rest} />;
}

export function TabsTrigger({ className, ...rest }: ComponentProps<typeof RTabs.Trigger>) {
  return (
    <RTabs.Trigger
      className={cn(
        "relative -mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-ink-3 transition-colors hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink [&_svg]:size-4",
        className,
      )}
      {...rest}
    />
  );
}

export function TabsContent({ className, ...rest }: ComponentProps<typeof RTabs.Content>) {
  return <RTabs.Content className={cn("pt-4 focus-visible:outline-none", className)} {...rest} />;
}

/** Segmented control look for compact, in-card switching. */
export function SegmentedList({ className, ...rest }: ComponentProps<typeof RTabs.List>) {
  return <RTabs.List className={cn("inline-flex items-center gap-0.5 rounded-sm bg-subtle p-0.5", className)} {...rest} />;
}

export function SegmentedTrigger({ className, ...rest }: ComponentProps<typeof RTabs.Trigger>) {
  return (
    <RTabs.Trigger
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-xs px-2.5 text-sm font-medium text-ink-3 hover:text-ink data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-xs [&_svg]:size-3.5",
        className,
      )}
      {...rest}
    />
  );
}

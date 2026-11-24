"use client";

import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export const Dialog = RD.Root;
export const DialogTrigger = RD.Trigger;
export const DialogClose = RD.Close;

export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
  wide,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <RD.Portal>
      <RD.Overlay className="fixed inset-0 z-40 animate-fade-in bg-ink/25" />
      <RD.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade-in flex-col rounded-lg border border-line bg-surface shadow-pop",
          wide ? "max-w-2xl" : "max-w-lg",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <RD.Title className="font-display text-lg font-semibold text-ink">{title}</RD.Title>
            {description ? <RD.Description className="mt-1 text-sm text-ink-3">{description}</RD.Description> : <RD.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</RD.Description>}
          </div>
          <RD.Close className="rounded-xs p-1 text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </RD.Close>
        </div>
        <div className="min-h-0 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-line px-6 py-3">{footer}</div> : null}
      </RD.Content>
    </RD.Portal>
  );
}

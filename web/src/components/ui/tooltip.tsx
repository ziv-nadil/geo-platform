"use client";

import * as RT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export const TooltipProvider = RT.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  return (
    <RT.Root delayDuration={150}>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "z-50 max-w-72 animate-fade-in rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink-2 shadow-pop",
            className,
          )}
        >
          {content}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}

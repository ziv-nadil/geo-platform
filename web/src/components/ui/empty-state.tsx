import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-line-strong px-6 py-12 text-center", className)}>
      {Icon ? (
        <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      ) : null}
      <div className="max-w-sm">
        <p className="font-display text-md font-semibold text-ink">{title}</p>
        {description ? <p className="mt-1 text-sm text-ink-3">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

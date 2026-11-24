import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export function Card({ className, ...rest }: ComponentProps<"section">) {
  return <section className={cn("rounded-md border border-line bg-surface", className)} {...rest} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  help,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  help?: ReactNode;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 font-sans text-md font-semibold text-ink">
          {title}
          {help}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-ink-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function CardBody({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-end gap-2 border-t border-line px-5 py-3", className)} {...rest} />;
}

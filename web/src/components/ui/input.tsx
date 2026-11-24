import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export const controlClass =
  "w-full rounded-sm border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-4 transition-colors hover:border-ink-4 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-3 aria-[invalid=true]:border-bad";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(controlClass, "h-9", className)} {...rest} />;
}

export function Textarea({ className, rows = 4, ...rest }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(controlClass, "min-h-20 py-2 leading-relaxed", className)} {...rest} />;
}

/** Native select: accessible, keyboard friendly, styled to match the system. */
export function NativeSelect({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(controlClass, "h-9 appearance-none pr-8", className)} {...rest}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Label({ className, ...rest }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-ink", className)} {...rest} />;
}

/** Label + control + help + error, stacked with consistent spacing. */
export function Field({
  label,
  htmlFor,
  help,
  error,
  required,
  children,
  className,
  aside,
}: {
  label: ReactNode;
  htmlFor?: string;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-bad" aria-hidden="true">*</span> : null}
          {required ? <span className="sr-only"> (required)</span> : null}
        </Label>
        {aside}
      </div>
      {children}
      {help ? <p className="text-xs text-ink-3">{help}</p> : null}
      {error ? <p className="text-xs font-medium text-bad" role="alert">{error}</p> : null}
    </div>
  );
}

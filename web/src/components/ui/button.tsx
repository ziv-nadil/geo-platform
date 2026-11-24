import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover active:bg-accent-press",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-subtle active:bg-muted-bg",
  ghost: "text-ink-2 hover:bg-subtle hover:text-ink active:bg-muted-bg",
  subtle: "bg-accent-soft text-accent-ink hover:bg-accent-soft-2",
  danger: "bg-bad text-white hover:bg-[#a52826]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 rounded-sm px-3 text-sm",
  md: "h-9 rounded-sm px-4 text-base",
  lg: "h-11 rounded-md px-5 text-md",
  icon: "size-8 rounded-sm",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

export function ButtonLink({ variant = "primary", size = "md", className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

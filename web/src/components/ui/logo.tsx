import { cn } from "@/lib/ui/cn";

/** Beacon GEO mark: a beacon emitting two signal arcs. */
export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden="true">
        <rect width="28" height="28" rx="7" fill="#0b7480" />
        <circle cx="14" cy="17" r="3" fill="#fff" />
        <path d="M8.5 13.5a7.5 7.5 0 0 1 11 0" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M5.5 10.5a11.5 11.5 0 0 1 17 0" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      {withWordmark ? (
        <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
          Beacon <span className="text-accent">GEO</span>
        </span>
      ) : null}
    </span>
  );
}

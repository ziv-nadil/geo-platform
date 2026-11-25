import { cn } from "@/lib/ui/cn";

/**
 * Beacon GEO mark: an ink tile holding a single signal point and one precise arc.
 * Wordmark: Geist semibold "Beacon" + Geist Mono "GEO" as a quiet technical suffix.
 */
export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden="true">
        <rect width="28" height="28" rx="8" fill="#0b0c0f" />
        <rect x="0.5" y="0.5" width="27" height="27" rx="7.5" fill="none" stroke="#fff" strokeOpacity="0.14" />
        <path d="M6.5 13a10 10 0 0 1 15 0" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M10 15.5a5.5 5.5 0 0 1 8 0" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <circle cx="14" cy="19.5" r="2.4" fill="#8b87ff" />
      </svg>
      {withWordmark ? (
        <span className="flex items-baseline gap-1.5 font-display text-[15px] font-semibold tracking-[-0.03em] text-ink">
          Beacon
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-3">GEO</span>
        </span>
      ) : null}
    </span>
  );
}

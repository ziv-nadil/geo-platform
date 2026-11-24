import { cn } from "@/lib/ui/cn";

export function Progress({
  value,
  className,
  tone = "accent",
  label,
  size = "md",
}: {
  value: number;
  className?: string;
  tone?: "accent" | "good" | "warn" | "bad";
  label?: string;
  size?: "sm" | "md";
}) {
  const v = Math.max(0, Math.min(100, value));
  const fill = { accent: "bg-accent", good: "bg-good", warn: "bg-warn-mark", bad: "bg-bad" }[tone];
  const track = { accent: "bg-accent-soft-2/70", good: "bg-good-soft", warn: "bg-warn-soft", bad: "bg-bad-soft" }[tone];
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("w-full overflow-hidden rounded-full", track, size === "sm" ? "h-1.5" : "h-2", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${v}%` }} />
    </div>
  );
}

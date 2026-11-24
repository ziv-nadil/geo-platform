import { ENGINE_BY_ID } from "@/lib/ui/engines";
import type { EngineId } from "@/lib/ui/data-types";
import { cn } from "@/lib/ui/cn";

/** Engine identity: colored dot + name. Text stays in ink, the dot carries the color. */
export function EngineChip({ id, short, className }: { id: EngineId; short?: boolean; className?: string }) {
  const e = ENGINE_BY_ID[id];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-ink-2", className)}>
      <span className="inline-block size-2 rounded-full" style={{ background: e.color }} aria-hidden="true" />
      {short ? e.short : e.name}
    </span>
  );
}

import { cn } from "@/lib/ui/cn";
import { initials } from "@/lib/ui/format";

const BG = ["#dbeafe", "#fde7dc", "#d7f3e7", "#fdf0cc", "#fbe1eb", "#e4e0fb"];
const FG = ["#1e4f8f", "#9a3b14", "#0d6b4a", "#7a5300", "#93345a", "#3f33a0"];

export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const i = h % BG.length;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", className)}
      style={{ width: size, height: size, background: BG[i], color: FG[i], fontSize: Math.round(size * 0.4) }}
    >
      {initials(name)}
    </span>
  );
}

/** Square brand mark for organizations. */
export function OrgMark({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-sm font-display font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.42) }}
    >
      {name[0]}
    </span>
  );
}

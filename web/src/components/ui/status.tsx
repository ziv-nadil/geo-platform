import { AlertTriangle, CheckCircle2, Circle, CircleDashed, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export type Status = "pass" | "partial" | "fail" | "pending" | "running" | "idle";

const META: Record<Status, { label: string; cls: string; Icon: typeof Circle }> = {
  pass: { label: "Working", cls: "text-good bg-good-soft", Icon: CheckCircle2 },
  partial: { label: "Partial", cls: "text-warn bg-warn-soft", Icon: AlertTriangle },
  fail: { label: "Failed", cls: "text-bad bg-bad-soft", Icon: XCircle },
  pending: { label: "In progress", cls: "text-info bg-info-soft", Icon: CircleDashed },
  running: { label: "Testing…", cls: "text-info bg-info-soft", Icon: Loader2 },
  idle: { label: "Not started", cls: "text-ink-3 bg-subtle", Icon: Circle },
};

/** Status pill: icon + label + color, never color alone. */
export function StatusPill({ status, label, className }: { status: Status; label?: string; className?: string }) {
  const m = META[status];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap", m.cls, className)}>
      <m.Icon className={cn("size-3.5", status === "running" && "animate-spin")} aria-hidden="true" />
      {label ?? m.label}
    </span>
  );
}

export function StatusIcon({ status, className }: { status: Status; className?: string }) {
  const m = META[status];
  return <m.Icon className={cn("size-4", m.cls.split(" ")[0], status === "running" && "animate-spin", className)} aria-label={m.label} />;
}

export type Severity = "critical" | "warning" | "notice";
export function SeverityBadge({ severity }: { severity: Severity }) {
  const cls = {
    critical: "bg-bad-soft text-bad",
    warning: "bg-warn-soft text-warn",
    notice: "bg-info-soft text-info",
  }[severity];
  const Icon = severity === "critical" ? XCircle : severity === "warning" ? AlertTriangle : Circle;
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-xs px-1.5 text-2xs font-semibold capitalize", cls)}>
      <Icon className="size-3" aria-hidden="true" />
      {severity}
    </span>
  );
}

import type { ReactNode } from "react";
import { DemoBadge } from "./badge";

export function PageHeader({
  title,
  description,
  actions,
  demo = true,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  demo?: boolean;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-sm text-ink-3">{eyebrow}</div> : null}
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {demo ? <DemoBadge /> : null}
        </div>
        {description ? <p className="mt-1 max-w-2xl text-base text-ink-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

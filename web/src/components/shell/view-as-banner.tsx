import { Eye } from "lucide-react";
import { exitViewAs } from "@/app/admin/actions";
import { fmtDateTime } from "@/lib/ui/format";

/** Shown to platform staff while a "view as" grant is active. Never rendered for clients. */
export function ViewAsBanner({ orgName, expiresAt }: { orgName: string; expiresAt: string }) {
  return (
    <div className="flex items-center justify-center gap-3 bg-ink px-4 py-2 text-sm text-white" role="status">
      <Eye className="size-4" aria-hidden="true" />
      <span>
        Viewing <strong className="font-semibold">{orgName}</strong> as the client sees it. Read-only, audited, ends {fmtDateTime(expiresAt)}.
      </span>
      <form action={exitViewAs}>
        <button type="submit" className="rounded-xs border border-white/30 px-2 py-0.5 text-xs font-medium hover:bg-white/10">
          Exit client view
        </button>
      </form>
    </div>
  );
}

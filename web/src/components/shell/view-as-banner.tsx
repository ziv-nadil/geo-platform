import { Eye } from "lucide-react";
import { exitViewAs } from "@/app/admin/actions";

/** Shown to platform staff while they "view as" a client account. Never rendered for clients. */
export function ViewAsBanner({ orgName }: { orgName: string }) {
  return (
    <div className="flex items-center justify-center gap-3 bg-ink px-4 py-2 text-sm text-white" role="status">
      <Eye className="size-4" aria-hidden="true" />
      <span>
        You are viewing <strong className="font-semibold">{orgName}</strong> as the client sees it. Admin tools are hidden.
      </span>
      <form action={exitViewAs}>
        <button type="submit" className="rounded-xs border border-white/30 px-2 py-0.5 text-xs font-medium hover:bg-white/10">
          Exit client view
        </button>
      </form>
    </div>
  );
}

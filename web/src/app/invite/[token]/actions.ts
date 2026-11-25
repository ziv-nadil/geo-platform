"use server";

import { redirect } from "next/navigation";
import { withViewerRls } from "@/lib/data";

/** Accept via the SECURITY DEFINER RPC public.accept_invitation(token) — it checks hash, expiry and email. */
export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  let slug: string | null = null;
  try {
    const r = await withViewerRls(async (sql) => {
      const [row] = await sql`select o.slug from public.organizations o where o.id = public.accept_invitation(${token})`;
      return (row?.slug as string | undefined) ?? null;
    });
    slug = r.ok ? r.data : null;
  } catch {
    slug = null;
  }
  redirect(slug ? `/app/${slug}` : `/invite/${encodeURIComponent(token)}?error=1`);
}

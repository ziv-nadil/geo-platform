"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOrgBySlug, getSessionUser } from "@/lib/mock";

const VIEW_AS_COOKIE = "bgeo_view_as";

/** Platform staff only: open a client account exactly as its members see it. */
export async function startViewAs(formData: FormData) {
  const user = await getSessionUser();
  if (!user.isPlatformAdmin) redirect("/app");
  const slug = String(formData.get("slug") ?? "");
  const org = await getOrgBySlug(slug);
  if (!org) redirect("/admin");
  (await cookies()).set(VIEW_AS_COOKIE, org.slug, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 2 });
  redirect(`/app/${org.slug}`);
}

export async function exitViewAs() {
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/admin");
}

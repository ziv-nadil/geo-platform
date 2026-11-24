import { redirect } from "next/navigation";

/** /app → the first client account. With Supabase this picks the user's last-used org. */
export default function AppIndex() {
  redirect("/app/northwind");
}

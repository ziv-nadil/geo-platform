import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

/** OAuth / magic-link return: exchange the code for a session cookie, then continue. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/app";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";
  const supabase = await createSupabaseServerClient();
  if (!supabase || !code) return NextResponse.redirect(new URL("/login?error=callback", url.origin));
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? "/login?error=callback" : next, url.origin));
}

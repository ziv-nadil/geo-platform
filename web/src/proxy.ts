import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/server/supabase/proxy";

/**
 * Next 16 proxy (formerly middleware): refreshes the Supabase session cookie on every request and
 * sends signed-out visitors of /app and /admin to /login. Without Supabase env vars it passes
 * through, and the pages show their own "not configured" or dev-bypass state.
 */
export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const protectedPath = /^\/(app|admin)(\/|$)/.test(request.nextUrl.pathname);
  if (configured && protectedPath && !userId) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

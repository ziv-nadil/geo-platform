"use client";

import { AlertTriangle, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { getBrowserSupabase } from "@/lib/ui/supabase-browser";

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.96 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
      <path fill="#F25022" d="M0 0h8.5v8.5H0z" />
      <path fill="#7FBA00" d="M9.5 0H18v8.5H9.5z" />
      <path fill="#00A4EF" d="M0 9.5h8.5V18H0z" />
      <path fill="#FFB900" d="M9.5 9.5H18V18H9.5z" />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/app";
  const supabase = getBrowserSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(sp.get("error") ? { ok: false, text: "Sign-in link expired or was already used. Try again." } : null);
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` : undefined;

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  const disabled = !supabase;
  return (
    <div className="flex flex-col gap-5">
      {disabled ? (
        <div className="flex gap-3 rounded-sm border border-warn/30 bg-warn-soft px-3 py-2.5 text-sm text-warn" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Auth not configured.</strong> Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign-in. For local QA, use the DEV_AUTH_USER_ID bypass described in docs/design/design-system.md.
          </span>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Button variant="secondary" size="lg" disabled={disabled} loading={busy === "google"} onClick={() => withBusy("google", async () => {
          const { error } = await supabase!.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
          if (error) setMsg({ ok: false, text: error.message });
        })}>
          <GoogleMark /> Continue with Google
        </Button>
        <Button variant="secondary" size="lg" disabled={disabled} loading={busy === "azure"} onClick={() => withBusy("azure", async () => {
          const { error } = await supabase!.auth.signInWithOAuth({ provider: "azure", options: { redirectTo, scopes: "email" } });
          if (error) setMsg({ ok: false, text: error.message });
        })}>
          <MicrosoftMark /> Continue with Microsoft
        </Button>
      </div>
      <div className="flex items-center gap-3 text-xs text-ink-4">
        <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void withBusy("password", async () => {
            if (mode === "login") {
              const { error } = await supabase!.auth.signInWithPassword({ email, password });
              if (error) setMsg({ ok: false, text: "Email or password is incorrect." });
              else router.replace(next);
            } else {
              const { error } = await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data: { full_name: name } } });
              if (error) setMsg({ ok: false, text: error.message });
              else setMsg({ ok: true, text: `Check ${email} for a link to confirm your account.` });
            }
          });
        }}
      >
        {mode === "signup" ? (
          <Field label="Full name" htmlFor="name" required>
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={disabled} required />
          </Field>
        ) : null}
        <Field label="Work email" htmlFor="email" required>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={disabled} required />
        </Field>
        <Field label="Password" htmlFor="password" required help={mode === "signup" ? "At least 10 characters." : undefined} aside={mode === "login" ? <span className="text-xs text-ink-3">Forgot it? Use a magic link.</span> : undefined}>
          <Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 10 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} disabled={disabled} required />
        </Field>
        <Button type="submit" size="lg" disabled={disabled || !email || !password} loading={busy === "password"}>
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
        {mode === "login" ? (
          <Button variant="ghost" disabled={disabled || !email} loading={busy === "magic"} onClick={() => withBusy("magic", async () => {
            const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
            setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `We sent a sign-in link to ${email}.` });
          })}>
            <Mail /> Email me a magic link
          </Button>
        ) : null}
      </form>
      {msg ? (
        <p className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`} role={msg.ok ? "status" : "alert"}>
          {msg.text}
        </p>
      ) : null}
      <p className="text-center text-sm text-ink-3">
        {mode === "login" ? (
          <>New to Beacon GEO? <Link href="/signup" className="font-medium text-accent hover:underline">Create an account</Link></>
        ) : (
          <>Already have an account? <Link href="/login" className="font-medium text-accent hover:underline">Sign in</Link></>
        )}
      </p>
    </div>
  );
}

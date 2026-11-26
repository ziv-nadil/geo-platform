import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Sign in" };

export default function Page() {
  return (
    <>
      <h1 className="text-xl font-semibold text-ink">Sign in</h1>
      <p className="mt-1 mb-6 text-sm text-ink-3">Welcome back. Sign in to your GEO Engine workspace.</p>
      <Suspense fallback={<div className="h-96" />}>
        <AuthForm />
      </Suspense>
    </>
  );
}

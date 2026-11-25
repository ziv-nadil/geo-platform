import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Create your account" };

export default function Page() {
  return (
    <>
      <h1 className="text-xl font-semibold text-ink">Create your account</h1>
      <p className="mt-1 mb-6 text-sm text-ink-3">Agencies and their clients use the same login. Clients usually join by invitation.</p>
      <Suspense fallback={<div className="h-96" />}>
        <AuthForm mode="signup" />
      </Suspense>
    </>
  );
}

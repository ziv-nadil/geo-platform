import { CheckCircle2, MailWarning } from "lucide-react";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { LoadFail } from "@/components/dashboard/page-kit";
import { getViewer } from "@/lib/data";
import { acceptInvite } from "./actions";

export const metadata = { title: "Accept invitation" };

export default function InvitePage(props: PageProps<"/invite/[token]">) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-md p-8">
        <Logo className="mb-6" />
        <Suspense fallback={<p className="text-sm text-ink-3">Checking your invitation…</p>}>
          <Invite params={props.params} searchParams={props.searchParams} />
        </Suspense>
      </Card>
    </main>
  );
}

async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  if (!viewer.ok && viewer.reason === "unauthenticated") {
    return (
      <>
        <h1 className="text-lg font-semibold text-ink">You&apos;re invited to Beacon GEO</h1>
        <p className="mt-2 text-sm text-ink-3">Sign in or create an account with the email address the invitation was sent to. You&apos;ll come back here to join.</p>
        <div className="mt-6 flex gap-2">
          <ButtonLink href={`/login?next=/invite/${token}`}>Sign in</ButtonLink>
          <ButtonLink href={`/signup?next=/invite/${token}`} variant="secondary">Create account</ButtonLink>
        </div>
      </>
    );
  }
  if (!viewer.ok) return <LoadFail result={viewer} />;
  if (sp.error) {
    return (
      <>
        <MailWarning className="size-6 text-bad" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold text-ink">This invitation can&apos;t be used</h1>
        <p className="mt-2 text-sm text-ink-3">It may have expired, been revoked, or been sent to a different email than {viewer.data.email}. Ask the account admin for a new link.</p>
      </>
    );
  }
  return (
    <>
      <CheckCircle2 className="size-6 text-accent" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-semibold text-ink">Join the account</h1>
      <p className="mt-2 text-sm text-ink-3">Signed in as {viewer.data.email}. Accept to see the account&apos;s AI visibility dashboards.</p>
      <form action={acceptInvite} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-md font-medium text-white hover:bg-accent-hover">
          Accept invitation
        </button>
      </form>
    </>
  );
}

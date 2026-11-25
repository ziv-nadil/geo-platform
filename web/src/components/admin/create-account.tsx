"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/** Create a client account through the backend (POST /api/admin/orgs). */
export function CreateAccountDialog() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", slug: "", website: "", plan: "starter", ownerEmail: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
  return (
    <Dialog onOpenChange={(o) => { if (!o) { setError(null); setInvite(null); } }}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Create account
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Create a client account"
        description="Creates the account, invites the owner and provisions its secret vault project."
        footer={
          invite ? (
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          ) : (
            <>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button
                loading={busy}
                disabled={!f.name.trim() || !f.slug}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const res = await fetch("/api/admin/orgs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, website: f.website || undefined, ownerEmail: f.ownerEmail || undefined }) });
                    const body = (await res.json().catch(() => ({}))) as { error?: string; status?: string; invite?: { token?: string; url?: string } };
                    if (!res.ok) setError(res.status === 404 ? "The account API is not deployed yet." : body.status === "not_configured" ? "Server not configured for account creation." : body.error ?? `Could not create the account (${res.status}).`);
                    else {
                      router.refresh();
                      setInvite(body.invite?.url ?? (body.invite?.token ? `${window.location.origin}/invite/${body.invite.token}` : "Account created."));
                    }
                  } catch {
                    setError("Network error. Try again.");
                  }
                  setBusy(false);
                }}
              >
                Create account
              </Button>
            </>
          )
        }
      >
        {invite ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-good">Account created.</p>
            {invite.startsWith("http") ? (
              <div className="flex items-center gap-2">
                <code className="truncate font-mono text-xs text-ink">{invite}</code>
                <CopyButton value={invite} />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Company name" htmlFor="ca-name" required>
              <Input id="ca-name" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value, slug: x.slug && x.slug !== slugify(x.name) ? x.slug : slugify(e.target.value) }))} />
            </Field>
            <Field label="URL slug" htmlFor="ca-slug" required help={`/app/${f.slug || "acme"}`}>
              <Input id="ca-slug" value={f.slug} onChange={(e) => setF((x) => ({ ...x, slug: slugify(e.target.value) }))} />
            </Field>
            <Field label="Website" htmlFor="ca-web">
              <Input id="ca-web" type="url" placeholder="https://" value={f.website} onChange={(e) => setF((x) => ({ ...x, website: e.target.value }))} />
            </Field>
            <Field label="Plan" htmlFor="ca-plan">
              <Select id="ca-plan" value={f.plan} onValueChange={(v) => setF((x) => ({ ...x, plan: v }))} options={["starter", "growth", "scale", "enterprise"].map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))} />
            </Field>
            <Field label="Owner email" htmlFor="ca-owner" className="md:col-span-2" help="They get a one-time invitation link.">
              <Input id="ca-owner" type="email" value={f.ownerEmail} onChange={(e) => setF((x) => ({ ...x, ownerEmail: e.target.value }))} />
            </Field>
            {error ? <p className="text-sm text-bad md:col-span-2" role="alert">{error}</p> : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

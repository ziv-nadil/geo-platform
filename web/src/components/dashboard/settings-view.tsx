"use client";

import { CreditCard, ExternalLink, KeyRound, Mail, Plus, RefreshCw, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createApiKey, inviteMember, removeMember, revokeApiKey, revokeInvitation, saveOrgGeneral, setMemberRole } from "@/app/app/[orgSlug]/actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/controls";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ApiKey, Billing, Integration, Invitation, Member, Org, Role } from "@/lib/ui/data-types";
import { fmtDate, fmtDateTime, fmtUsd } from "@/lib/ui/format";

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "owner", label: "Owner", description: "Everything, including billing and deleting the account" },
  { value: "admin", label: "Admin", description: "Manage members, integrations and settings" },
  { value: "member", label: "Member", description: "Edit prompts, competitors, content and reports" },
  { value: "viewer", label: "Viewer", description: "Read-only access to dashboards" },
];

function Notice({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p className={`mx-5 mb-4 rounded-sm border px-3 py-2 text-sm ${msg.ok ? "border-good/30 bg-good-soft text-good" : "border-bad/30 bg-bad-soft text-bad"}`} role="status">
      {msg.text}
    </p>
  );
}

export function SettingsView({
  org,
  tab,
  canAdmin,
  members,
  invitations,
  apiKeys,
  integrations,
  billing,
}: {
  org: Org;
  tab: string;
  canAdmin: boolean;
  members: Member[];
  invitations: Invitation[];
  apiKeys: ApiKey[];
  integrations: Integration[];
  billing: Billing | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [general, setGeneral] = useState({ name: org.name, website: org.domain ? `https://${org.domain}` : "" });

  async function act(p: Promise<{ ok: boolean; error?: string }>, okText?: string) {
    const r = await p;
    setMsg(r.ok ? (okText ? { ok: true, text: okText } : null) : { ok: false, text: r.error ?? "Could not save." });
    if (r.ok) router.refresh();
    return r.ok;
  }

  const activeKeys = apiKeys.filter((k) => !k.revokedAt);
  const pending = invitations.filter((i) => i.status === "pending");

  return (
    <Tabs defaultValue={tab}>
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="members">Members & roles</TabsTrigger>
        <TabsTrigger value="invitations">Invitations</TabsTrigger>
        <TabsTrigger value="sso">SSO</TabsTrigger>
        <TabsTrigger value="api-keys">API keys</TabsTrigger>
        <TabsTrigger value="integrations">Integrations</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
      </TabsList>

      <TabsContent value="general">
        <Card className="max-w-3xl">
          <CardHeader title="Account" description="Shown in reports and on generated content." />
          <Notice msg={msg} />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Field label="Company name" htmlFor="s-name">
              <Input id="s-name" value={general.name} disabled={!canAdmin} onChange={(e) => setGeneral((g) => ({ ...g, name: e.target.value }))} />
            </Field>
            <Field label="Primary website" htmlFor="s-site">
              <Input id="s-site" type="url" value={general.website} disabled={!canAdmin} onChange={(e) => setGeneral((g) => ({ ...g, website: e.target.value }))} />
            </Field>
            <Field label="Plan" htmlFor="s-plan">
              <Input id="s-plan" value={org.plan} disabled />
            </Field>
            <Field label="Status" htmlFor="s-status">
              <Input id="s-status" value={org.status} disabled />
            </Field>
          </CardBody>
          <CardFooter>
            {!canAdmin ? <span className="mr-auto text-sm text-ink-3">Only owners and admins can change these.</span> : null}
            <Button disabled={!canAdmin} onClick={() => act(saveOrgGeneral(org.id, general.name, general.website), "Saved")}>
              Save changes
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="members">
        <Card>
          <CardHeader
            title="Members"
            description={`${members.length} ${members.length === 1 ? "person" : "people"} in ${org.name}. Agency staff are never listed and do not use a seat.`}
            actions={canAdmin ? <InviteDialog onInvite={async (email, role) => {
              const r = await inviteMember(org.id, email, role);
              if (r.ok && r.data) {
                setInviteLink(`${window.location.origin}${r.data}`);
                router.refresh();
              }
              return r.ok ? { ok: true } : { ok: false, error: r.error };
            }} /> : null}
          />
          <Notice msg={msg} />
          {inviteLink ? (
            <div className="mx-5 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-good/30 bg-good-soft px-3 py-2">
              <span className="text-sm text-good">Invitation created. Send this link; it works once and expires in 7 days.</span>
              <span className="flex min-w-0 items-center gap-2">
                <code className="truncate font-mono text-xs text-ink">{inviteLink}</code>
                <CopyButton value={inviteLink} />
              </span>
            </div>
          ) : null}
          {members.length === 0 ? (
            <CardBody>
              <EmptyState icon={UserPlus} title="No members yet" description="Invite the client team so they can see their dashboards." />
            </CardBody>
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <Th>Member</Th>
                    <Th>Joined</Th>
                    <Th className="w-56">Role</Th>
                    <Th className="w-10"><span className="sr-only">Remove</span></Th>
                  </tr>
                </THead>
                <TBody>
                  {members.map((m) => (
                    <Tr key={m.userId}>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <Avatar name={m.name} />
                          <span>
                            <span className="block font-medium text-ink">{m.name}</span>
                            <span className="block text-xs text-ink-4">{m.email}</span>
                          </span>
                        </span>
                      </Td>
                      <Td>{fmtDate(m.joinedAt)}</Td>
                      <Td>
                        {canAdmin && m.role !== "owner" ? (
                          <Select size="sm" aria-label={`Role for ${m.name}`} value={m.role} onValueChange={(v) => act(setMemberRole(org.id, m.userId, v as Role), "Role updated")} options={ROLES.filter((r) => r.value !== "owner")} />
                        ) : (
                          <Badge tone={m.role === "owner" ? "accent" : "outline"} className="capitalize">{m.role}</Badge>
                        )}
                      </Td>
                      <Td>
                        {canAdmin && m.role !== "owner" ? (
                          <button type="button" aria-label={`Remove ${m.name}`} className="rounded-xs p-1 text-ink-4 hover:bg-bad-soft hover:text-bad" onClick={() => act(removeMember(org.id, m.userId), `${m.name} removed`)}>
                            <Trash2 className="size-4" />
                          </button>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
        <Card className="mt-6">
          <CardHeader title="Roles" description="What each role can do" />
          <CardBody>
            <dl className="grid gap-3 md:grid-cols-4">
              {ROLES.map((r) => (
                <div key={r.value} className="rounded-sm border border-line p-3">
                  <dt className="text-sm font-semibold text-ink">{r.label}</dt>
                  <dd className="mt-1 text-xs text-ink-3">{r.description}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </TabsContent>

      <TabsContent value="invitations">
        <Card>
          <CardHeader title="Invitations" description={canAdmin ? "Invitations expire after 7 days." : "Only owners and admins can see invitations."} />
          {invitations.length === 0 ? (
            <CardBody>
              <EmptyState icon={Mail} title="No invitations" />
            </CardBody>
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th>Sent</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </THead>
                <TBody>
                  {invitations.map((i) => (
                    <Tr key={i.id}>
                      <Td className="font-medium text-ink">{i.email}</Td>
                      <Td className="capitalize">{i.role}</Td>
                      <Td>{fmtDate(i.createdAt)}</Td>
                      <Td>{i.status === "pending" ? <Badge tone="info">Expires {fmtDate(i.expiresAt)}</Badge> : <Badge tone="neutral" className="capitalize">{i.status}</Badge>}</Td>
                      <Td className="text-right">
                        {i.status === "pending" && canAdmin ? (
                          <Button size="sm" variant="ghost" onClick={() => act(revokeInvitation(org.id, i.id), "Invitation revoked")}>
                            Revoke
                          </Button>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
          {pending.length ? <p className="px-5 py-3 text-xs text-ink-4">{pending.length} pending</p> : null}
        </Card>
      </TabsContent>

      <TabsContent value="sso">
        <Card className="max-w-3xl">
          <CardHeader title="Single sign-on" description="Members can sign in with these providers. Providers are enabled by the agency in Supabase Auth." />
          <CardBody className="flex flex-col divide-y divide-line">
            {[
              ["Google Workspace", "Continue with Google on the sign-in page."],
              ["Microsoft Entra ID", "Continue with Microsoft on the sign-in page."],
              ["SAML 2.0", "Okta, OneLogin, JumpCloud and others. Requires Supabase Pro and the Enterprise plan; set up on request."],
            ].map(([title, desc]) => (
              <div key={title} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{title}</p>
                  <p className="text-xs text-ink-3">{desc}</p>
                </div>
                <ShieldCheck className="size-4 text-ink-4" aria-hidden="true" />
              </div>
            ))}
          </CardBody>
        </Card>
      </TabsContent>

      <TabsContent value="api-keys">
        <Card>
          <CardHeader
            title="API keys"
            description="Read metrics from BI tools or push prompts from your own systems. Keys are shown once and stored only as a hash."
            actions={
              canAdmin ? (
                <CreateKeyDialog
                  onCreate={async (name, scopes) => {
                    const r = await createApiKey(org.id, name, scopes);
                    if (r.ok && r.data) {
                      setNewKey(r.data.key);
                      router.refresh();
                    } else if (!r.ok) setMsg({ ok: false, text: r.error });
                  }}
                />
              ) : null
            }
          />
          <Notice msg={msg} />
          {newKey ? (
            <div className="mx-5 mb-4 flex items-center justify-between gap-3 rounded-sm border border-good/30 bg-good-soft px-3 py-2">
              <span className="text-sm text-good">Copy this key now. You won&apos;t see it again.</span>
              <span className="flex min-w-0 items-center gap-2">
                <code className="truncate font-mono text-xs text-ink">{newKey}</code>
                <CopyButton value={newKey} />
                <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>Done</Button>
              </span>
            </div>
          ) : null}
          {activeKeys.length === 0 ? (
            <CardBody>
              <EmptyState icon={KeyRound} title="No active API keys" />
            </CardBody>
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Key</Th>
                    <Th>Scopes</Th>
                    <Th>Created</Th>
                    <Th>Last used</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </THead>
                <TBody>
                  {activeKeys.map((k) => (
                    <Tr key={k.id}>
                      <Td className="font-medium text-ink">{k.name}</Td>
                      <Td className="font-mono text-xs">{k.prefix}…</Td>
                      <Td>
                        <span className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <Badge key={s} tone="outline">{s}</Badge>
                          ))}
                        </span>
                      </Td>
                      <Td>{fmtDate(k.createdAt)}</Td>
                      <Td>{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "Never"}</Td>
                      <Td className="text-right">
                        {canAdmin ? (
                          <Button size="sm" variant="ghost" onClick={() => act(revokeApiKey(org.id, k.id), "Key revoked")}>
                            Revoke
                          </Button>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </TabsContent>

      <TabsContent value="integrations">
        <Card>
          <CardHeader title="Integrations" description="Status of every connection set up during onboarding, from the latest live test. Fix or re-test any of them from its onboarding step." />
          {integrations.length === 0 ? (
            <CardBody>
              <EmptyState icon={RefreshCw} title="No integrations yet" description="Run the live tests in onboarding to see status here." />
            </CardBody>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {integrations.map((i) => (
                <li key={i.stepId} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-60 text-sm font-medium text-ink">{i.name}</span>
                  <StatusPill status={i.status} label={i.status === "idle" ? "Not connected" : undefined} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-3">{i.detail}</span>
                  <span className="text-xs text-ink-4">{i.lastCheckedAt ? fmtDateTime(i.lastCheckedAt) : ""}</span>
                  <Link href={`/app/${org.slug}/onboarding?step=${i.stepId}`} className="text-sm font-medium text-accent hover:underline">
                    Open step
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </TabsContent>

      <TabsContent value="billing">
        <BillingPanel billing={billing} orgId={org.id} />
      </TabsContent>
    </Tabs>
  );
}

function BillingPanel({ billing, orgId }: { billing: Billing | null; orgId: string }) {
  const [portalMsg, setPortalMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!billing || (!billing.planName && !billing.subscriptionStatus)) {
    return <EmptyState icon={CreditCard} title="No subscription" description="This account has no plan yet. The agency starts the subscription after onboarding." />;
  }
  const prompts = billing.usage.find((u) => /prompt/.test(u.metric));
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader
          title={`${billing.planName ?? "Custom"} plan`}
          description={[billing.subscriptionStatus ? `Subscription ${billing.subscriptionStatus.replace("_", " ")}` : null, billing.renewsAt ? `${billing.cancelAtPeriodEnd ? "ends" : "renews"} ${fmtDate(billing.renewsAt)}` : null].filter(Boolean).join(" · ")}
          actions={
            <Button
              variant="secondary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setPortalMsg(null);
                try {
                  const res = await fetch(`/api/billing/portal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId }) });
                  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string; status?: string };
                  if (res.ok && body.url) window.location.assign(body.url);
                  else setPortalMsg(res.status === 404 ? "The billing portal endpoint is not deployed yet." : body.status === "not_configured" ? "Stripe is not configured for this environment." : body.error ?? "Could not open the billing portal.");
                } catch {
                  setPortalMsg("Network error. Try again.");
                }
                setBusy(false);
              }}
            >
              <CreditCard /> Manage in Stripe <ExternalLink />
            </Button>
          }
        />
        <CardBody className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="text-xs text-ink-4">Plan price</p>
            <p className="font-display text-xl font-semibold text-ink tabular">{billing.monthlyPrice === null ? "—" : `${fmtUsd(billing.monthlyPrice)}/mo`}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-ink-4">Seats</p>
            <p className="text-sm text-ink">
              <strong className="font-semibold tabular">{billing.seats ?? "—"}</strong>
              {billing.seatLimit ? ` of ${billing.seatLimit} included` : ""}
            </p>
            {billing.seats !== null && billing.seatLimit ? <Progress value={(billing.seats / billing.seatLimit) * 100} label="Seats used" /> : null}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-ink-4">Tracked prompts</p>
            <p className="text-sm text-ink">
              <strong className="font-semibold tabular">{prompts?.value ?? "—"}</strong>
              {billing.promptLimit ? ` of ${billing.promptLimit}` : ""}
            </p>
            {prompts && billing.promptLimit ? <Progress value={(prompts.value / billing.promptLimit) * 100} label="Prompts used" /> : null}
          </div>
          {portalMsg ? <p className="text-sm text-bad md:col-span-3" role="alert">{portalMsg}</p> : null}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Plans" description="Change plan in the Stripe portal" />
        <CardBody>
          <ul className="flex flex-col divide-y divide-line">
            {billing.plans.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className={p.name === billing.planName ? "font-semibold text-ink" : "text-ink-2"}>
                  {p.name} {p.name === billing.planName ? <Badge tone="accent" className="ml-1">Current</Badge> : null}
                </span>
                <span className="text-ink-2 tabular">{fmtUsd(p.monthlyPrice)}/mo</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Card className="xl:col-span-3">
        <CardHeader title="Invoices" description="Invoices and receipts are available in the Stripe portal." />
      </Card>
    </div>
  );
}

function InviteDialog({ onInvite }: { onInvite: (email: string, role: Role) => Promise<{ ok: boolean; error?: string }> }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Invite a member"
        description="You get a one-time link to send. It is valid for 7 days."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              disabled={!valid}
              onClick={async () => {
                const res = await onInvite(email.trim(), role);
                if (res.ok) {
                  setOpen(false);
                  setEmail("");
                  setError(null);
                } else setError(res.error ?? "Could not create the invitation.");
              }}
            >
              Create invitation
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Email" htmlFor="inv-email" required error={error}>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          </Field>
          <Field label="Role" htmlFor="inv-role">
            <Select id="inv-role" value={role} onValueChange={(v) => setRole(v as Role)} options={ROLES.filter((r) => r.value !== "owner")} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SCOPES = ["read:metrics", "read:prompts", "write:prompts", "read:citations"];

function CreateKeyDialog({ onCreate }: { onCreate: (name: string, scopes: string[]) => Promise<void> }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read:metrics"]);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> Create key
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Create API key"
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button disabled={!name.trim() || !scopes.length} onClick={() => void onCreate(name.trim(), scopes)}>
                Create key
              </Button>
            </DialogClose>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="key-name" required help="Where the key is used, e.g. Looker Studio">
            <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">Scopes</legend>
            {SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-2 font-mono text-sm text-ink-2">
                <Checkbox checked={scopes.includes(s)} onCheckedChange={(v) => setScopes((l) => (v ? [...l, s] : l.filter((x) => x !== s)))} />
                {s}
              </label>
            ))}
          </fieldset>
        </div>
      </DialogContent>
    </Dialog>
  );
}

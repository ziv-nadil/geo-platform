"use client";

import { CreditCard, ExternalLink, KeyRound, Mail, Plus, RefreshCw, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox, Switch } from "@/components/ui/controls";
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
  { value: "editor", label: "Editor", description: "Edit prompts, competitors, content and reports" },
  { value: "viewer", label: "Viewer", description: "Read-only access to dashboards" },
];

export interface SettingsActions {
  inviteMember?: (email: string, role: Role) => Promise<{ ok: boolean; error?: string }>;
  openBillingPortal?: () => Promise<{ url?: string; error?: string }>;
  createApiKey?: (name: string, scopes: string[]) => Promise<{ key?: string; id?: string; error?: string }>;
}

export function SettingsView({
  org,
  tab,
  members: initialMembers,
  invitations: initialInvites,
  apiKeys: initialKeys,
  integrations,
  billing,
  actions,
}: {
  org: Org;
  tab: string;
  members: Member[];
  invitations: Invitation[];
  apiKeys: ApiKey[];
  integrations: Integration[];
  billing: Billing | null;
  actions?: SettingsActions;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [keys, setKeys] = useState(initialKeys);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [portalMsg, setPortalMsg] = useState<string | null>(null);
  const [sso, setSso] = useState({ google: true, microsoft: true, saml: false, enforce: false, domains: org.domain });

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
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Field label="Company name" htmlFor="s-name">
              <Input id="s-name" defaultValue={org.name} />
            </Field>
            <Field label="Primary domain" htmlFor="s-domain">
              <Input id="s-domain" defaultValue={org.domain} />
            </Field>
            <Field label="Industry" htmlFor="s-industry">
              <Input id="s-industry" defaultValue={org.industry} />
            </Field>
            <Field label="Default locale" htmlFor="s-locale">
              <Input id="s-locale" defaultValue={org.locale} />
            </Field>
          </CardBody>
          <CardFooter>
            <Button>Save changes</Button>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="members">
        <Card>
          <CardHeader
            title="Members"
            description={`${members.length} people in ${org.name}. Agency staff are not listed and do not use a seat.`}
            actions={
              <InviteDialog
                onInvite={async (email, role) => {
                  const res = (await actions?.inviteMember?.(email, role)) ?? { ok: true };
                  if (res.ok) setInvites((l) => [{ id: `inv-${email}`, email, role, invitedBy: "You", sentAt: "2026-11-24", expiresAt: "2026-12-01", status: "pending" }, ...l]);
                  return res;
                }}
              />
            }
          />
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
                    <Th>Two-factor</Th>
                    <Th>Last active</Th>
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
                      <Td>{m.mfa ? <Badge tone="good"><ShieldCheck /> On</Badge> : <Badge tone="warn">Off</Badge>}</Td>
                      <Td>{m.lastActiveAt ? fmtDate(m.lastActiveAt) : "Never"}</Td>
                      <Td>
                        <Select size="sm" aria-label={`Role for ${m.name}`} value={m.role} onValueChange={(v) => setMembers((l) => l.map((x) => (x.userId === m.userId ? { ...x, role: v as Role } : x)))} options={ROLES} />
                      </Td>
                      <Td>
                        {m.role !== "owner" ? (
                          <button type="button" aria-label={`Remove ${m.name}`} className="rounded-xs p-1 text-ink-4 hover:bg-bad-soft hover:text-bad" onClick={() => setMembers((l) => l.filter((x) => x.userId !== m.userId))}>
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
          <CardHeader title="Pending invitations" description="Invitations expire after 7 days." />
          {invites.length === 0 ? (
            <CardBody>
              <EmptyState icon={Mail} title="No open invitations" />
            </CardBody>
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th>Invited by</Th>
                    <Th>Sent</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </THead>
                <TBody>
                  {invites.map((i) => (
                    <Tr key={i.id}>
                      <Td className="font-medium text-ink">{i.email}</Td>
                      <Td className="capitalize">{i.role}</Td>
                      <Td>{i.invitedBy}</Td>
                      <Td>{fmtDate(i.sentAt)}</Td>
                      <Td>{i.status === "pending" ? <Badge tone="info">Expires {fmtDate(i.expiresAt).replace(", 2026", "")}</Badge> : <Badge tone="neutral">Expired</Badge>}</Td>
                      <Td className="text-right">
                        <span className="inline-flex gap-1">
                          <Button size="sm" variant="ghost">
                            <RefreshCw /> Resend
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setInvites((l) => l.filter((x) => x.id !== i.id))}>
                            Revoke
                          </Button>
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </TabsContent>

      <TabsContent value="sso">
        <Card className="max-w-3xl">
          <CardHeader title="Single sign-on" description="Choose how members of this account sign in." />
          <CardBody className="flex flex-col divide-y divide-line">
            {(
              [
                ["google", "Google Workspace", "Sign in with Google accounts on your domains."],
                ["microsoft", "Microsoft Entra ID", "Sign in with Microsoft 365 work accounts."],
                ["saml", "SAML 2.0", "Okta, OneLogin, JumpCloud and others. Requires the Enterprise plan."],
              ] as const
            ).map(([k, title, desc]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {title} {k === "saml" && org.plan !== "enterprise" ? <Badge tone="outline" className="ml-1">Enterprise</Badge> : null}
                  </p>
                  <p className="text-xs text-ink-3">{desc}</p>
                </div>
                <Switch aria-label={title} checked={sso[k]} disabled={k === "saml" && org.plan !== "enterprise"} onCheckedChange={(v) => setSso((s) => ({ ...s, [k]: v }))} />
              </div>
            ))}
            <div className="flex flex-col gap-3 py-3">
              <Field label="Allowed email domains" htmlFor="sso-domains" help="Comma-separated. New users from these domains join as Viewers.">
                <Input id="sso-domains" value={sso.domains} onChange={(e) => setSso((s) => ({ ...s, domains: e.target.value }))} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <Checkbox checked={sso.enforce} onCheckedChange={(v) => setSso((s) => ({ ...s, enforce: v === true }))} />
                Require SSO for everyone on these domains (password sign-in is disabled)
              </label>
            </div>
          </CardBody>
          <CardFooter>
            <Button>Save SSO settings</Button>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="api-keys">
        <Card>
          <CardHeader
            title="API keys"
            description="Read metrics from BI tools or push prompts from your own systems. Keys are shown once."
            actions={
              <CreateKeyDialog
                onCreate={async (name, scopes) => {
                  setKeyError(null);
                  const res = (await actions?.createApiKey?.(name, scopes)) ?? { error: "API key service is not connected yet. No key was created." };
                  if (res.key) {
                    setNewKey(res.key);
                    setKeys((l) => [{ id: res.id ?? res.key!.slice(0, 14), name, prefix: res.key!.slice(0, 14), scopes, createdAt: new Date().toISOString().slice(0, 10), lastUsedAt: null, createdBy: "You" }, ...l]);
                  } else setKeyError(res.error ?? "Could not create the key.");
                }}
              />
            }
          />
          {keyError ? (
            <p className="mx-5 mb-4 rounded-sm border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">
              {keyError}
            </p>
          ) : null}
          {newKey ? (
            <div className="mx-5 mb-4 flex items-center justify-between gap-3 rounded-sm border border-good/30 bg-good-soft px-3 py-2">
              <span className="text-sm text-good">Copy this key now. You won&apos;t see it again.</span>
              <span className="flex items-center gap-2">
                <code className="font-mono text-xs text-ink">{newKey}</code>
                <CopyButton value={newKey} />
                <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>Done</Button>
              </span>
            </div>
          ) : null}
          {keys.length === 0 ? (
            <CardBody>
              <EmptyState icon={KeyRound} title="No API keys" />
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
                  {keys.map((k) => (
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
                      <Td>
                        {fmtDate(k.createdAt)} · {k.createdBy}
                      </Td>
                      <Td>{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "Never"}</Td>
                      <Td className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setKeys((l) => l.filter((x) => x.id !== k.id))}>
                          Revoke
                        </Button>
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
          <CardHeader title="Integrations" description="Live status of every connection set up during onboarding. Fix or re-test any of them from the onboarding step." />
          {integrations.length === 0 ? (
            <CardBody>
              <EmptyState icon={RefreshCw} title="No integrations tested yet" description="Run the live tests in onboarding to see status here." />
            </CardBody>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {integrations.map((i) => (
                <li key={i.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-56 text-sm font-medium text-ink">{i.name}</span>
                  <StatusPill status={i.status} label={i.status === "idle" ? "Not connected" : undefined} />
                  <span className="flex-1 text-sm text-ink-3">{i.detail}</span>
                  <span className="text-xs text-ink-4">{i.lastCheckedAt ? `Checked ${fmtDateTime(i.lastCheckedAt)}` : ""}</span>
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
        {billing ? (
          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title={`${billing.planName} plan`}
                description={`Renews ${fmtDate(billing.renewsAt)} · ${billing.paymentMethod}`}
                actions={
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      setPortalMsg(null);
                      const res = (await actions?.openBillingPortal?.()) ?? { error: "Billing portal is not connected yet." };
                      if (res.url) window.location.assign(res.url);
                      else setPortalMsg(res.error ?? "Could not open the billing portal.");
                    }}
                  >
                    <CreditCard /> Manage in Stripe <ExternalLink />
                  </Button>
                }
              />
              <CardBody className="grid gap-6 md:grid-cols-3">
                <div>
                  <p className="text-xs text-ink-4">Monthly total</p>
                  <p className="font-display text-xl font-semibold text-ink tabular">{fmtUsd(billing.basePrice + billing.pricePerSeat * billing.seats)}</p>
                  <p className="text-xs text-ink-3">
                    {fmtUsd(billing.basePrice)} base + {billing.seats} seats × {fmtUsd(billing.pricePerSeat)}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-ink-4">Seats</p>
                  <p className="text-sm text-ink">
                    <strong className="font-semibold tabular">{billing.seatsUsed}</strong> of {billing.seats} used
                  </p>
                  <Progress value={(billing.seatsUsed / Math.max(1, billing.seats)) * 100} label="Seats used" />
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-ink-4">Tracked prompts</p>
                  <p className="text-sm text-ink">
                    <strong className="font-semibold tabular">{billing.promptsUsed}</strong> of {billing.promptsLimit}
                  </p>
                  <Progress value={(billing.promptsUsed / Math.max(1, billing.promptsLimit)) * 100} label="Prompts used" />
                </div>
                {portalMsg ? <p className="text-sm text-bad md:col-span-3" role="alert">{portalMsg}</p> : null}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Change seats" description="Prorated on your next invoice." />
              <CardBody className="flex flex-col gap-3">
                <Field label="Seats" htmlFor="b-seats">
                  <Input id="b-seats" type="number" min={billing.seatsUsed} defaultValue={billing.seats} />
                </Field>
                <Button variant="secondary">Update seats</Button>
              </CardBody>
            </Card>
            <Card className="xl:col-span-3">
              <CardHeader title="Invoices" />
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <Th>Invoice</Th>
                      <Th>Date</Th>
                      <Th className="text-right">Amount</Th>
                      <Th>Status</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {billing.invoices.map((i) => (
                      <Tr key={i.id}>
                        <Td className="font-mono text-xs text-ink">{i.number}</Td>
                        <Td>{fmtDate(i.date)}</Td>
                        <Td className="text-right font-semibold text-ink">{fmtUsd(i.amount)}</Td>
                        <Td>
                          <Badge tone={i.status === "paid" ? "good" : i.status === "open" ? "warn" : "neutral"} className="capitalize">{i.status}</Badge>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
              {billing.invoices.length === 0 ? <CardBody><p className="text-sm text-ink-3">No invoices yet.</p></CardBody> : null}
            </Card>
          </div>
        ) : (
          <EmptyState icon={CreditCard} title="No subscription" description="This account has no Stripe subscription yet. An agency admin can start one from the super admin console." />
        )}
      </TabsContent>
    </Tabs>
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
        description="They get an email with a link that is valid for 7 days."
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
                } else setError(res.error ?? "Could not send the invitation.");
              }}
            >
              Send invitation
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

function CreateKeyDialog({ onCreate }: { onCreate: (name: string, scopes: string[]) => void | Promise<void> }) {
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

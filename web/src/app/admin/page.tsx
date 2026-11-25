import { Eye } from "lucide-react";
import { Suspense } from "react";
import { CreateAccountDialog } from "@/components/admin/create-account";
import { LoadFail, PageSkeleton } from "@/components/dashboard/page-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricHelp } from "@/components/ui/metric-help";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { adminListOrgs } from "@/lib/data";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/ui/format";
import { startViewAs } from "./actions";

export default function AdminPage(props: PageProps<"/admin">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Accounts searchParams={props.searchParams} />
    </Suspense>
  );
}

function health(o: { status: string; onboardingNeedsAttention: number; runs30d: number; subscriptionStatus: string | null }) {
  if (o.status === "churned" || o.subscriptionStatus === "past_due" || o.subscriptionStatus === "unpaid") return { label: "At risk", tone: "bad" as const };
  if (o.onboardingNeedsAttention > 0 || (o.status === "active" && o.runs30d === 0)) return { label: "Needs attention", tone: "warn" as const };
  return { label: "Healthy", tone: "good" as const };
}

async function Accounts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const r = await adminListOrgs();
  if (!r.ok) {
    return (
      <>
        <PageHeader title="Client accounts" />
        {r.reason === "forbidden" ? (
          <LoadFail result={{ ok: false, reason: "forbidden" }} />
        ) : (
          <LoadFail result={r} />
        )}
        <p className="mt-4 text-center text-sm text-ink-3">The console needs an MFA (aal2) session and an active platform admin record.</p>
      </>
    );
  }
  const rows = r.data;
  const active = rows.filter((o) => o.status === "active").length;
  const runs = rows.reduce((s, o) => s + o.runs30d, 0);
  return (
    <>
      <PageHeader title="Client accounts" description="Every client account, its onboarding, billing and monitoring health. Clients never see this console or the staff who use it." actions={<CreateAccountDialog />} />
      {sp.error === "mfa" ? <p className="mb-4 rounded-sm border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">Viewing a client needs an MFA-verified session. Sign in again with your authenticator.</p> : null}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Accounts" value={rows.length} />
        <StatTile label="Active" value={active} />
        <StatTile label="Answers collected (30 days)" metric="answers" value={fmtNumber(runs)} />
        <StatTile label="Vaults provisioned" value={`${rows.filter((o) => o.vaultProvisioned).length}/${rows.length}`} />
      </div>
      <Card className="mt-6">
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <Th>Account</Th>
                <Th>Health</Th>
                <Th className="w-48">
                  <span className="inline-flex items-center gap-1">Onboarding <MetricHelp id="onboarding" /></span>
                </Th>
                <Th>Plan</Th>
                <Th>Subscription</Th>
                <Th className="text-right">Members</Th>
                <Th className="text-right">Runs 30d</Th>
                <Th>Last run</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((o) => {
                const h = health(o);
                return (
                  <Tr key={o.id}>
                    <Td>
                      <span className="block font-medium text-ink">{o.name}</span>
                      <span className="block text-xs text-ink-4">
                        {o.slug} · since {fmtDate(o.createdAt)}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={h.tone}>{h.label}</Badge>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <Progress value={o.onboardingPct} size="sm" label={`${o.name} onboarding`} />
                        <span className="w-9 text-right text-xs text-ink-2 tabular">{o.onboardingPct}%</span>
                      </span>
                    </Td>
                    <Td className="capitalize">{o.plan}</Td>
                    <Td>{o.subscriptionStatus ? <Badge tone={o.subscriptionStatus === "active" ? "good" : o.subscriptionStatus === "trialing" ? "info" : "warn"} className="capitalize">{o.subscriptionStatus.replace("_", " ")}</Badge> : <span className="text-ink-4">None</span>}</Td>
                    <Td className="text-right">{o.members}</Td>
                    <Td className="text-right">{fmtNumber(o.runs30d)}</Td>
                    <Td>{o.lastRunAt ? fmtDateTime(o.lastRunAt) : "Never"}</Td>
                    <Td className="text-right">
                      <form action={startViewAs}>
                        <input type="hidden" name="orgId" value={o.id} />
                        <input type="hidden" name="reason" value="Account review from the super admin console" />
                        <Button type="submit" size="sm" variant="secondary">
                          <Eye /> View as
                        </Button>
                      </form>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      </Card>
      <p className="mt-3 text-xs text-ink-4">MRR comes from Stripe once billing is live (backend TODO: expose price × seats per subscription). &ldquo;View as&rdquo; opens a 60-minute, read-only, audited grant.</p>
    </>
  );
}

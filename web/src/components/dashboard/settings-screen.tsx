import { loadPage, type RouteProps } from "@/components/dashboard/page-kit";
import { SettingsView } from "@/components/dashboard/settings-view";
import { PageHeader } from "@/components/ui/page-header";
import { getApiKeys, getBilling, getIntegrations, getInvitations, getMembers } from "@/lib/data";

const BILLING_ON = process.env.BILLING_ENABLED === "true";
const TABS = ["general", "members", "invitations", "sso", "api-keys", "integrations", ...(BILLING_ON ? ["billing"] : [])];

export async function SettingsScreen(props: RouteProps) {
  const ctx = await loadPage(props);
  if ("gate" in ctx) return ctx.gate;
  const { org, sp } = ctx;
  const [members, invites, keys, integrations, billing] = await Promise.all([getMembers(org.id), getInvitations(org.id), getApiKeys(org.id), getIntegrations(org.id), BILLING_ON ? getBilling(org.id) : Promise.resolve({ ok: false } as const)]);
  const tab = typeof sp.tab === "string" && TABS.includes(sp.tab) ? sp.tab : "general";
  const canAdmin = org.role === "owner" || org.role === "admin";
  return (
    <>
      <PageHeader title="Settings" description={`Account, people, access${BILLING_ON ? " and billing" : ""} for ${org.name}.`} />
      <SettingsView
        org={org}
        tab={tab}
        canAdmin={canAdmin}
        members={members.ok ? members.data : []}
        invitations={invites.ok ? invites.data : []}
        apiKeys={keys.ok ? keys.data : []}
        integrations={integrations.ok ? integrations.data : []}
        billing={billing.ok ? billing.data : null}
        billingEnabled={BILLING_ON}
      />
    </>
  );
}

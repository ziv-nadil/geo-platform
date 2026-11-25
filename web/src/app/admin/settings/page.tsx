import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Platform settings" };

const GROUPS: { title: string; description: string; vars: [string, string][] }[] = [
  { title: "Database & auth", description: "Supabase project and connection.", vars: [["DATABASE_URL", "Postgres connection"], ["NEXT_PUBLIC_SUPABASE_URL", "Supabase URL"], ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase anon key"], ["SUPABASE_SERVICE_ROLE_KEY", "Service role (server only)"]] },
  { title: "Secrets vault", description: "Infisical Cloud, one project per client.", vars: [["INFISICAL_CLIENT_ID", "Machine identity"], ["INFISICAL_CLIENT_SECRET", "Machine identity secret"], ["INTAKE_JWE_PRIVATE_JWK", "Browser-to-vault encryption key"]] },
  { title: "Billing", description: "Stripe checkout, portal and webhooks.", vars: [["STRIPE_SECRET_KEY", "Stripe API key"], ["STRIPE_WEBHOOK_SECRET", "Webhook signing secret"]] },
  { title: "AI engines", description: "Direct APIs plus DataForSEO for Google AI Overviews.", vars: [["OPENAI_API_KEY", "ChatGPT"], ["PERPLEXITY_API_KEY", "Perplexity"], ["GEMINI_API_KEY", "Gemini"], ["ANTHROPIC_API_KEY", "Claude"], ["DATAFORSEO_LOGIN", "Google AI Overviews"]] },
  { title: "Onboarding instructions", description: "Values shown to clients in the onboarding guides.", vars: [["AGENCY_EMAIL", "Agency Google/Microsoft identity"], ["AGENCY_GITHUB_USER", "GitHub user for PRs"], ["ADS_MANAGER_ID", "Google Ads manager ID"], ["AWS_PRINCIPAL_ARN", "AWS role we assume"], ["ONBOARDING_TOKEN_SALT", "Per-client DNS / ExternalId values"]] },
];

export default function PlatformSettingsPage() {
  return (
    <>
      <PageHeader title="Platform settings" description="Which integrations are configured for this deployment. Values are set as environment variables and never shown here." />
      <Suspense fallback={null}>
        <EnvStatus />
      </Suspense>
    </>
  );
}

async function EnvStatus() {
  await connection();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {GROUPS.map((g) => (
        <Card key={g.title}>
          <CardHeader title={g.title} description={g.description} />
          <CardBody>
            <ul className="flex flex-col divide-y divide-line">
              {g.vars.map(([k, label]) => (
                <li key={k} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="block text-sm text-ink">{label}</span>
                    <span className="block font-mono text-2xs text-ink-4">{k}</span>
                  </span>
                  {process.env[k] ? <Badge tone="good">Configured</Badge> : <Badge tone="neutral">Not set</Badge>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

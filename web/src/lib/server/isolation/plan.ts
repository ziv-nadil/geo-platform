import {
  GITHUB_OIDC_DISCOVERY_URL, GITHUB_OIDC_ISSUER, INFISICAL_OIDC_AUDIENCE,
  clientEnvironmentName, environmentVariables, oidcSubject, readerIdentityName,
} from './github-env';
import type { IsolationMode } from './mode';

/**
 * Pure provisioning plan for one client (isolation.md §5 Phase 1, steps 4-5). The executor in ../infisical.ts and
 * ./github-env.ts carries it out; tests assert on the plan itself. The plan never contains secret values.
 */
export const READER_TOKEN_TTL_S = 600;

export type PlanStep =
  | { kind: 'identity.create'; name: string; orgRole: 'no-access' }
  | {
      kind: 'identity.oidc-auth';
      oidcDiscoveryUrl: string;
      boundIssuer: string;
      boundAudiences: string;
      boundSubject: string;
      boundClaims: Record<string, string>;
      accessTokenTTL: number;
      accessTokenMaxTTL: number;
      accessTokenNumUsesLimit: number;
    }
  | { kind: 'project.membership'; projectId: string; identity: 'reader'; role: string }
  | { kind: 'project.membership'; projectId: string; identity: 'app-writer'; role: string }
  | { kind: 'project.membership'; projectId: string; identity: 'worker'; role: string }
  | { kind: 'github.environment'; environment: string; branch: 'main'; vars: Record<string, string> };

export type ProvisionPlanInput = {
  orgId: string;
  slug: string;
  projectId: string;
  /** Repo `sub` prefix, e.g. `repo:acme/geo-platform` (see github-env.readSubPrefix). */
  subPrefix: string;
  mode: IsolationMode;
  /** Infisical project role for the client reader: must be read-only. */
  readerRole?: string;
  appWriterRole?: string;
  workerRole?: string;
  existingReaderIdentityId?: string | null;
};

export type ProvisionPlan = {
  orgId: string;
  slug: string;
  environment: string;
  boundSubject: string;
  readerIdentityName: string;
  steps: PlanStep[];
};

/** Project roles that must never be given to a client reader. */
const WRITE_ROLES = new Set(['admin', 'member', 'owner']);

export function buildProvisionPlan(i: ProvisionPlanInput): ProvisionPlan {
  const environment = clientEnvironmentName(i.slug);
  const boundSubject = oidcSubject(i.subPrefix, i.slug);
  const readerRole = i.readerRole ?? 'viewer';
  if (WRITE_ROLES.has(readerRole)) throw new Error(`reader role must be read-only, got ${readerRole}`);
  const steps: PlanStep[] = [];

  if (!i.existingReaderIdentityId) steps.push({ kind: 'identity.create', name: readerIdentityName(i.slug), orgRole: 'no-access' });
  steps.push({
    kind: 'identity.oidc-auth',
    oidcDiscoveryUrl: GITHUB_OIDC_DISCOVERY_URL,
    boundIssuer: GITHUB_OIDC_ISSUER,
    boundAudiences: INFISICAL_OIDC_AUDIENCE,
    boundSubject,
    // Defense in depth on top of the exact `sub`: the environment claim must match too.
    boundClaims: { environment },
    accessTokenTTL: READER_TOKEN_TTL_S,
    accessTokenMaxTTL: READER_TOKEN_TTL_S,
    accessTokenNumUsesLimit: 0,
  });
  // The reader joins THIS project only. It has no org role, so it sees no other project.
  steps.push({ kind: 'project.membership', projectId: i.projectId, identity: 'reader', role: readerRole });
  steps.push({ kind: 'project.membership', projectId: i.projectId, identity: 'app-writer', role: i.appWriterRole ?? 'no-access' });
  // Legacy shared reader only while ISOLATION_MODE=shared.
  if (i.mode === 'shared') steps.push({ kind: 'project.membership', projectId: i.projectId, identity: 'worker', role: i.workerRole ?? 'viewer' });
  steps.push({
    kind: 'github.environment',
    environment,
    branch: 'main',
    vars: environmentVariables({ orgId: i.orgId, slug: i.slug, readerIdentityId: i.existingReaderIdentityId ?? '<reader identity id>' }),
  });
  return { orgId: i.orgId, slug: i.slug, environment, boundSubject, readerIdentityName: readerIdentityName(i.slug), steps };
}

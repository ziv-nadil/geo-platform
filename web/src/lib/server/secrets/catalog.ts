import 'server-only';
import { ONBOARDING_STEPS, type FieldDef } from '@/config/onboarding';
import { STEP_FOLDERS } from '../infisical';

/**
 * Maps a wizard secret field to its Infisical location. Path and name are derived ONLY from the
 * onboarding config plus the org's own saved (non-secret) answers, never from the request
 * (security.md §2.2 step 5).
 *
 * Field ids:
 *   plain secret field             e.g. "github_token"
 *   secret inside a repeater row   "<repeater>_<index>_<child>", e.g. "analytics_credentials_0_api_key"
 */

export type SecretTarget = {
  stepId: string;
  fieldId: string;
  secretPath: string; // e.g. /cms/wordpress
  secretName: string; // e.g. APP_PASSWORD
  validate: (value: string) => string | null; // error message or null
};

export type ResolveError = { error: string; detail: string };

const NAME_OVERRIDES: Record<string, string> = {
  github_token: 'TOKEN',
  bing_api_key: 'API_KEY',
  gcp_service_account_key: 'SERVICE_ACCOUNT_JSON',
  aws_secret_access_key: 'SECRET_ACCESS_KEY',
  cf_api_token: 'API_TOKEN',
  slack_bot_token: 'BOT_TOKEN',
  slack_webhook_url: 'WEBHOOK_URL',
  slack_config_token: 'CONFIG_TOKEN',
  slack_signing_secret: 'SIGNING_SECRET',
  api_key: 'API_KEY',
};

const CMS_NAMES: Record<string, string> = {
  wordpress: 'APP_PASSWORD',
  ghost: 'ADMIN_API_KEY',
  shopify: 'ADMIN_API_TOKEN',
  wix: 'API_KEY',
};

/** Steps whose secret fields must never enter a machine-readable project (security.md §1.1). */
const HUMAN_ONLY_STEPS = new Set(['access_method']);

const MAX_LEN = 60_000;

function baseValidate(v: string): string | null {
  if (!v || !v.trim()) return 'empty value';
  if (v.length > MAX_LEN) return 'value too long';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)) return 'value contains control characters';
  return null;
}

const SHAPES: Record<string, (v: string) => string | null> = {
  github_token: (v) => (/^(github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,})$/.test(v.trim()) ? null : 'expected a GitHub token (github_pat_... or ghp_...)'),
  gcp_service_account_key: (v) => {
    try {
      const j = JSON.parse(v) as Record<string, unknown>;
      if (j.type !== 'service_account' || typeof j.private_key !== 'string' || typeof j.client_email !== 'string') {
        return 'expected a service account JSON key (type, client_email, private_key)';
      }
      return null;
    } catch {
      return 'expected JSON';
    }
  },
  aws_secret_access_key: (v) => (/^[A-Za-z0-9/+=]{40}$/.test(v.trim()) ? null : 'expected a 40-character AWS secret access key'),
  cf_api_token: (v) => (/^[A-Za-z0-9_-]{30,64}$/.test(v.trim()) ? null : 'expected a Cloudflare API token'),
  slack_webhook_url: (v) => (/^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(v.trim()) ? null : 'expected a Slack incoming webhook URL'),
  slack_config_token: (v) => (/^xoxe\.xoxp-[A-Za-z0-9-]+$/.test(v.trim()) ? null : 'expected a Slack app configuration token (xoxe.xoxp-...)'),
  slack_signing_secret: (v) => (/^[a-f0-9]{32}$/i.test(v.trim()) ? null : 'expected a 32-character Slack signing secret'),
  slack_bot_token: (v) => (/^xoxb-[A-Za-z0-9-]+$/.test(v.trim()) ? null : 'expected a Slack bot token (xoxb-...)'),
};

function findField(fields: FieldDef[], id: string): FieldDef | undefined {
  for (const f of fields) {
    if (f.id === id) return f;
  }
  return undefined;
}

function folderSegment(v: unknown): string | null {
  return typeof v === 'string' && /^[a-z0-9_]{1,40}$/.test(v) ? v : null;
}

export function resolveSecretTarget(stepId: string, fieldId: string, savedData: Record<string, unknown>): SecretTarget | ResolveError {
  const step = ONBOARDING_STEPS.find((s) => s.id === stepId);
  if (!step) return { error: 'unknown_step', detail: stepId };
  if (!/^[a-z0-9_]{1,64}$/.test(fieldId)) return { error: 'unknown_field', detail: fieldId };
  if (HUMAN_ONLY_STEPS.has(stepId)) {
    return { error: 'human_only_secret', detail: 'Interactive logins are stored by ASO Engine staff in the separate -logins vault, not through the wizard.' };
  }
  const folder = STEP_FOLDERS[stepId];
  if (!folder) return { error: 'no_vault_folder', detail: `step ${stepId} does not accept secrets` };

  // Direct secret field
  const direct = findField(step.fields, fieldId);
  if (direct) {
    if (direct.type !== 'secret') return { error: 'not_a_secret_field', detail: fieldId };
    let secretPath = folder;
    let secretName = NAME_OVERRIDES[fieldId] ?? fieldId.toUpperCase();
    if (stepId === 'cms') {
      const cms = folderSegment(savedData.cms_platform);
      if (!cms) return { error: 'save_answers_first', detail: 'Save the CMS choice before entering its credential.' };
      secretPath = `/cms/${cms}`;
      secretName = CMS_NAMES[cms] ?? 'API_TOKEN';
    }
    const shape = SHAPES[fieldId];
    return { stepId, fieldId, secretPath, secretName, validate: (v) => baseValidate(v) ?? (shape ? shape(v) : null) };
  }

  // Secret inside a repeater row
  for (const parent of step.fields) {
    if (parent.type !== 'repeater' || !parent.fields) continue;
    const m = fieldId.match(new RegExp(`^${parent.id}_(\\d{1,2})_([a-z0-9_]+)$`));
    if (!m) continue;
    const child = findField(parent.fields, m[2]);
    if (!child || child.type !== 'secret') return { error: 'not_a_secret_field', detail: fieldId };
    const rows = Array.isArray(savedData[parent.id]) ? (savedData[parent.id] as Record<string, unknown>[]) : [];
    const row = rows[Number(m[1])];
    const vendor = folderSegment(row?.tool);
    if (!vendor) return { error: 'save_answers_first', detail: 'Save the tool for this row before entering its key.' };
    const secretName = NAME_OVERRIDES[child.id] ?? child.id.toUpperCase();
    return { stepId, fieldId, secretPath: `${folder}/${vendor}`, secretName: Number(m[1]) === 0 ? secretName : `${secretName}_${m[1]}`, validate: baseValidate };
  }
  return { error: 'unknown_field', detail: fieldId };
}

/**
 * Secret broker seam (docs/architecture/security.md section 1.5): the crawler job fetches a
 * client's Cloudflare token BY REFERENCE through the broker, never from env or Postgres.
 *
 * The real broker (web/src/lib/server/secrets/broker.ts, owned by the backend/security agents)
 * does not exist yet. Until it is wired with `registerSecretBroker()`, the default broker reports
 * not_configured and the crawler poll skips every org with a clear reason.
 */

export interface BrokerContext {
  /** Trusted org id (from a server-created job), never from user/model input. */
  orgId: string;
  purpose: 'crawler_poll' | 'connection_test';
  jobId: string;
}

export interface SecretRef {
  stepId: string;
  fieldId: string;
}

export interface SecretHandle {
  value: string;
  dispose(): void;
}

export interface SecretBroker {
  readonly configured: boolean;
  /** Resolves the secret for (ctx.orgId, ref); null when the org has no such secret. */
  get(ctx: BrokerContext, ref: SecretRef): Promise<SecretHandle | null>;
}

export class BrokerNotConfiguredError extends Error {
  constructor() {
    super('secrets broker not configured');
    this.name = 'BrokerNotConfiguredError';
  }
}

const notConfiguredBroker: SecretBroker = {
  configured: false,
  async get() {
    throw new BrokerNotConfiguredError();
  },
};

let current: SecretBroker = notConfiguredBroker;

export function registerSecretBroker(b: SecretBroker): void {
  current = b;
}

export function getSecretBroker(): SecretBroker {
  return current;
}

/** Wrap a raw value as a handle that blanks itself on dispose. */
export function handle(value: string): SecretHandle {
  const h = {
    value,
    dispose() {
      h.value = '';
    },
  };
  return h;
}

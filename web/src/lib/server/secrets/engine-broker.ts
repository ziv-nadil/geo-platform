import 'server-only';
import { registerSecretBroker, type SecretBroker } from '@/lib/engines';
import { handle } from '@/lib/engines/crawlers/broker';
import { infisicalConfigured } from '../infisical';
import { readSecret } from './broker';

/** Adapts the backend vault broker (readSecret) to the engines' SecretBroker seam. Called from instrumentation.ts. */
export const backendBroker: SecretBroker = {
  get configured() {
    return 'ok' in infisicalConfigured('worker');
  },
  async get(ctx, ref) {
    const out = await readSecret({ orgId: ctx.orgId, purpose: ctx.purpose === 'crawler_poll' ? 'job' : 'connection_test', jobId: undefined, worker: 'beacon-crawler' }, ref);
    if (out.status === 'ok') return handle(out.value);
    if (out.status === 'missing_secret') return null;
    throw new Error(out.status === 'not_configured' ? 'secrets broker not configured' : 'secrets broker read failed');
  },
};

export function registerBackendBroker(): void {
  registerSecretBroker(backendBroker);
}

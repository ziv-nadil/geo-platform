import 'server-only';
import { withService } from '../db';
import { readSecret } from '../secrets/broker';
import { safeFetch } from '../net/safe-fetch';

export type SlackResult = { status: 'sent' } | { status: 'not_configured'; missing: string[] } | { status: 'error'; message: string };

/**
 * Post to an org's Slack via the secrets broker: an incoming webhook (step `chat`, field `slack_webhook_url`) wins,
 * else the bot token (`slack_bot_token`) + the configured `slack_channel`. Values never leave this function.
 */
export async function sendSlack(orgId: string, text: string): Promise<SlackResult> {
  const ctx = { orgId, purpose: 'job' as const, worker: 'beacon-alerts' };
  try {
    const hook = await readSecret(ctx, { stepId: 'chat', fieldId: 'slack_webhook_url' });
    if (hook.status === 'not_configured') return { status: 'not_configured', missing: hook.missing };
    if (hook.status === 'ok') {
      const r = await safeFetch(hook.value.trim(), { integration: 'slack', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      return r.ok ? { status: 'sent' } : { status: 'error', message: `webhook HTTP ${r.status}` };
    }
    const tok = await readSecret(ctx, { stepId: 'chat', fieldId: 'slack_bot_token' });
    if (tok.status !== 'ok') return { status: 'not_configured', missing: ['slack_webhook_url or slack_bot_token'] };
    const [row] = await withService((sql) => sql`select data->>'slack_channel' as channel from public.onboarding_progress where org_id = ${orgId} and step_id = 'chat'`);
    const channel = (row?.channel as string | null)?.replace(/^#/, '');
    if (!channel) return { status: 'not_configured', missing: ['slack_channel'] };
    const r = await safeFetch('https://slack.com/api/chat.postMessage', {
      integration: 'slack', method: 'POST', headers: { authorization: `Bearer ${tok.value}`, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ channel, text }),
    });
    const body = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    return body?.ok ? { status: 'sent' } : { status: 'error', message: body?.error ?? `HTTP ${r.status}` };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message.slice(0, 200) : 'error' };
  }
}

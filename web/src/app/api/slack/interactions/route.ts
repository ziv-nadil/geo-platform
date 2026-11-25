import { after } from 'next/server';
import { withService } from '@/lib/server/db';
import { readSecret } from '@/lib/server/secrets/broker';
import { approveSuggestion, dbApproveDeps } from '@/lib/server/social-pulse/approve';
import { killSwitchOn } from '@/lib/server/social-pulse/config';
import { parseInteraction, replyInThread, verifySlackSignature } from '@/lib/server/social-pulse/slack';

export const maxDuration = 300;

/**
 * Slack interactivity endpoint (one bot per client). The org is found from the payload's api_app_id, then the request is
 * verified with THAT org's signing secret (from the secrets broker) before anything is acted on. An approval here is the
 * same as an approval in the app: it runs the content pipeline.
 */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const ia = parseInteraction(rawBody);
  if (!ia?.apiAppId) return new Response('bad request', { status: 400 });
  const [org] = await withService((sql) => sql`select org_id from public.social_pulse_settings where slack_app_id = ${ia.apiAppId}`);
  if (!org) return new Response('unauthorized', { status: 401 });
  const orgId = org.org_id as string;
  const secret = await readSecret({ orgId, purpose: 'job', worker: 'beacon-slack-interactions' }, { stepId: 'chat', fieldId: 'slack_signing_secret' });
  if (secret.status !== 'ok' || !verifySlackSignature({ signingSecret: secret.value, timestamp: req.headers.get('x-slack-request-timestamp'), signature: req.headers.get('x-slack-signature'), rawBody })) {
    return new Response('unauthorized', { status: 401 });
  }
  const act = ia.actions.find((a) => a.actionId === 'sp_approve' && /^[0-9a-f-]{36}$/i.test(a.value));
  if (!act) return new Response('', { status: 200 });
  if (killSwitchOn()) return new Response('', { status: 200 });

  // Slack needs a reply within 3 s; the pipeline takes minutes. Acknowledge now, finish after the response.
  const run = async () => {
    const who = { via: 'slack' as const, by: ia.userName ?? ia.userId };
    const out = await approveSuggestion(dbApproveDeps((fn) => withService(fn), orgId), act.value, who);
    const bot = await readSecret({ orgId, purpose: 'job', worker: 'beacon-slack-interactions' }, { stepId: 'chat', fieldId: 'slack_bot_token' });
    if (bot.status === 'ok' && ia.channelId && ia.messageTs) {
      const text = out.status === 'created' ? ':white_check_mark: Approved. The article draft is ready in Beacon (Content).'
        : out.status === 'already_decided' ? 'That title was already decided.' : `:warning: Approved, but content creation failed: ${out.error}`;
      await replyInThread(bot.value, ia.channelId, ia.messageTs, text);
    }
  };
  after(run);
  return new Response('', { status: 200 });
}

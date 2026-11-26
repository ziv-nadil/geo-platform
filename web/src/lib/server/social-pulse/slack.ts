import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { safeJson } from '../net/safe-fetch';
import type { Insight } from './analyze';

/** Slack request signing (https://api.slack.com/authentication/verifying-requests-from-slack): v0=HMAC_SHA256(secret, "v0:ts:body"), 5-minute replay window. */
export function verifySlackSignature(o: { signingSecret: string; timestamp: string | null; signature: string | null; rawBody: string; now?: number }): boolean {
  if (!o.signingSecret || !o.timestamp || !o.signature) return false;
  const ts = Number(o.timestamp);
  if (!Number.isInteger(ts)) return false;
  if (Math.abs((o.now ?? Date.now()) / 1000 - ts) > 300) return false;
  const want = Buffer.from(`v0=${createHmac('sha256', o.signingSecret).update(`v0:${o.timestamp}:${o.rawBody}`).digest('hex')}`);
  const got = Buffer.from(o.signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

export interface SlackInteraction { apiAppId: string | null; userId: string | null; userName: string | null; actions: { actionId: string; value: string }[]; channelId: string | null; messageTs: string | null }

/** Slack posts `payload=<json>` form-encoded. Parse only AFTER the signature check (the app id is read first to pick the right secret). */
export function parseInteraction(rawBody: string): SlackInteraction | null {
  try {
    const payload = new URLSearchParams(rawBody).get('payload');
    if (!payload) return null;
    const p = JSON.parse(payload) as Record<string, unknown> & { user?: { id?: string; username?: string; name?: string }; channel?: { id?: string }; message?: { ts?: string }; actions?: { action_id?: string; value?: string }[] };
    if (p.type !== 'block_actions') return null;
    return {
      apiAppId: typeof p.api_app_id === 'string' ? p.api_app_id : null,
      userId: p.user?.id ?? null, userName: p.user?.username ?? p.user?.name ?? null,
      channelId: p.channel?.id ?? null, messageTs: p.message?.ts ?? null,
      actions: (p.actions ?? []).map((a) => ({ actionId: a.action_id ?? '', value: a.value ?? '' })),
    };
  } catch { return null; }
}

export function buildManifest(appUrl: string, brand: string) {
  return {
    display_information: { name: `${brand} Social pulse`.slice(0, 35), description: 'Daily social insights and content title approvals from GEO Engine.' },
    features: { bot_user: { display_name: `${brand} pulse`.slice(0, 80), always_online: false } },
    oauth_config: { scopes: { bot: ['chat:write', 'chat:write.public', 'channels:read', 'channels:manage', 'channels:join'] } },
    settings: { interactivity: { is_enabled: true, request_url: `${appUrl.replace(/\/$/, '')}/api/slack/interactions` }, org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false },
  };
}

type SlackJson = { ok?: boolean; error?: string; [k: string]: unknown };
async function call(method: string, token: string, body: Record<string, unknown>): Promise<SlackJson> {
  const r = await safeJson<SlackJson>(`https://slack.com/api/${method}`, { integration: 'slack', method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
  return r.data ?? { ok: false, error: `HTTP ${r.status}` };
}

export type SlackStep<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** apps.manifest.create with the client's app configuration token. The bot token still needs the client admin to install the app. */
export async function createSlackApp(configToken: string, appUrl: string, brand: string): Promise<SlackStep<{ appId: string; signingSecret: string; installUrl: string | null }>> {
  const r = await call('apps.manifest.create', configToken, { manifest: JSON.stringify(buildManifest(appUrl, brand)) });
  const creds = (r.credentials ?? {}) as { signing_secret?: string };
  if (!r.ok || typeof r.app_id !== 'string' || !creds.signing_secret) return { ok: false, error: r.error ?? 'manifest_create_failed' };
  return { ok: true, appId: r.app_id, signingSecret: creds.signing_secret, installUrl: typeof r.oauth_authorize_url === 'string' ? r.oauth_authorize_url : null };
}

/** Create the dedicated channel (or find it if it exists) and make sure the bot is in it. */
export async function ensureChannel(botToken: string, name: string): Promise<SlackStep<{ channelId: string }>> {
  const clean = name.replace(/^#/, '').toLowerCase().replace(/[^a-z0-9-_]+/g, '-').slice(0, 80);
  if (!clean) return { ok: false, error: 'channel_name_required' };
  const made = await call('conversations.create', botToken, { name: clean, is_private: false });
  let id = (made.channel as { id?: string } | undefined)?.id;
  if (!made.ok && made.error === 'name_taken') {
    let cursor = '';
    for (let i = 0; i < 10 && !id; i++) {
      const l = await call('conversations.list', botToken, { types: 'public_channel', exclude_archived: true, limit: 200, ...(cursor ? { cursor } : {}) });
      id = (l.channels as { id: string; name: string }[] | undefined)?.find((c) => c.name === clean)?.id;
      cursor = ((l.response_metadata as { next_cursor?: string } | undefined)?.next_cursor) ?? '';
      if (!cursor) break;
    }
  } else if (!made.ok) return { ok: false, error: made.error ?? 'conversations_create_failed' };
  if (!id) return { ok: false, error: 'channel_not_found' };
  await call('conversations.join', botToken, { channel: id });
  return { ok: true, channelId: id };
}

const EMOJI = { positive: ':large_green_circle:', negative: ':red_circle:', mixed: ':large_yellow_circle:', neutral: ':white_circle:' } as const;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function insightBlocks(i: { title: string; summary: string; sentiment: Insight['sentiment']; sources: { url: string; title: string; platform: string }[] }) {
  const links = i.sources.slice(0, 4).map((s) => `<${s.url}|${esc(s.platform)}: ${esc(s.title.slice(0, 50))}>`).join('  ·  ');
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `${EMOJI[i.sentiment]} *${esc(i.title)}*\n${esc(i.summary)}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Sentiment: ${i.sentiment}  ·  ${links}` }] },
  ];
}

export function titleBlocks(titles: { id: string; title: string; rationale: string }[]) {
  return titles.flatMap((t) => [
    { type: 'section', text: { type: 'mrkdwn', text: `*${esc(t.title)}*\n${esc(t.rationale)}` }, accessory: { type: 'button', text: { type: 'plain_text', text: 'Approve' }, style: 'primary', action_id: 'sp_approve', value: t.id } },
  ]);
}

/** One message per insight, with a thread holding the 3 title suggestions and Approve buttons. Returns the parent ts. */
export async function postInsight(botToken: string, channelId: string, insight: Parameters<typeof insightBlocks>[0], titles: Parameters<typeof titleBlocks>[0]): Promise<SlackStep<{ ts: string }>> {
  const parent = await call('chat.postMessage', botToken, { channel: channelId, text: insight.title, blocks: insightBlocks(insight), unfurl_links: false });
  if (!parent.ok || typeof parent.ts !== 'string') return { ok: false, error: parent.error ?? 'post_failed' };
  const reply = await call('chat.postMessage', botToken, { channel: channelId, thread_ts: parent.ts, text: 'Title suggestions', blocks: titleBlocks(titles) });
  if (!reply.ok) return { ok: false, error: reply.error ?? 'thread_post_failed' };
  return { ok: true, ts: parent.ts };
}

export async function replyInThread(botToken: string, channelId: string, threadTs: string, text: string): Promise<void> {
  await call('chat.postMessage', botToken, { channel: channelId, thread_ts: threadTs, text }).catch(() => undefined);
}

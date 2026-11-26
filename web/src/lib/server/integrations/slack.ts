import 'server-only';
import { safeJson } from '../net/safe-fetch';
import { errDetail, result, str, type Check, type Tester } from './types';

const REQUIRED = ['chat:write', 'chat:write.public', 'channels:read', 'channels:join', 'groups:read', 'users:read', 'im:write', 'commands', 'files:write'];

/** chat_auth + chat_post for Slack. Teams needs our Entra app (not configured yet). */
export const test: Tester = async (ctx) => {
  const platform = str(ctx.data.chat_platform);
  if (platform === 'none') return result([], ['No chat tool: reports go by email'], true);
  if (platform === 'teams') return result([], ['MS_TEAMS_CLIENT_ID / MS_TEAMS_CLIENT_SECRET (Teams app not configured yet)'], true);
  const token = await ctx.secret('slack_bot_token');
  if (!token) return result([], ['Slack bot token (Add to Slack install or slack_bot_token)'], true);
  const channel = str(ctx.data.slack_channel)?.replace(/^#/, '');
  const h = { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' };
  const checks: Check[] = [];
  const missing: string[] = [];
  try {
    const a = await safeJson<{ ok: boolean; team?: string; error?: string }>('https://slack.com/api/auth.test', { integration: 'slack', method: 'POST', headers: h });
    const scopes = (a.headers.get('x-oauth-scopes') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const lacking = REQUIRED.filter((s) => !scopes.includes(s));
    checks.push({ id: 'chat_auth', label: 'Bot installed with the right scopes', ok: !!a.data?.ok && lacking.length === 0,
      detail: !a.data?.ok ? `auth.test: ${a.data?.error ?? a.status}` : lacking.length ? `missing ${lacking.join(', ')}` : `workspace ${a.data.team}` });
    lacking.forEach((s) => missing.push(`Slack scope ${s}`));
    if (a.data?.ok && channel) {
      const p = await safeJson<{ ok: boolean; error?: string }>('https://slack.com/api/chat.postMessage', { integration: 'slack', method: 'POST', headers: h, body: JSON.stringify({ channel, text: 'GEO Engine is connected.' }) });
      checks.push({ id: 'chat_post', label: 'Test message delivered', ok: !!p.data?.ok, detail: p.data?.ok ? `posted to #${channel}` : p.data?.error === 'not_in_channel' ? 'Invite @GEO Engine to the channel' : (p.data?.error ?? `HTTP ${p.status}`) });
    } else if (!channel) missing.push('slack_channel');
  } catch (e) {
    checks.push({ id: 'chat_auth', label: 'Bot installed with the right scopes', ok: false, detail: errDetail(e) });
  }
  return result(checks, missing);
};

import 'server-only';
import { accessTokenFor, myChannel, ReauthNeeded, YT_FIELD, youtubeMissing } from '../youtube/google';
import { errDetail, result, str, type Check, type Tester } from './types';

/** youtube_connected: the stored refresh token (put there by the OAuth consent) still works and points at a channel. */
export const test: Tester = async (ctx) => {
  const miss = youtubeMissing();
  if (miss.length) return result([], miss, true);
  const rt = await ctx.secret(YT_FIELD);
  if (!rt) return result([], ['Connect the channel from the YouTube tab (one-time Google consent)'], true);
  const checks: Check[] = [];
  try {
    const at = await accessTokenFor(rt);
    checks.push({ id: 'youtube_token', label: 'Refresh token works', ok: true });
    const ch = await myChannel(at);
    const want = str(ctx.data.youtube_channel_name);
    checks.push({ id: 'youtube_channel', label: 'Channel reachable', ok: !!ch, detail: ch ? `${ch.title}${want && !ch.title.toLowerCase().includes(want.toLowerCase()) ? ` (expected "${want}")` : ''}` : 'channels.list returned no channel; pick the Brand Account channel when connecting' });
  } catch (e) {
    checks.push({ id: 'youtube_token', label: 'Refresh token works', ok: false, detail: e instanceof ReauthNeeded ? 'Access was revoked or expired. Reconnect from the YouTube tab.' : errDetail(e) });
  }
  return result(checks);
};

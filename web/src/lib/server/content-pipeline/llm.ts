import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { allowlistedFetch } from '../../engines/http';

export const CONTENT_MODEL = 'claude-sonnet-5-5';

export type LlmJson =
  | { status: 'ok'; data: unknown; usage: { input: number; output: number } }
  | { status: 'not_configured'; missing: string[] }
  | { status: 'error'; message: string };

/** One structured-output call. Server-side fallback is opted in; a refusal chain surfaces as an error. */
export async function claudeJson(o: { system: string; user: string; schema: Record<string, unknown>; maxTokens?: number; effort?: 'low' | 'medium' | 'high' }): Promise<LlmJson> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { status: 'not_configured', missing: ['ANTHROPIC_API_KEY'] };
  try {
    const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 240_000, fetch: allowlistedFetch('anthropic', { timeoutMs: 240_000 }) });
    const msg = await client.beta.messages.create({
      model: CONTENT_MODEL, max_tokens: o.maxTokens ?? 16_000, system: o.system,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      messages: [{ role: 'user', content: o.user }],
      output_config: { effort: o.effort ?? 'medium', format: { type: 'json_schema', schema: o.schema } },
    });
    if (msg.stop_reason === 'refusal') return { status: 'error', message: 'The model declined this request.' };
    if (msg.stop_reason === 'max_tokens') return { status: 'error', message: 'The response was cut off. Try a shorter length.' };
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return { status: 'ok', data: JSON.parse(text), usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message.slice(0, 200) : 'Model call failed' };
  }
}

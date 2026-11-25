/**
 * Cheap LLM judge used by analysis (adjudication, entity/rank extraction, sentiment, domain
 * classification). Structured JSON output, low effort. Picks a vendor different from the engine
 * being judged when both keys exist (methodology section 3.6: avoid self-preference).
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ANTHROPIC_PRICES, ENGINE_DEFAULTS, OPENAI_PRICES, priceFor, tokenCost } from '../engines/config';
import { allowlistedFetch } from '../engines/http';
import { toEngineError } from '../engines/retry';
import type { EngineId } from '../engines/types';

export interface JudgeCall {
  /** Short task name for logs. */
  task: string;
  system: string;
  user: string;
  /** JSON schema of the expected object (additionalProperties false, all required). */
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export interface LlmJudge {
  readonly vendor: 'anthropic' | 'openai';
  readonly model: string;
  json(call: JudgeCall): Promise<{ data: unknown; costUsd: number }>;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function createAnthropicJudge(apiKey: string, model = ENGINE_DEFAULTS.judge.anthropicModel()): LlmJudge {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000, fetch: allowlistedFetch('anthropic', { timeoutMs: 60_000 }) });
  return {
    vendor: 'anthropic',
    model,
    async json(call) {
      try {
        const msg = await client.messages.create({
          model,
          max_tokens: call.maxTokens ?? 1024,
          system: call.system,
          messages: [{ role: 'user', content: call.user }],
          output_config: { effort: 'low', format: { type: 'json_schema', schema: call.schema } },
        });
        if (msg.stop_reason === 'refusal') throw new Error('judge refusal');
        const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
        const costUsd = tokenCost(priceFor(ANTHROPIC_PRICES, model), msg.usage.input_tokens, msg.usage.output_tokens);
        return { data: JSON.parse(text), costUsd };
      } catch (err) {
        throw toEngineError(err, `judge:${call.task}`);
      }
    },
  };
}

export function createOpenAIJudge(apiKey: string, model = ENGINE_DEFAULTS.judge.openaiModel()): LlmJudge {
  const client = new OpenAI({ apiKey, maxRetries: 2, timeout: 60_000, fetch: allowlistedFetch('openai', { timeoutMs: 60_000 }) });
  return {
    vendor: 'openai',
    model,
    async json(call) {
      try {
        const resp = await client.responses.create({
          model,
          instructions: call.system,
          input: call.user,
          max_output_tokens: call.maxTokens ?? 1024,
          reasoning: { effort: 'low' },
          text: { format: { type: 'json_schema', name: call.task.replace(/[^a-zA-Z0-9_-]/g, '_'), schema: call.schema, strict: true } },
          store: false,
        });
        const costUsd = tokenCost(priceFor(OPENAI_PRICES, model), resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0);
        return { data: JSON.parse(resp.output_text), costUsd };
      } catch (err) {
        throw toEngineError(err, `judge:${call.task}`);
      }
    },
  };
}

/** Judge for analysing an answer produced by `engine`; null when no judge key is configured. */
export function pickJudge(engine: EngineId): LlmJudge | null {
  const anthropicKey = env('ANTHROPIC_API_KEY');
  const openaiKey = env('OPENAI_API_KEY');
  if (engine === 'claude' && openaiKey) return createOpenAIJudge(openaiKey);
  if (engine === 'chatgpt' && anthropicKey) return createAnthropicJudge(anthropicKey);
  if (anthropicKey) return createAnthropicJudge(anthropicKey);
  if (openaiKey) return createOpenAIJudge(openaiKey);
  return null;
}

import { createAnthropicAdapter } from './adapters/anthropic';
import { createDataForSeoAdapter } from './adapters/dataforseo';
import { createGeminiAdapter } from './adapters/gemini';
import { createOpenAIAdapter } from './adapters/openai';
import { createPerplexityAdapter } from './adapters/perplexity';
import { ENGINE_IDS, type EngineAdapter, type EngineId, type EngineStatus } from './types';

const factories: Record<EngineId, () => EngineAdapter> = {
  chatgpt: createOpenAIAdapter,
  perplexity: createPerplexityAdapter,
  gemini: createGeminiAdapter,
  claude: createAnthropicAdapter,
  google_aio: () => createDataForSeoAdapter('google_aio'),
  google_ai_mode: () => createDataForSeoAdapter('google_ai_mode'),
};

const cache = new Map<EngineId, EngineAdapter>();

export function getAdapter(id: EngineId): EngineAdapter {
  let a = cache.get(id);
  if (!a) {
    a = factories[id]();
    cache.set(id, a);
  }
  return a;
}

/** Configuration status of every engine; safe to expose to admins (names of env vars only). */
export function engineStatuses(): Record<EngineId, EngineStatus> {
  const out = {} as Record<EngineId, EngineStatus>;
  for (const id of ENGINE_IDS) out[id] = getAdapter(id).status();
  return out;
}

export function configuredEngines(): EngineId[] {
  return ENGINE_IDS.filter((id) => getAdapter(id).status().status === 'configured');
}

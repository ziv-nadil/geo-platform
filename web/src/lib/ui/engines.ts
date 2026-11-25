import { SERIES } from "./chart-colors";
import type { Engine, EngineId } from "./data-types";

/** Display metadata for engines (names and fixed chart colors). The list of enabled engines comes from the DB. */
export const ENGINES: Engine[] = [
  { id: "chatgpt", name: "ChatGPT", short: "ChatGPT", vendor: "OpenAI", color: SERIES[0] },
  { id: "perplexity", name: "Perplexity", short: "Perplexity", vendor: "Perplexity AI", color: SERIES[1] },
  { id: "gemini", name: "Gemini", short: "Gemini", vendor: "Google", color: SERIES[2] },
  { id: "claude", name: "Claude", short: "Claude", vendor: "Anthropic", color: SERIES[3] },
  { id: "google_aio", name: "Google AI Overviews", short: "AI Overviews", vendor: "Google", color: SERIES[4] },
  { id: "google_ai_mode", name: "Google AI Mode", short: "AI Mode", vendor: "Google", color: SERIES[6] },
];

export const ENGINE_IDS = ENGINES.map((e) => e.id);

export function engineMeta(id: EngineId): Engine {
  return ENGINES.find((e) => e.id === id) ?? { id, name: id, short: id, vendor: "", color: SERIES[7] };
}

/** Backwards-compatible lookup object. */
export const ENGINE_BY_ID = new Proxy({} as Record<string, Engine>, { get: (_t, k: string) => engineMeta(k) });

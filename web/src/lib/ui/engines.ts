import { SERIES } from "@/lib/ui/chart-colors";
import type { Engine, EngineId } from "./data-types";

export const ENGINES: Engine[] = [
  { id: "chatgpt", name: "ChatGPT", short: "ChatGPT", vendor: "OpenAI", color: SERIES[0] },
  { id: "perplexity", name: "Perplexity", short: "Perplexity", vendor: "Perplexity AI", color: SERIES[1] },
  { id: "gemini", name: "Gemini", short: "Gemini", vendor: "Google", color: SERIES[2] },
  { id: "claude", name: "Claude", short: "Claude", vendor: "Anthropic", color: SERIES[3] },
  { id: "google_aio", name: "Google AI Overviews", short: "AI Overviews", vendor: "Google", color: SERIES[4] },
];

export const ENGINE_BY_ID = Object.fromEntries(ENGINES.map((e) => [e.id, e])) as Record<EngineId, Engine>;
export const ENGINE_IDS = ENGINES.map((e) => e.id);

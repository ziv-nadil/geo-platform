import { ENGINE_IDS } from "./engines";
import type { EngineId, Filters } from "./data-types";

type SP = Record<string, string | string[] | undefined>;

/** Parse the shared ?range=&engine= query params. */
export function parseFilters(sp: SP): Filters {
  const r = Number(Array.isArray(sp.range) ? sp.range[0] : sp.range);
  const e = Array.isArray(sp.engine) ? sp.engine[0] : sp.engine;
  return { range: r === 7 || r === 14 ? r : 30, engine: e && (ENGINE_IDS as string[]).includes(e) ? (e as EngineId) : "all" };
}

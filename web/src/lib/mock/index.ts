/**
 * Demo data-access layer. Every export is async and takes the org id plus filters, matching
 * the shape the Supabase-backed layer will expose (see docs/design/design-system.md, "Data
 * layer"). To switch to real data, re-implement these functions against Supabase and keep
 * the signatures; pages import only from "@/lib/mock" (later "@/lib/data").
 */
export * from "./analytics";
export * from "./ops";
export { ENGINES, ENGINE_BY_ID, ENGINE_IDS } from "@/lib/ui/engines";
export { onboardingPlaceholders } from "./catalog";
export type * from "@/lib/ui/data-types";

import { ENGINE_IDS } from "@/lib/ui/engines";
import type { EngineId, Filters } from "@/lib/ui/data-types";

export const IS_DEMO_DATA = true;

type SP = Record<string, string | string[] | undefined>;

/** Parse the shared ?range=&engine= query params into Filters. */
export function parseFilters(sp: SP): Filters {
  const r = Number(Array.isArray(sp.range) ? sp.range[0] : sp.range);
  const e = Array.isArray(sp.engine) ? sp.engine[0] : sp.engine;
  return {
    range: r === 7 || r === 14 ? r : 30,
    engine: e && (ENGINE_IDS as string[]).includes(e) ? (e as EngineId) : "all",
  };
}

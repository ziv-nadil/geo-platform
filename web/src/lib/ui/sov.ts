import { COMPETITOR_SERIES } from "@/lib/ui/chart-colors";
import type { SovRow } from "@/lib/ui/data-types";

export interface TrackedCompetitor {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
}

/**
 * Share-of-voice rows come from mentions, so a competitor that was just added (no runs yet) has no
 * row. Merge the tracked list in: active competitors without mentions appear with zeros, and
 * competitors the user stopped tracking are dropped even if they have historical mentions.
 */
export function withTrackedCompetitors(rows: SovRow[], tracked: TrackedCompetitor[]): SovRow[] {
  const inactive = new Set(tracked.filter((c) => !c.active).map((c) => c.id));
  const kept = rows.filter((r) => !inactive.has(r.id));
  const have = new Set(kept.map((r) => r.id));
  let slot = kept.filter((r) => !r.isBrand).length;
  const added: SovRow[] = tracked
    .filter((c) => c.active && !have.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color ?? COMPETITOR_SERIES[slot++ % COMPETITOR_SERIES.length]!,
      isBrand: false,
      sov: 0,
      sovPrev: null,
      mentions: 0,
      avgPosition: null,
      sentiment: null,
    }));
  return [...kept, ...added];
}

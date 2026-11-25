/**
 * Social pulse configuration. Actor ids were checked in the Apify store on 2026-11-25 (public-data actors, no login, no cookies).
 * Prices are pay-per-event and can change; the real cost is always read back from the Apify run (usageTotalUsd).
 */
export type Platform = 'reddit' | 'x' | 'linkedin';
export const PLATFORMS: Platform[] = ['reddit', 'x', 'linkedin'];

export const ACTORS: Record<Platform, { id: string; label: string; note: string }> = {
  reddit: { id: 'apify/reddit-scraper', label: 'Reddit', note: 'Official Apify actor; public search, no login.' },
  x: { id: 'apidojo/tweet-scraper', label: 'X', note: 'Tweet Scraper V2 (most used X actor in the store); public search, no login.' },
  linkedin: { id: 'harvestapi/linkedin-post-search', label: 'LinkedIn', note: 'Post search, "No Cookies" actor; public posts only.' },
};

export const ANALYSIS_MODEL = 'claude-haiku-5-5';
export const WINDOW_HOURS = 24;
export const MAX_KEYWORDS = 6;
export const DEFAULT_MAX_ITEMS = 30;
/** Conservative USD estimate per returned item, per platform (docs/ops/costs.md), used for pre-run budget checks only. */
export const EST_USD_PER_ITEM: Record<Platform, number> = { reddit: 0.004, x: 0.0004, linkedin: 0.002 };
export const EST_USD_PER_RUN_START = 0.002;

/** Global kill switch: set SOCIAL_PULSE_DISABLED=1 to stop all Apify spend and all Slack posting from the agent. */
export function killSwitchOn(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|yes|on)$/i.test((env.SOCIAL_PULSE_DISABLED ?? '').trim());
}

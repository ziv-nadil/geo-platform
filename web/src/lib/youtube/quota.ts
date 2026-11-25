/** YouTube Data API quota model (docs/research/youtube-engine.md section 3). Pure. */
export type QuotaModel = 'current' | 'legacy';

/** Cost per call. `insertPool` is the pool the insert is drawn from. */
export const QUOTA_COSTS: Record<QuotaModel, { insert: number; insertPool: 'uploads' | 'main'; thumbnail: number; caption: number; playlistItem: number; update: number; comment: number }> = {
  current: { insert: 1, insertPool: 'uploads', thumbnail: 50, caption: 400, playlistItem: 50, update: 50, comment: 50 },
  legacy: { insert: 1600, insertPool: 'main', thumbnail: 50, caption: 400, playlistItem: 50, update: 50, comment: 50 },
};
export const DAILY_MAIN_POOL = 10_000;
export const DAILY_UPLOAD_CALLS = 100;

export interface UploadPlan { captions: boolean; thumbnail: boolean; playlist: boolean; syntheticFollowup: boolean; linkComment: boolean }
export const FULL_PLAN: UploadPlan = { captions: true, thumbnail: true, playlist: true, syntheticFollowup: true, linkComment: false };

/** Units one video draws from the main pool (plus the insert when the model charges the main pool). */
export function videoCost(plan: UploadPlan, model: QuotaModel = 'current'): number {
  const c = QUOTA_COSTS[model];
  return (c.insertPool === 'main' ? c.insert : 0) + (plan.thumbnail ? c.thumbnail : 0) + (plan.captions ? c.caption : 0)
    + (plan.playlist ? c.playlistItem : 0) + (plan.syntheticFollowup ? c.update : 0) + (plan.linkComment ? c.comment : 0);
}

/** How many videos fit in what is left of today's budget (both pools). */
export function videosAffordable(plan: UploadPlan, model: QuotaModel, usedMain: number, usedUploads: number): number {
  const per = videoCost(plan, model);
  const byMain = per === 0 ? Infinity : Math.floor(Math.max(0, DAILY_MAIN_POOL - usedMain) / per);
  const byUploads = QUOTA_COSTS[model].insertPool === 'uploads' ? Math.max(0, DAILY_UPLOAD_CALLS - usedUploads) : Infinity;
  return Math.min(byMain, byUploads);
}

export function quotaModelFromEnv(v: string | undefined): QuotaModel { return v === 'legacy' ? 'legacy' : 'current'; }

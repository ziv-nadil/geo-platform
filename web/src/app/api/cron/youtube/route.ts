import { handleJobCron } from '@/lib/server/jobs/cron';

export const maxDuration = 300;

/**
 * YouTube engine tick (every 15 minutes via GitHub Actions). Per connected channel, in order:
 *   1. upload rendered videos (quota-checked)   2. TTS + images for approved videos
 *   3. auto mode: approve clean drafts           4. draft one new video per day from an eligible article
 * Rendering itself runs in the youtube-render GitHub Actions job (ffmpeg), not here.
 * ISOLATION_MODE=per_client dispatches one client-job.yml run per org; shared runs inline.
 */
const handle = (req: Request) => handleJobCron('youtube', req, { budgetMs: 230_000 });

export const GET = handle;
export const POST = handle;

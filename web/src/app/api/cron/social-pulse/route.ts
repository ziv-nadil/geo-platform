import { handleJobCron } from '@/lib/server/jobs/cron';
import { killSwitchOn } from '@/lib/server/social-pulse/config';

export const maxDuration = 300;

/** Hourly tick. Each enabled org has a stable UTC hour (hash of its id), so runs are staggered and each org runs once a day.
 *  ISOLATION_MODE=per_client dispatches one client-job.yml run per due org; shared runs inline. */
const handle = (req: Request) =>
  handleJobCron('social-pulse', req, {
    requiredEnv: ['APIFY_TOKEN', 'ANTHROPIC_API_KEY'],
    skip: () => (killSwitchOn() ? Response.json({ status: 'skipped', message: 'SOCIAL_PULSE_DISABLED' }) : null),
  });

export const GET = handle;
export const POST = handle;

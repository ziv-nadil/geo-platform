import { handleJobCron } from '@/lib/server/jobs/cron';

export const maxDuration = 300;

/** Planner cron: per org, honours content_settings (cadence off/daily/weekly; mode approve/auto). Auto mode only ever creates CMS drafts.
 *  ISOLATION_MODE=per_client dispatches one client-job.yml run per due org; shared runs inline. */
const handle = (req: Request) => handleJobCron('content', req, { requiredEnv: ['ANTHROPIC_API_KEY'] });

export const GET = handle;
export const POST = handle;

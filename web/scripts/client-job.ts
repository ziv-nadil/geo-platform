/**
 * Per-client job entry point, run ONLY by .github/workflows/client-job.yml inside GitHub environment client-<slug>:
 *   node --conditions=react-server --import tsx scripts/client-job.ts
 * Exit 0 on ok/skipped, 1 on refused/not_configured/error. Prints a JSON summary (never secret values).
 */
import { runClientJob } from '@/lib/server/jobs/runner';

runClientJob()
  .then((r) => {
    console.log(JSON.stringify(r).slice(0, 4000));
    process.exit(r.status === 'ok' || r.status === 'skipped' ? 0 : 1);
  })
  .catch((e: unknown) => {
    console.error(JSON.stringify({ status: 'error', error: e instanceof Error ? e.message.slice(0, 300) : 'error' }));
    process.exit(1);
  });

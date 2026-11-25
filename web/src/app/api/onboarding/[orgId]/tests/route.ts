import { json } from '@/lib/server/auth';
import { POST as runOne } from '../test/[stepId]/route';

export const maxDuration = 60;

/** Alias for the frontend's api-client contract: POST { stepId } -> same as /test/[stepId]. */
export async function POST(request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { stepId?: unknown };
  if (typeof body.stepId !== 'string') return json({ error: 'stepId required' }, 400);
  return runOne(request, { params: Promise.resolve({ orgId, stepId: body.stepId }) });
}

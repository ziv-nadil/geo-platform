import { NextResponse } from 'next/server';
import { isUuid, json, notConfiguredResponse, requireOrgAccess } from '@/lib/server/auth';
import { authUrl, signState, youtubeMissing } from '@/lib/server/youtube/google';

/** Starts the one-time per-channel consent. Admin only. GET /api/youtube/oauth/start?org=<orgId> redirects to Google. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url), orgId = url.searchParams.get('org') ?? '';
  if (!isUuid(orgId)) return json({ error: 'bad_request' }, 400);
  const a = await requireOrgAccess(orgId, 'admin');
  if (!a.ok) return a.response;
  const miss = youtubeMissing(); if (miss.length) return notConfiguredResponse(miss);
  return NextResponse.redirect(authUrl(url.origin, await signState(orgId, a.userId)));
}

import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/server/auth';
import { withService } from '@/lib/server/db';
import { upsertSecret } from '@/lib/server/infisical';
import { exchangeCode, myChannel, verifyState, YT_FIELD, YT_STEP } from '@/lib/server/youtube/google';

/** Google redirects here. State is a signed 10 minute token bound to org and user; the refresh token goes straight to the vault. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const back = (orgSlug: string | null, q: string) => NextResponse.redirect(new URL(`/app/${orgSlug ?? ''}/youtube?${q}`, url.origin));
  const st = await verifyState(url.searchParams.get('state') ?? '');
  if (!st) return NextResponse.redirect(new URL('/app', url.origin));
  const org = await withService(async (sql) => (await sql`select slug, infisical_project_id from public.organizations where id = ${st.orgId}`)[0]);
  const slug = (org?.slug as string | undefined) ?? null;
  const a = await requireOrgAccess(st.orgId, 'admin');
  if (!a.ok || a.userId !== st.userId) return back(slug, 'yt=denied');
  const code = url.searchParams.get('code');
  if (url.searchParams.get('error') || !code) return back(slug, 'yt=cancelled');
  if (!org?.infisical_project_id) return back(slug, 'yt=no_vault');
  const t = await exchangeCode(url.origin, code);
  if ('error' in t) return back(slug, `yt=error&msg=${encodeURIComponent(t.error)}`);
  const ch = await myChannel(t.accessToken);
  if (!ch) return back(slug, 'yt=no_channel');
  try {
    const w = await upsertSecret({ projectId: org.infisical_project_id as string, secretPath: '/youtube', secretName: 'REFRESH_TOKEN', value: t.refreshToken, stepId: YT_STEP });
    if (w.status === 'not_configured') return back(slug, 'yt=no_vault');
    await withService(async (sql) => {
      await sql`insert into public.secret_refs (org_id, step_id, field_id, infisical_project_id, secret_path, secret_name, infisical_secret_version, created_by)
        values (${st.orgId}, ${YT_STEP}, ${YT_FIELD}, ${org.infisical_project_id}, '/youtube', 'REFRESH_TOKEN', ${w.version}, ${st.userId})
        on conflict (org_id, step_id, field_id) do update set infisical_secret_version = excluded.infisical_secret_version, test_status = null, test_message = null, last_tested_at = null`;
      await sql`insert into public.youtube_channels (org_id, status, channel_id, channel_title, connected_at, last_error) values (${st.orgId}, 'connected', ${ch.id}, ${ch.title}, now(), null)
        on conflict (org_id) do update set status = 'connected', channel_id = excluded.channel_id, channel_title = excluded.channel_title, connected_at = now(), last_error = null`;
    });
  } catch { return back(slug, 'yt=vault_failed'); }
  return back(slug, 'yt=connected');
}

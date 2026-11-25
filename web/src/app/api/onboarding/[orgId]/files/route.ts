import { randomUUID } from 'node:crypto';
import { ONBOARDING_STEPS } from '@/config/onboarding';
import { auditEvent, checkOrigin, json, notConfiguredResponse, rateLimited, requireOrgAccess } from '@/lib/server/auth';
import { withRls } from '@/lib/server/db';
import { createSupabaseAdminClient } from '@/lib/server/supabase/admin';
import { MAX_HTML_BYTES, MAX_IMAGE_BYTES, sniffUpload, svgIsSafe } from '@/lib/server/uploads';

/**
 * POST /api/onboarding/[orgId]/files   multipart: stepId, fieldId, file   (member+)
 *  - images (png/jpeg/gif/webp/ico/svg, <= 5 MB) -> private bucket `brand-assets`, metadata in public.brand_assets
 *  - design-system HTML (<= 2 MB)               -> private bucket `untrusted-html` at <org>/<uuid>.html
 * Type is decided by magic bytes. Zip is rejected. Nothing uploaded is ever served from the app origin.
 */
export async function POST(request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const bad = checkOrigin(request);
  if (bad) return bad;
  const auth = await requireOrgAccess(orgId, 'member');
  if (!auth.ok) return auth.response;
  if (rateLimited(`upload:${orgId}:${auth.userId}`, 30, 60_000)) return json({ error: 'rate_limited' }, 429);

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const stepId = String(form?.get('stepId') ?? '');
  const fieldId = String(form?.get('fieldId') ?? '');
  if (!(file instanceof File)) return json({ error: 'file_required' }, 400);
  const step = ONBOARDING_STEPS.find((s) => s.id === stepId);
  const field = step?.fields.find((f) => f.id === fieldId);
  if (!step || !field || field.type !== 'file') return json({ error: 'unknown_field' }, 400);
  if (file.size > Math.max(MAX_IMAGE_BYTES, MAX_HTML_BYTES)) return json({ error: 'file_too_large' }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniff = sniffUpload(bytes);
  if (!sniff.ok) return json({ error: sniff.error }, 415);
  if (sniff.kind === 'html' && fieldId !== 'design_system_html') return json({ error: 'html_not_allowed_here' }, 415);
  if (sniff.kind === 'image' && fieldId === 'design_system_html') return json({ error: 'html_required' }, 415);
  if (bytes.length > (sniff.kind === 'html' ? MAX_HTML_BYTES : MAX_IMAGE_BYTES)) return json({ error: 'file_too_large' }, 413);
  if (sniff.mime === 'image/svg+xml' && !svgIsSafe(bytes)) return json({ error: 'svg_active_content' }, 415);

  const admin = createSupabaseAdminClient();
  if (!admin) return notConfiguredResponse(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY']);

  const bucket = sniff.kind === 'html' ? 'untrusted-html' : 'brand-assets';
  const path = `${orgId}/${randomUUID()}.${sniff.ext}`;
  const up = await admin.storage.from(bucket).upload(path, bytes, { contentType: sniff.mime, upsert: false });
  if (up.error) return json({ error: 'storage_failed' }, 502);

  if (bucket === 'brand-assets') {
    const safeName = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || `${fieldId}.${sniff.ext}`;
    try {
      await withRls(auth.claims, (sql) => sql`
        insert into public.brand_assets (org_id, kind, storage_path, filename, mime_type, size_bytes)
        values (${orgId}, ${fieldId.startsWith('logo') ? 'logo' : 'image'}, ${path}, ${safeName}, ${sniff.mime}, ${bytes.length})`);
    } catch {
      await admin.storage.from(bucket).remove([path]);
      return json({ error: 'forbidden' }, 403);
    }
  }
  await auditEvent({ orgId, caller: auth, action: 'onboarding.file_uploaded', targetType: 'field', targetId: `${stepId}.${fieldId}`, metadata: { bucket, bytes: bytes.length } });
  return json({ ok: true, path, bucket });
}

/**
 * Storage paths stored in client-writable rows (reports.storage_path, content_items.images[].path,
 * youtube_videos.*_path / scene_assets) are only used with the service role after this check: the path must
 * sit under the row's own org folder. Without it a member could point a row at another org's object and get
 * it signed, downloaded or uploaded for them (cross-tenant read).
 */
export function ownedPath(orgId: string, path: unknown): string | null {
  if (typeof path !== 'string' || !orgId || !path.startsWith(`${orgId}/`)) return null;
  if (path.includes('\\') || path.includes('//') || path.split('/').some((s) => s === '..' || s === '.')) return null;
  return path;
}

-- Security review 2 (H3): storage paths in client-writable rows must stay inside the row's own org folder.
-- The app signs / downloads these with the service role; a member could otherwise point a row at another
-- org's object (cross-tenant read). The app checks too (web/src/lib/server/storage-path.ts); this is the DB backstop.
-- content_items.images and youtube_videos.scene_assets are jsonb arrays and are checked in the app only.

create or replace function private.path_in_org(p text, org uuid)
returns boolean language sql immutable set search_path = '' as $$
  select p is null or (split_part(p, '/', 1) = org::text and p !~ '(^|/)\.\.?(/|$)' and p !~ '//' and position(E'\\' in p) = 0)
$$;
revoke all on function private.path_in_org(text, uuid) from public, anon;
grant execute on function private.path_in_org(text, uuid) to authenticated;  -- pure; evaluated by the check constraints on client writes

alter table public.reports
  add constraint reports_storage_path_in_org check (private.path_in_org(storage_path, org_id));

alter table public.youtube_videos
  add constraint youtube_videos_paths_in_org check (
    private.path_in_org(audio_path, org_id) and private.path_in_org(video_path, org_id) and private.path_in_org(thumb_path, org_id));

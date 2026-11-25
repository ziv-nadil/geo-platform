-- YouTube engine: one educational channel per client (separate from the main channel) that turns approved
-- articles into short videos whose main value is metadata. The OAuth refresh token lives in the secrets
-- broker (secret_refs step 'youtube', field 'youtube_refresh_token'), never here.

create table public.youtube_channels (
  org_id            uuid primary key references public.organizations (id) on delete cascade,
  status            text not null default 'not_connected' check (status in ('not_connected', 'connected', 'reauth_needed')),
  channel_id        text,
  channel_title     text,
  persona_name      text not null default '',          -- branded presenter, never a real person
  persona_blurb     text not null default '',
  mode              text not null default 'approve' check (mode in ('approve', 'auto')),  -- auto = upload approved-by-default as private
  privacy           text not null default 'private' check (privacy in ('private', 'unlisted', 'public')),
  default_playlist  text,                              -- playlist id
  daily_limit       integer not null default 1 check (daily_limit between 0 and 10),
  connected_at      timestamptz,
  last_error        text,
  updated_at        timestamptz not null default now()
);
create trigger youtube_channels_updated_at before update on public.youtube_channels
  for each row execute function private.tg_set_updated_at();
select private.apply_tenant_rls('public.youtube_channels', 'admin', 'admin');

create table public.youtube_videos (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  content_item_id   uuid not null references public.content_items (id) on delete cascade,
  status            text not null default 'draft' check (status in (
                      'draft', 'approved', 'assets_ready', 'rendering', 'rendered', 'uploading', 'uploaded', 'failed', 'rejected')),
  script            jsonb not null default '{}'::jsonb,   -- {hook, scenes:[{text, visual, imagePrompt, chartId}], outro}
  metadata          jsonb not null default '{}'::jsonb,   -- {title, titleVariants, description, tags, categoryId, playlist, chapters, thumbnailPrompt}
  srt               text,
  audio_path        text,                                 -- youtube-assets bucket
  scene_assets      jsonb not null default '[]'::jsonb,   -- [{index, path, kind, startSec, endSec}]
  video_path        text,
  thumb_path        text,
  duration_sec      numeric,
  youtube_video_id  text,
  privacy_status    text,                                 -- what YouTube reports back
  upload_status     text,
  quota_units       integer not null default 0,
  error             text,
  approved_by       uuid references auth.users (id) on delete set null,
  approved_at       timestamptz,
  uploaded_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index youtube_videos_item_uniq on public.youtube_videos (content_item_id) where status <> 'rejected';
create index youtube_videos_org_idx on public.youtube_videos (org_id, status, created_at desc);
create trigger youtube_videos_updated_at before update on public.youtube_videos
  for each row execute function private.tg_set_updated_at();
select private.apply_tenant_rls('public.youtube_videos');

-- Private bucket for audio, scene images, rendered video and thumbnails. Writes are service-role only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('youtube-assets', 'youtube-assets', false, 209715200,
        array['image/png', 'image/jpeg', 'image/webp', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'video/mp4', 'text/plain', 'application/x-subrip'])
on conflict (id) do update set public = false;

create policy "youtube-assets: members read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'youtube-assets'
    and (select private.can_read(private.try_uuid((storage.foldername(name))[1])))
  );

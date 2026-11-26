# YouTube engine: constraints, research and setup

Goal: one YouTube channel per client, separate from the client's main channel, run as an industry-expert-style educational channel. Daily, an approved article becomes a 60 to 120 s video. The video itself is cheap; the value is the METADATA (titles, descriptions with links to the source blog post, chapters, tags, captions, playlists, pinned link) that supports the client's blog and GEO.

Research date: 2026-11-25. Sources are Google's own docs where possible; secondary sources are marked. Anything that conflicts is flagged, and the code reads its numbers from `web/src/lib/youtube/quota.ts` so a change is one edit.

## 1. Channel creation cannot be automated

The YouTube Data API v3 has no `channels.insert`. A channel only exists once a human signs in to YouTube with a Google identity and creates it. Therefore a one-time manual checklist per client (also shown in the app's YouTube tab and in the onboarding step):

1. Pick (or create) a Google account owned by the client, for example `youtube@client.com`. It must be the client's, not the agency's.
2. Sign in at youtube.com, click the avatar, "Create a channel" (or Settings > Add or manage your channel(s) > Create a new channel). Choose a **Brand Account** (a channel not tied to a personal name) so ownership can move between people and the client can add managers without sharing a password.
3. Channel name: `<Brand> Insights` or `<Brand> Academy` (a branded name, never a person's name). Handle: `@<brand>insights`. Keep it distinct from the main brand channel, if there is one.
4. Persona (set in the app): a **branded presenter persona**, for example "ASO Engine Insights Desk, the AI presenter of Acme's research team". Put the persona and the AI disclosure in the channel About text: "Videos here are narrated by an AI voice and written by Acme's team. Sources are linked in every description."
5. Fill About, links (blog URL first), banner, avatar (client brand assets), country, default upload settings: category "Education" (27) or "Science & Technology" (28), language, "Made for kids: No".
6. Verify the channel by phone (needed for custom thumbnails and videos over 15 minutes).
7. Create playlists by topic (the engine can create more later; one per blog category is the default).
8. OAuth consent, once: in the app, YouTube tab > "Connect channel". Sign in with the Brand Account owner, **choose the Brand Account channel in the account picker**, and accept the requested scopes. The refresh token is stored in the secrets broker (Infisical), never in the database.
9. Confirm the connected channel title shown in the app matches. Done: uploads are hands-free from here.

Agency prerequisites (one Google Cloud project for the whole platform, not per client):
- Enable "YouTube Data API v3". Create an OAuth client (type Web), redirect URI `https://<app>/api/youtube/oauth/callback`.
- Scopes: `youtube.upload`, `youtube.force-ssl` (thumbnails.set, captions.insert, playlists), `youtube.readonly` is not needed. Both are sensitive scopes, so the OAuth consent screen needs verification (see section 5). Env: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.
- The consent screen must be set to **In production**. Refresh tokens of apps in "Testing" expire after 7 days (Google OAuth docs), which would break hands-free upload. Use `access_type=offline` and `prompt=consent` so a refresh token is always returned. A token also stops working when the user revokes access or after long inactivity; the app shows "Reconnect" when a refresh returns `invalid_grant`.

## 2. Persona transparency and synthetic-media rules

- The presenter is an obviously branded persona (name, avatar from brand assets), not a fake real person. No invented credentials, years of experience, job titles, degrees or customer claims. The script generator is forbidden from first-person biography; "we" means the brand's team, claims must come from the article or the brand's own proof points. The script lint rejects credential phrasing ("as a doctor", "with 20 years", "certified", "PhD").
- Videos set `status.containsSyntheticMedia = true` on `videos.insert` (Google revision history, 2024-10-30). Rationale: the voice is synthetic and scene images are AI generated. YouTube requires disclosure for realistic altered or synthetic content a viewer could mistake for real; clearly stylised illustrations and AI-assisted scripts do not strictly require it, but the narrator voice is realistic, so we always set it. That is the conservative reading and costs nothing.
- Known quirk (community reports, Nov 2026): `videos.insert` has occasionally dropped the flag, and `videos.list` does not return it. The uploader therefore sends a `videos.update` with the flag after insert when `YOUTUBE_SYNTHETIC_FOLLOWUP` is not `off` (50 units), and the UI tells the operator to spot-check in Studio.
- The description always begins its footer with an AI-voice disclosure: "Narrated by an AI voice. Script and sources by the <Brand> team." and ends with the source link.
- Monetisation: YouTube's "inauthentic content" policy (renamed from "repetitious content", 2025-07-15) targets mass-produced or repetitive content. Daily videos from templates are exactly the risk. Mitigations built in: each script is unique and article-specific, human approval is the default (mode `approve`), visuals vary per scene, and the channel is educational. This channel is for GEO, not ad revenue; do not enable monetisation without a human review of recent uploads.
- Set `selfDeclaredMadeForKids = false`.

## 3. Quota and the audit (conflicting information, read carefully)

The brief assumed an upload costs about 1,600 units against a 10,000 unit daily default. That was true historically. Google's current documentation says otherwise:

| Call | Cost today (Google docs) | Old figure |
| --- | --- | --- |
| `videos.insert` | **1 unit, in a separate "Video Uploads" bucket, default 100 calls/day** | 1,600 |
| `thumbnails.set` | 50 | 50 |
| `captions.insert` | 400 | 400 |
| `playlistItems.insert` | 50 | 50 |
| `videos.update` | 50 | 50 |
| `videos.list` / `playlists.list` | 1 | 1 |
| default pool for everything else | 10,000 units/day | 10,000 |

Sources: Google "Quota cost" page and the `videos.insert` reference ("Quota impact: 100 calls per day. A call to this method has a quota cost of 1 unit in the Video Uploads quota bucket"). Secondary sources date the change to late 2025. Because pages disagree, `quota.ts` carries both models and `YOUTUBE_QUOTA_MODEL=legacy|current` (default `current`) selects it. Both are enforced as a pre-flight budget check before every upload.

Math per video (current model): insert 1 (upload bucket) + thumbnail 50 + captions 400 + playlist item 50 + synthetic follow-up 50 = **550 units** of the 10,000 pool, so about **18 fully-featured videos/day per Google Cloud project**. The pool is per project, shared by every client channel. With one video per client per day that is ~18 clients per project before an extension. Captions are the expensive item: if the quota is tight, burned-in captions already exist in the video, and the SRT can be skipped with `YOUTUBE_SKIP_CAPTIONS=1`, which drops the cost to 150 units (~66 videos/day).
Math (legacy model): insert 1,600 + 50 + 400 + 50 + 50 = 2,150 units, so 4 videos/day per project. The engine's daily scheduler caps uploads at `floor(budget / cost)`.

### Unverified projects and private uploads
- Old rule: videos uploaded via `videos.insert` from API projects created after 2020-07-28 that had not passed an API compliance audit were locked to private.
- Current Google reference says: "Videos uploaded from unverified API projects are not restricted to private viewing mode." Secondary sources date that relaxation to November 2026.
- Because the two conflict, the uploader reads the response `status.privacyStatus`/`uploadStatus` and the app shows a **"Locked private by YouTube"** warning if a video we asked to publish as `public` comes back `private`. Default privacy is `private` until a human approves publishing; `YOUTUBE_PRIVACY=public|unlisted|private` sets what an approved video requests.

### API audit checklist (for higher quota and to remove any private lock)
Form: "YouTube API Services - Audit and Quota Extension Form". Prepare:
1. Google Cloud project owned by the agency legal entity; OAuth consent screen "In production", branding verified, privacy policy and terms URLs on the agency domain.
2. Demonstrate compliance with the YouTube API Services Terms and Developer Policies: how data is stored, deleted within 30 days of a revoke, no scraping, no use beyond the stated purpose.
3. A screencast showing the full OAuth flow, the exact scopes, upload, where the user can revoke, and the privacy disclosure that Google's API Services User Data Policy requires (link to Google's privacy policy and the security settings revoke page).
4. Explain each scope: `youtube.upload` for publishing, `youtube.force-ssl` for thumbnails, captions and playlists.
5. Justify quota: clients x videos/day x cost (the table above) with a 30% headroom.
6. Confirm no data is sold, and no content is auto-posted without the channel owner's consent (OAuth consent per channel plus the in-app approval).
7. Keep a contact address that answers within a few days; audits take 1 to several weeks.

## 4. TTS comparison (cost per quality)

A 90 s script is about 220 words, about 1,300 characters. Cost per video:

| Provider | Price | Per 1,300 chars | Notes |
| --- | --- | --- | --- |
| OpenAI `gpt-4o-mini-tts` | $0.60/1M input tokens + $12/1M audio output tokens (about $0.015/min, secondary source) | ~$0.02 | Steerable tone via instructions. Default. |
| OpenAI `tts-1` | $15/1M chars | ~$0.02 | Cheapest, lower expressiveness. |
| OpenAI `tts-1-hd` | $30/1M chars | ~$0.04 | One source reports a Jan 2027 shutdown; verify. |
| ElevenLabs (Creator $22/mo, 121k credits) | about $0.18/1k chars effective | ~$0.24 | Best expressiveness, voice cloning, commercial licence. 10x the cost. |

Decision: implement OpenAI TTS (default model `gpt-4o-mini-tts`, voice `alloy`, override `YOUTUBE_TTS_MODEL`, `YOUTUBE_TTS_VOICE`) behind a small `TtsProvider` interface; an ElevenLabs adapter is included and selected with `YOUTUBE_TTS_PROVIDER=elevenlabs` plus `ELEVENLABS_API_KEY`. Voice cloning of a real person is never offered: the persona voice is a stock voice.
Pricing came from secondary comparison sites; verify on the vendors' pages before quoting to a client.

## 5. Rendering: where it runs

Vercel serverless cannot run this: no ffmpeg binary by default, 300 s max duration on the plans used here, 2 vCPU, and a 90 s 1080p Ken Burns render takes 1 to 3 minutes of CPU. So rendering is offloaded:

- The Next app does the cheap steps (script, TTS, Bria images, metadata, upload) and stores assets in Supabase Storage (`youtube-assets`, private).
- `.github/workflows/youtube-render.yml` (ubuntu runner, system `ffmpeg`, 6 GB RAM, free minutes) runs `web/scripts/youtube-render.mjs`: it asks the app for the next `assets_ready` video (`GET /api/youtube/worker`, bearer `CRON_SECRET`), downloads the signed asset URLs, renders the mp4 with ffmpeg (Ken Burns via `zoompan`, bar-chart scenes via `drawbox`/`drawtext`, burned-in captions from the SRT, audio mixed), uploads the mp4 to a signed URL and calls `POST /api/youtube/worker` to mark it `rendered`.
- A later cron tick (`/api/cron/youtube`) uploads rendered videos. Streaming a ~20 MB mp4 in resumable chunks fits inside a Vercel function.
- `ffmpeg-static` was not added: runners already have ffmpeg, and `FFMPEG_PATH` overrides it for local use.

## 6. Upload mechanics

- `videos.insert` with `uploadType=resumable`: POST metadata to `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, header `X-Upload-Content-Type: video/mp4` and `X-Upload-Content-Length`; the `Location` header is the session URI; PUT the bytes (we send 8 MiB chunks, multiple of 256 KiB, with `Content-Range`, and resume from the `Range` header on 308).
- `thumbnails.set` (needs a verified channel), 2 MB max, JPEG/PNG 1280x720. Bria generates 16:9; we resize on the worker side with ffmpeg and keep it under 2 MB.
- `captions.insert` with `part=snippet`, `snippet.videoId`, `language`, `name`, `isDraft=false`, multipart upload of the SRT.
- Playlist: `playlistItems.insert`. Pinned comment: the API can post a top-level comment (`commentThreads.insert`, 50 units) but **cannot pin it**; pinning is manual in Studio. The first description line already has the blog link, so the pinned link is a nicety. The app lists "pin the link comment" as a manual step and posts the comment text for convenience when `YOUTUBE_POST_LINK_COMMENT=1` (needs `youtube.force-ssl`).

## 7. Metadata strategy (what supports GEO)

- Title: under 70 characters, the exact question the blog post answers, brand last. Three variants are generated; the editor picks one.
- Description (first 150 characters are what shows in search): line 1 states the answer plus the blog URL; then chapters (`0:00` first, at least 3, each at least 10 s apart, per YouTube's chapter rules), key takeaways, the source links, the AI-voice disclosure.
- Tags: 5 to 12, under 500 characters total. Category 27. Language fixed to the org locale.
- Links use `https://` and the blog's canonical URL with UTM `utm_source=youtube&utm_medium=video`. The article page should embed the video (reverse link): the app exposes the video URL on the content item so the CMS template can embed it.
- Captions: SRT uploaded as a real caption track (indexable text) in addition to burned-in captions.

## 8. Costs per video (current model, rough)

Script (Sonnet, ~3k tokens): ~$0.03. TTS: ~$0.02. Bria: 5 images, vendor pricing per image. Render: GitHub Actions minutes (free tier). Upload: 550 quota units. Total under $0.50 excluding Bria.

## 9. Environment and operations

| Variable | Purpose |
| --- | --- |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | Platform OAuth client (one Google Cloud project). |
| `OPENAI_API_KEY` | Default TTS. `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` with `YOUTUBE_TTS_PROVIDER=elevenlabs`. |
| `BRIA_API_KEY` | Scene images and thumbnails (already used by the article pipeline). Without it scenes render as text cards. |
| `YOUTUBE_QUOTA_MODEL`, `YOUTUBE_SKIP_CAPTIONS`, `YOUTUBE_SYNTHETIC_FOLLOWUP`, `YOUTUBE_PRIVACY`, `YOUTUBE_POST_LINK_COMMENT` | Behaviour switches described above. |
| GitHub repo secrets `APP_URL`, `CRON_SECRET` | Used by `.github/workflows/youtube-render.yml` (tick, render, tick). |

Flow and statuses: `draft` (script + metadata, lint shown) > human approve (or auto mode when lint is clean) > `approved` > cron: TTS per line (exact timings), Bria images, SRT, chapters > `assets_ready` > Actions render > `rendered` > cron upload > `uploaded`. `failed` keeps the error and can be edited and re-approved; quota errors leave the video `rendered` for the next day.
Lint blocks approval: em dashes, credential claims, stock phrasing, length outside 60 to 120 s, missing blog URL, missing AI-voice disclosure, bad chapters.
Not verified against live services in this session (no Google client, OpenAI or Bria keys in the sandbox): the OAuth exchange, `videos.insert`, TTS calls and Bria calls follow the documented request shapes; the ffmpeg render and all pure logic were run for real. First run per channel: upload one private video and check it in Studio (synthetic-media label, captions, chapters).

# Design: browser agent for Search Console "Request indexing"

Status: design only. Not built. Owner idea, 2026-11.

## Why
The Google Indexing API is dropped (officially only for job-posting and livestream pages). Google has no supported API for
"Request indexing" on ordinary URLs. What we do instead, shipped:
- Sitemap refresh via the Search Console API (`sitemaps.submit`), `web/src/lib/server/indexing.ts`.
- IndexNow for Bing/Yandex (key = HMAC(`INDEXNOW_SECRET`, orgId); key file at `/<key>.txt` on the client host; submitted after each publish).

## Idea
After a post goes live, a headless browser agent signs in to Search Console, opens URL Inspection for the new URL and clicks
**Request indexing**.

## Design
1. Trigger: a `content_items` row reaches `published` with a `published_url`; enqueue `gsc_request_indexing(org_id, url)`.
2. Worker (one browser context per org, never shared): load stored session; open
   `https://search.google.com/search-console/inspect?resource_id=<property>&id=<encoded url>`; wait for the inspection result;
   click "Request indexing"; confirm the dialog; record success or the quota message.
3. Throttle: hard cap of 8 requests per property per day (Google's quota is about 10/day/property), oldest-first queue, retry next day.
4. Observability: screenshot per attempt (private bucket), status row per URL, alert on login/captcha/2FA failure. Never retry a login more than once.
5. Kill switch per org and globally.

## Risks
- **Google ToS**: automating the Search Console UI is not a supported API; Google's terms prohibit automated access that
  circumvents the provided interfaces. Account or property action is possible. Needs the owner's explicit sign-off and client consent in the contract.
- **Quota**: about 10 manual requests per day per property. It cannot scale; it suits only high-value new URLs.
- **Credentials (last resort)**: needs a stored Google login (dedicated agency/domain email, password, TOTP secret) for an
  account with Owner/Full access to the property, because no OAuth/API exists for this action. This is the only case where we
  store logins; it stays in the separate `-logins` vault, human-provisioned, never via the wizard.
- **Fragility**: UI changes, captchas, "unusual activity" blocks and 2FA prompts will break it; expect maintenance.
- **Security**: a stored Google login is a high-value secret; isolate the worker, no egress except Google, rotate on staff change.
- **Value**: sitemap refresh and normal crawling usually index good pages within days; measure indexing lag before building.

## Recommendation
Do not build until (a) indexing lag is measured as a real problem, (b) legal accepts the ToS risk, (c) the client opts in to
a stored login. Start with a manual "copy URL list for Request indexing" export instead.

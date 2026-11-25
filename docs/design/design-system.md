# Beacon GEO design system

Light mode only. A quiet, cool off-white canvas with white working surfaces separated by hairline borders (no heavy shadows), and one confident teal accent used for actions and for the client's own brand in charts. Tokens live in `web/src/app/globals.css` (`@theme`, Tailwind v4), so every token is a utility class (`bg-surface`, `text-ink-3`, `border-line`, `bg-accent`…).

## Tokens

| Group | Tokens | Notes |
|---|---|---|
| Surfaces | `canvas #f6f7f8`, `surface #fff`, `subtle #f1f3f5`, `muted-bg #e9ecef` | Cool neutral with a slight blue-green bias toward the accent |
| Lines | `line #e3e6ea`, `line-strong #cfd4da` | Borders do the separating |
| Ink | `ink #111827`, `ink-2`, `ink-3`, `ink-4` | `ink-3` is the minimum for body copy; `ink-4` only for meta text |
| Accent | `accent #0b7480` (5.1:1 on white), `accent-hover`, `accent-press`, `accent-soft`, `accent-soft-2`, `accent-ink` | Buttons, links, focus ring, active nav |
| Status | `good`, `warn`, `bad`, `info` + `*-soft` | Always paired with an icon and a label, never color alone |
| Chart series | `series-1…8` (dataviz reference palette), `BRAND_SERIES #008c99`, `COMPETITOR_SERIES` | Hex copies in `web/src/lib/ui/chart-colors.ts` because Recharts writes SVG attributes |
| Type | `--font-sans` Inter (UI), `--font-display` Geist (headings, big numbers), `--font-mono` Geist Mono | Scale 11/12/13/14/16/20/24/32/48 px; numbers use `.tabular` |
| Radius | `xs 4`, `sm 6` (controls), `md 8` (cards), `lg 12` (dialogs) | |
| Spacing | 8px grid: Tailwind steps 2/4/6/8/12/16 | Page gutter 32px, card padding 20px, section gap 24px |
| Elevation | `shadow-xs` (selected segment), `shadow-pop` (menus, tooltips, dialogs only) | |

Focus: every interactive element gets a 2px accent outline with 2px offset (`:focus-visible`). Reduced motion disables animations.

### Chart palette validation

Validated with the dataviz skill's `validate_palette.js` on the light surface:
- Engines use reference slots 1–5 in fixed order (ChatGPT blue, Perplexity orange, Gemini aqua, Claude yellow, AI Overviews magenta). Color follows the engine, never its rank.
- Brand vs competitors: `#008c99, #eb6834, #2a78d6, #e87ba4, #6250d6, #eda100` passes every hard gate (worst adjacent CVD ΔE 13.0, normal-vision ΔE 27.5). Yellow and magenta are under 3:1, so those charts always carry a legend and table values. Competitor colors stored in the DB override the defaults.
- Lines are 2px, area washes 8–10%, gridlines hairline and solid, legends above the plot for ≥ 2 series, crosshair tooltips on every line chart.

## Components (`web/src/components/ui`)

| Component | File | Notes |
|---|---|---|
| Button, ButtonLink, Spinner | `button.tsx` | variants primary / secondary / ghost / subtle / danger; sizes sm / md / lg / icon; `loading` |
| Input, Textarea, NativeSelect, Label, Field | `input.tsx` | `Field` = label + required marker + help + error (`role=alert`) |
| Select | `select.tsx` | Radix select |
| Card, CardHeader, CardBody, CardFooter | `card.tsx` | `CardHeader` takes a `help` slot for the metric "?" |
| Badge | `badge.tsx` | tones neutral / accent / good / warn / bad / info / outline |
| Tabs, SegmentedList | `tabs.tsx` | Radix tabs; underline tabs and segmented control |
| Table parts | `table.tsx` | sticky-feel header, tabular numbers, horizontal scroll wrapper |
| Tooltip, MetricHelp | `tooltip.tsx`, `metric-help.tsx` | Every metric has a "?" with definition + formula from `lib/ui/metrics.ts` |
| Dialog | `dialog.tsx` | Radix dialog with title/description/footer |
| Progress | `progress.tsx` | `role=progressbar`, track is a lighter step of the same hue |
| StatTile | `stat-tile.tsx` | label · value · signed delta (color = direction × good) · sparkline |
| EmptyState | `empty-state.tsx` | Used for real empty data, never filled with fake numbers |
| StatusPill, StatusIcon, SeverityBadge | `status.tsx` | Working / Partial / Failed / In progress / Not started |
| FileDrop | `file-drop.tsx` | drag & drop, preview, dark tile for dark-mode assets |
| SecretInput | `secret-input.tsx` | masked; value only in the DOM input; encrypted in the browser (JWE, ECDH-ES+A256KW/A256GCM, key from `GET /api/intake/key`) and posted to `/api/onboarding/:orgId/secrets` with `x-beacon-intake: 1`; input wiped on success or failure; only a "stored" flag is kept |
| CopyButton | `copy-button.tsx` | used for placeholders, code blocks, invite links, API keys |
| Switch, Slider, Checkbox, RadioGroup | `controls.tsx` | Radix |
| Avatar, OrgMark, Logo, PageHeader | | |

Charts (`web/src/components/charts`): `TrendChart` (Recharts lines + legend + crosshair tooltip), `Sparkline` (pure SVG, server-safe), `BarList` and `SegmentedBar` (HTML bars with 2px surface gaps).

## Data layer

Pages are server components. They call only `web/src/lib/data.ts`, a thin adapter over the backend's query functions in `web/src/lib/server/queries` (RLS enforced). The adapter converts shapes, derives previous-period values (2× window minus current window), pivots series, and returns `Load<T>` (`ok` or `not_configured | unauthenticated | forbidden`). Pages render `LoadFail` / `NoData` states and never invent numbers. Mutations are server actions in `web/src/app/app/[orgSlug]/actions.ts` (run with RLS as the signed-in user) or the backend's `/api/*` routes (secrets, live tests, onboarding progress, admin org creation, billing portal).

Adapter TODOs (no backend query yet; the UI shows an empty or reduced state):
- Brand style fields (voice, audience, tone, rules) are stored in `organizations.settings.brand_kit`; a dedicated table/query would be cleaner.
- Prompt volume, per-prompt daily trend, head-to-head (computed from the latest 1,000 answers), source-domain trend sparklines, site-health tasks, llms.txt status, robots.txt allow/block per bot, invoices list, MRR per account, onboarding file uploads (`/api/onboarding/:orgId/files`), `SERVICE_ACCOUNT_EMAIL` per org.

## Auth and local QA

- Supabase Auth via `@supabase/ssr`: `web/src/proxy.ts` refreshes the session (`getClaims`) and redirects signed-out users from `/app` and `/admin` to `/login`. Login/signup support email + password, magic link, Google and Microsoft (Azure) OAuth; `/auth/callback` exchanges the code. Without `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` the forms show "Auth not configured".
- **Local QA bypass**: set `DEV_AUTH_USER_ID=<auth.users id>` (optional `DEV_AUTH_AAL=aal1`, default `aal2`). It works only when `NODE_ENV !== "production"` **and** `DATABASE_URL` points at `localhost`/`127.0.0.1`. The backend's `DEV_IMPERSONATE_USER_ID` is accepted too, with the same guard.
  ```
  scripts/dev-db.sh                      # prints DATABASE_URL
  cd web && DATABASE_URL=postgres://postgres@localhost:54322/beacon \
    DEV_AUTH_USER_ID=00000000-0000-4000-a000-000000000011 pnpm dev   # Dana, owner of Northwind
  # platform admin (super admin console): 00000000-0000-4000-a000-000000000001
  ```
- Super admin: `/admin` returns 404 for anyone without an active `platform_admins` row. "View as" creates a 60-minute, read-only, audited `platform_access_grants` row (requires aal2) and shows a banner; admins never appear in client member lists.

## Skills checked

`SearchSkills`/`ListSkills`: no frontend-specific installable skills. Available and relevant: `design:design-system`, `design:accessibility-review`, `design:design-critique`, `design:ux-copy`, `design:design-handoff`, `dataviz` (palette validator used above), `artifact-design` (principles). Figma skills exist but no Figma file is in scope.

## Screens

`docs/design/screens/` (1440px, deviceScaleFactor 1, real seeded data from `scripts/dev-db.sh`): `overview.png`, `prompts.png`, `competitors.png`, `onboarding.png` (CMS step), `admin.png` (1280px).

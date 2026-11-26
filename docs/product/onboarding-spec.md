## 1. Company info & brand assets

Group: company · Icon: Building2 · Required · 3 live test(s)

**Why we need it:** We use your name, site and social profiles to find where AI engines already mention you, and your logos and design system so every chart, report and generated visual looks like your brand.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `company_name` | Company name | text (required) |  |
| `website_url` | Primary website | url (required) | The canonical domain AI engines should cite. |
| `social_linkedin` | LinkedIn company page | url |  |
| `social_x` | X (Twitter) | url |  |
| `social_reddit` | Reddit (brand account or subreddit) | url |  |
| `social_instagram` | Instagram | url |  |
| `social_facebook` | Facebook | url |  |
| `design_system_html` | Design-system HTML | file | A single self-contained HTML style guide (max 2 MB) showing colors, type, buttons, cards. Export from Figma/Storybook or ask your designer. |
| `logo_light` | Logo for light backgrounds | file (required) | SVG preferred. Transparent background, dark-colored logo. |
| `logo_dark` | Logo for dark backgrounds | file (required) | SVG preferred. Transparent background, light-colored logo. |
| `favicon_light` | Favicon for light mode | file (required) | At least 48x48 px. Square. |
| `favicon_dark` | Favicon for dark mode | file (required) |  |

### Grant instructions

**Where to find your assets**

1. Logos: ask your designer for the "primary logo" in SVG. If you only have a PNG, use one that is at least 1000 px wide with a transparent background.
2. Provide two versions: one that looks good on white (dark ink) and one that looks good on dark backgrounds (light ink). If your logo is one color, send the same file twice.
3. Favicons: the small square icon in the browser tab. Open https://www.yourdomain.com/favicon.ico in a browser and save it, or ask your web developer for the light and dark variants.
4. Design-system HTML: any page that shows your colors, fonts, buttons and spacing. A Storybook "static build", a Figma "Dev Mode" export, or a simple style-guide page all work. A zip is fine if it needs CSS or font files.
5. Do not upload files containing passwords, customer data or unreleased products.

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `company_site_reachable` | Website reachable | HTTP GET on website_url follows redirects and returns 200 with HTML. Partial: redirects to a different domain than entered, returns 403/401 (bot protection blocks us), or lacks a robots.txt we can read. |
| `company_assets_valid` | Brand assets valid | Server-side checks on the uploaded files: MIME type matches extension, SVG sanitised (no scripts), logos have transparency, favicons are square and at least 48 px, design-system HTML parses and exposes CSS color variables. Partial: any optional asset missing or a light/dark pair is byte-identical (warning, not failure). |
| `company_socials_resolve` | Social profiles resolve | HEAD/GET each provided social URL; expects 200 and the hostname to match the network. Partial: a profile returns 404 or is private; networks that block unauthenticated checks (LinkedIn, Instagram) report "could not verify" instead of failed. |


## 2. GEO readiness

Group: company · Icon: ScanSearch · Optional · 1 live test(s)

**Why we need it:** Before we create content, we check whether AI engines can actually reach, read and cite your site: robots.txt, llms.txt, sitemap, speed, server-side rendering, structured data and any firewall that blocks AI crawlers. You get a prioritized fix list with step-by-step instructions for your platform.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|


### Grant instructions

**How the audit works**

1. We request your robots.txt, llms.txt, sitemap and a few pages exactly like AI crawlers do (including with GPTBot, ClaudeBot and PerplexityBot user agents).
2. We score each check from 0 to 100 and list the fixes that matter most first.
3. Fix the top items, then press "Re-run audit" to see your score improve. You can re-run it any time from Site health.

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `geo_score` | GEO readiness audit | Real requests to your site: robots.txt AI bot rules, llms.txt, sitemap freshness, PageSpeed Insights (LCP, CLS, INP, TTFB), server-side rendering, canonical/noindex, structured data, headings, author/date, internal links, HTTPS, hreflang, page weight and WAF/CDN bot blocking. Partial: some categories score below 70. Fail: most categories need work. |


## 3. Brand book

Group: brand · Icon: BookOpen · Required · 2 live test(s)

**Why we need it:** AI engines describe you using the words found across the web. We use your positioning, customers, competitors and voice to choose the prompts we track and to write content that sounds like you and repeats the same facts everywhere.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `company_description` | Company description | textarea (required) |  |
| `product_in_focus` | Product in focus | textarea (required) | The product or service we should grow AI visibility for. Name, what it does, pricing model, main use cases. |
| `icp_profiles` | Ideal customer profiles (3 company profiles) | repeater (required) | Describe three types of companies you sell to. For each, add two buyer personas. |
↳ | `profile_name` | Company profile name | text (required) |  |
↳ | `profile_description` | Description (industry, size, region, needs) | textarea (required) |  |
↳ | `personas` | Personas (2 per company profile) | repeater (required) |  |
↳ | `persona_title` | Job title | text (required) |  |
↳ | `persona_goals` | Goals | textarea (required) |  |
↳ | `persona_pains` | Pains / objections | textarea (required) |  |
↳ | `persona_questions` | Questions they ask an AI assistant | textarea | Example: "What is the best tool for X?" We use these to seed tracked prompts. |
| `kpi_main_event` | Main conversion event | text (required) | The one event that means success (as named in GA4). |
| `kpi_secondary_event` | Secondary event to monitor | text |  |
| `competitors` | Top 5 competitors | table (required) |  |
↳ | `competitor_name` | Name | text (required) |  |
↳ | `competitor_website` | Website | url (required) |  |
↳ | `competitor_better` | What they do better | textarea (required) |  |
↳ | `we_better` | What we do better | textarea (required) |  |
| `msg_one_liner` | One-liner | text (required) |  |
| `msg_main` | Main message | textarea (required) |  |
| `msg_secondary` | Secondary message | textarea |  |
| `msg_third` | Third message | textarea |  |
| `msg_numbers` | Numbers we claim | repeater | Only claims you can prove. We repeat them consistently so AI engines pick them up. |
↳ | `number_claim` | Claim | text (required) |  |
↳ | `number_source` | Source / proof URL | url |  |
| `voice_say` | Voice: say | textarea (required) |  |
| `voice_dont_say` | Voice: do not say | textarea (required) |  |

### Grant instructions

**Tips for a good brand book**

1. Reuse what you already have: your homepage hero, About page, sales deck and latest investor or press boilerplate.
2. ICP: think "who actually buys". Three company types, two decision-makers each. If you only have two company types, split your biggest one by size or industry.
3. Competitors: choose companies a buyer would compare you with in an AI chat, not just direct rivals. Add their homepage.
4. Numbers: only include figures you can show on a public page. AI engines cross-check claims.
5. You can save and come back anytime. This step needs a marketing owner, not IT.

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `brand_complete` | Brand book complete | Schema check: 3 ICP profiles with 2 personas each, 5 competitor rows, one-liner and main message present, voice lists non-empty. Partial: lists which sections are incomplete (e.g. "ICP 2 has 1 persona"). |
| `brand_competitors_reachable` | Competitor sites reachable | GET each competitor homepage (200 OK). Partial: unreachable or redirecting to a different domain; we flag the row but do not block. |


## 4. How you grant us access

Group: access · Icon: KeyRound · Required · 2 live test(s)

**Why we need it:** Most tools below let you add a person. You choose whether we are added as a guest using our agency email (simplest, fully revocable, nothing for you to store) or whether you create a dedicated user in your own domain.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `access_method` | Access method | radio (required) |  |
| `domain_user_email` | Email of the user you created for us | email (required) | shown if `access_method` = domain_user |
| `domain_user_password` | Password | secret (required) | shown if `access_method` = domain_user; Stored encrypted in our vault, visible to no one at the agency except the automated workers. |
| `domain_user_totp` | Two-factor (TOTP) secret key, if enabled | secret | shown if `access_method` = domain_user; The text key shown under the QR code when you set up an authenticator app. Not the 6-digit code. |

### Grant instructions

**Option A: grant our agency email** _(variant: agency_email)_

1. You will see our email in every following step: {{AGENCY_EMAIL}}.
2. In each tool, add that address as a user with the exact permission listed in that step.
3. Google tools (Search Console, GA4, Google Cloud) need a Google account. If {{AGENCY_EMAIL}} is a Google Workspace or Gmail address, no extra action. Other tools accept any email.
4. To remove us later, delete that user in each tool. Nothing else to clean up.

**Option B: create a user in your domain** _(variant: domain_user)_

1. Ask your IT admin to create one dedicated user, e.g. beacon@yourcompany.com (Google Workspace Admin Console > Directory > Users > Add new user, or Microsoft 365 admin center > Users > Active users > Add a user).
2. Give it a license that includes email so verification emails arrive. A shared mailbox is not enough for Google.
3. Exclude the user from SSO redirects and conditional access that require a managed device, or we cannot log in from our servers.
4. If two-factor is required, enroll an authenticator app and copy the text setup key (the text shown beside the QR code) into the TOTP field.
5. Enter the email and password in the secure fields. They go directly to our encrypted vault, not into this form record.
6. In each following step, grant that user the permissions shown, or assign it the same roles as your other admins.

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `access_method_recorded` | Access method chosen | Field present and valid. Later steps adapt their wording to this choice. |
| `access_user_credentials_stored` | Domain user credentials stored | Vault lookup confirms the secret exists and email domain matches the company website domain. We cannot test login generically; each later step proves access through its own API call. Partial: password stored but no TOTP while the later steps report an MFA challenge. |


## 5. GitHub (blog repository)

Group: stack · Icon: GitBranch · Required · 2 live test(s)

**Why we need it:** If your blog or docs live in a Git repository (Markdown/MDX, Next.js, Astro, Hugo...), we open pull requests with new and updated articles. You review and merge; we never push to your main branch.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `github_repo` | Repository (owner/name) | text (required) |  |
| `github_branch` | Default branch | text |  |
| `github_content_path` | Blog content folder | text | Where articles live. We only write inside this folder. |
| `github_method` | How to grant access | radio (required) |  |
| `github_token` | Fine-grained personal access token | secret (required) | shown if `github_method` = token |

### Grant instructions

**Required permission**

1. Collaborator: Write role on that one repository (needed to push a branch and open PRs). Read is only partial.
2. Token: Repository access = Only select repositories > your blog repo. Repository permissions: Contents = Read and write, Pull requests = Read and write, Metadata = Read-only (auto). Nothing else. Set expiry to 1 year.
3. There is no agency-registered GitHub app: you grant access yourself, with either a fine-grained token or a collaborator/deploy-key on this one repository.

**Invite our user (GitHub UI as of Nov 2026)** _(variant: invite)_

1. Open the repository on github.com.
2. Click Settings (top tab) > Collaborators and teams (left sidebar, under Access).
3. Click Add people, search for {{AGENCY_GITHUB_USER}}, choose Write as the role, click Add.
4. For repositories owned by an organization, an org owner may need to approve outside collaborators. We accept the invitation automatically within 15 minutes.

- [GitHub docs: inviting collaborators](https://docs.github.com/en/account-and-profile/how-tos/setting-up-and-managing-your-personal-account-on-github/managing-access-to-your-personal-repositories/inviting-collaborators-to-a-personal-repository)

**Create a fine-grained token** _(variant: token)_

1. On github.com click your avatar (top right) > Settings > Developer settings (bottom of left sidebar) > Personal access tokens > Fine-grained tokens > Generate new token.
2. Resource owner: choose your organization (an org owner may have to enable fine-grained tokens first: Organization > Settings > Personal access tokens).
3. Repository access: Only select repositories, choose the blog repo.
4. Permissions: Contents = Read and write; Pull requests = Read and write. Metadata Read-only is added automatically.
5. Click Generate token, copy it once, and paste it into the secure field here.

- [GitHub docs: fine-grained tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `github_repo_access` | Repository reachable | GET /repos/{owner}/{repo}. Checks the response field permissions: push must be true. Partial: "Read only: pull=true, push=false" (invite role is Read or Triage; raise to Write). 404 = invite not accepted or token not scoped to this repo. |
| `github_pr_probe` | Can open pull requests | Create branch beacon/connection-test from the default branch via the Git Refs API, commit one file under the content folder, open a draft PR, then close the PR and delete the branch. Partial: branch push works but PR creation fails (token lacks Pull requests: write), or branch protection blocks branch creation by pattern. |


## 6. CMS (publishing)

Group: stack · Icon: PenSquare · Required · 2 live test(s)

**Why we need it:** We create articles as drafts inside your CMS so your team can review and publish. We never publish without your approval unless you enable auto-publish later.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `cms_platform` | Which CMS do you use? | select (required) |  |
| `cms_site_url` | Site / admin URL | url (required) | WordPress/Ghost: your site address. Shopify: your-store.myshopify.com. Others: your live site. |
| `cms_username` | Username | text | shown if `cms_platform` = wordpress; The WordPress user that owns the Application Password. |
| `cms_project_id` | Project / Space / Site ID | text | shown if `cms_platform` = webflow/wix/sanity/contentful/framer; Webflow Site ID; Wix Site ID; Sanity Project ID; Contentful Space ID; Framer project ID. |
| `cms_dataset` | Dataset / collection / environment | text | shown if `cms_platform` = sanity/contentful/webflow; Sanity dataset; Contentful environment; Webflow blog collection ID. |
| `cms_api_credential` | API token / key / application password | secret (required) | shown if `cms_platform` = wordpress/webflow/wix/sanity/contentful/hubspot/framer/shopify/ghost; What to paste depends on your CMS; see the instructions for your CMS. |
| `cms_other_notes` | Tell us about your CMS | textarea (required) | shown if `cms_platform` = other; Name, whether it has a REST/GraphQL API, and how your team publishes today. We will reply within 1 business day with next steps. |

### Grant instructions

**WordPress** _(variant: wordpress)_

1. Log in to wp-admin as an Administrator. Self-hosted WordPress 5.6+ or WordPress.com Business plan required (REST API and Application Passwords).
2. Users > Add New User. Username: beacon, Email: {{AGENCY_EMAIL}}, Role: Editor (can create and edit posts and media; cannot install plugins). Uncheck "Send the user an email" if you do not want us to receive one.
3. Open Users > All Users > beacon > Edit. Scroll to Application Passwords, type the name "ASO Engine", click Add Application Password, and copy the generated password (spaces are fine).
4. Enter the username and that application password in the form. The site must be served over HTTPS.
5. If a security plugin or host (Wordfence, Cloudflare WAF, WP Engine) blocks /wp-json/, ask your host to allow our IP range, which we will email you.

- [WordPress: Application Passwords](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/)

**Webflow** _(variant: webflow)_

1. You need to be a Workspace Admin or Site Admin.
2. Open the Webflow Dashboard > the site > Site settings (gear) > Apps & integrations > scroll to API access > Generate API token.
3. Name it "ASO Engine". Select scopes: Sites = Read-only, CMS = Read and write, Pages = Read-only. Leave everything else off.
4. Generate and copy the token into the secure field.
5. Blog collection ID: Webflow Designer > CMS > Blog Posts collection > Collection settings > copy the ID (or enter the collection name and we will resolve it).

- [Webflow Data API: site tokens](https://developers.webflow.com/data/docs/authentication)

**Wix** _(variant: wix)_

1. You must be the account owner or co-owner.
2. Wix account settings: manage.wix.com > profile menu > Account settings > API keys > Generate API Key (steps may show under "Headless" or "API keys manager" depending on your account).
3. Name: ASO Engine. Permissions: under Wix Blog choose Read and Manage Blog (posts and categories). Account-level scope = Access to the one site you choose.
4. Copy the key and your Site ID (the URL segment after /dashboard/ when you are inside the site dashboard).
5. This requires the Wix Blog app on the site. Tell us if your site has no Wix Blog.

- [Wix API keys](https://dev.wix.com/docs/rest/articles/getting-started/api-keys)

**Sanity** _(variant: sanity)_

1. Open sanity.io/manage > select your project.
2. Go to API > Tokens > Add API token.
3. Name: ASO Engine. Permissions: Editor (create and edit, cannot change project settings). Viewer is "partial" (read only).
4. Copy the token once and paste it in the secure field. Enter the Project ID (shown on the project page) and the dataset (usually production).
5. Tell us your blog document type name (e.g. post) by reply; we map fields automatically if it has title, slug and body.

- [Sanity: API tokens](https://www.sanity.io/docs/content-lake/http-auth)

**Contentful** _(variant: contentful)_

1. Open app.contentful.com > Settings (top bar) > CMA tokens > Create personal access token. Create it while logged in as a user with at least the Editor role on the space (Space Admin is not needed).
2. Name it "ASO Engine", copy the token. Personal tokens act as that user: prefer creating a dedicated user for us (Settings > Users > Invite {{AGENCY_EMAIL}} with the Editor role) and generating the token from that user, then enter it here.
3. Space ID: Settings > General settings. Environment: usually master.

- [Contentful: CMA tokens](https://www.contentful.com/developers/docs/references/authentication/)

**HubSpot** _(variant: hubspot)_

1. You need Super Admin or the Marketplace/App permissions.
2. In HubSpot: Settings (gear) > Integrations > Private Apps > Create private app. (HubSpot may label this "Service keys" or direct you to developer projects on newer accounts. If so, use the same scopes.)
3. Name: ASO Engine. Scopes tab: content (Content: read and write blog posts and landing pages). Do not add CRM scopes.
4. Create the app, then copy the access token into the secure field.
5. Requires a Marketing Hub (or CMS Hub) subscription with the HubSpot blog enabled.

- [HubSpot: private apps](https://developers.hubspot.com/docs/api/private-apps)

**Framer** _(variant: framer)_

1. Framer's publishing API is new and its UI changes often; confirm with us if a label below is missing.
2. Open your project > Site Settings (gear top right) > General (or Integrations) > API Keys > Create key. Name "ASO Engine". Scope: CMS read and write.
3. Copy the key into the secure field and enter the Framer project ID (the long ID in the project URL).
4. If you cannot see API Keys: invite {{AGENCY_EMAIL}} as an Editor (Project > Share > Invite) and tell us; we will use the CMS plugin flow and you publish manually.

- [Framer Server API](https://www.framer.com/developers/)

**Shopify** _(variant: shopify)_

1. Log in as the store owner or staff with "Develop apps" permission.
2. Dev Dashboard route (Shopify now requires this for new custom apps): dev.shopify.com > Create app > Name "ASO Engine" > Configuration > Admin API access scopes: read_content, write_content (blog articles and pages). Install it on your store.
3. Legacy route if your store still shows it: Shopify admin > Settings > Apps and sales channels > Develop apps > Create an app > Configure Admin API scopes: read_content and write_content > Install app > Reveal token once.
4. Copy the Admin API access token (starts with shpat_) into the secure field. The site URL is your-store.myshopify.com.

- [Shopify Admin API access scopes](https://shopify.dev/docs/api/usage/access-scopes)

**Ghost** _(variant: ghost)_

1. Log in to Ghost Admin as Owner or Administrator.
2. Settings (gear bottom left) > Advanced > Integrations > Add custom integration. Name: ASO Engine > Create.
3. Copy the Admin API key (format id:secret) into the secure field, and the API URL into the Site URL field.
4. The integration key can create and edit posts. It cannot access member data unless you add it.

- [Ghost Admin API](https://ghost.org/docs/admin-api/)

**Other CMS** _(variant: other)_

1. Describe your CMS in the notes field. The fastest paths we support: (1) a REST/GraphQL API token with create and edit rights, (2) a Git-backed repository (use step 4), (3) a user seat with Editor role (use the access method from step 3) where a human-in-the-loop flow is acceptable.
2. Include links to the CMS API docs if you have them.

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `cms_auth` | Credential valid | Authenticated read on the CMS identity or site endpoint (WP GET /wp-json/wp/v2/users/me; Webflow GET /v2/sites; Wix POST /blog/v3/posts/query; Sanity GET /v2021-06-07/projects/{id}; Contentful GET /spaces/{id}; HubSpot GET /cms/v3/blogs/posts?limit=1; Shopify GET /admin/api/2025-10/blogs.json; Ghost GET /ghost/api/admin/site/). Failed: 401/403. |
| `cms_draft_write` | Can create a draft | Creates a draft titled "ASO Engine connection test", reads it back, then deletes it. Partial: read works but the draft create is denied (token is read-only, e.g. Sanity Viewer, WordPress Contributor, Webflow CMS read-only). |


## 7. Google Search Console

Group: access · Icon: Search · Required · 3 live test(s)

**Why we need it:** Search Console shows which queries and pages bring Google traffic, including AI Overviews clicks. Owner is required so we can use URL inspection and sitemap submission and re-verify the property if something breaks.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `gsc_property` | Search Console property | text (required) | Domain property (sc-domain:) is best. Copy it from the property dropdown in Search Console. |

### Grant instructions

**Required permission**

1. Permission level: Owner (a "delegated owner" is fine and is what you create for us). Full, Restricted and Associate are not enough.
2. Why not Full: only Owners can add other users and service accounts.

**Add our agency email as Owner** _(variant: agency_email)_

1. You must already be a verified owner. Open search.google.com/search-console and pick the property in the top-left dropdown.
2. In the left menu click Settings (gear, near the bottom) > Users and permissions.
3. Click Add user (top right), enter {{AGENCY_EMAIL}}, set Permission to Owner, click Add.
4. If you do not see Users and permissions, you are not an owner. Ask whoever verified the property, or verify it yourself with a DNS TXT record (step 10).
5. Repeat for each property variant you use (domain property covers all of them).

- [Google: manage owners, users and permissions](https://support.google.com/webmasters/answer/7687615)

**Add the user you created as Owner** _(variant: domain_user)_

1. Same path as above (Settings > Users and permissions > Add user), but use the email of the user you created in step 3. Permission: Owner.

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `gsc_property_visible` | Property visible to us | Search Console API sites.list (webmasters.readonly or webmasters scope) with our agency identity must include gsc_property. Failed: property not in list (user not added or wrong property type). |
| `gsc_owner_level` | Owner permission level | Read permissionLevel from sites.list/sites.get. Expected siteOwner. Partial: "siteFullUser" shows as "GSC access is Full, not Owner"; "siteRestrictedUser" shows "Restricted". Also confirms the Indexing API service account (step 9) is listed as Owner when step 9 is done. |
| `gsc_data_flowing` | Search data available | searchanalytics.query for the last 7 days (dimension: query, rowLimit 5). Partial: 0 rows (property is new, less than 2 days old, or has no impressions), or the property was verified less than 48 hours ago. |


## 8. Bing Webmaster Tools

Group: access · Icon: Globe · Required · 3 live test(s)

**Why we need it:** Bing powers parts of ChatGPT search and Copilot. Bing Webmaster data and IndexNow submissions affect how fast your new content becomes visible there.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `bing_site_url` | Site URL in Bing Webmaster Tools | url (required) |  |
| `bing_api_key` | Bing Webmaster API key | secret | Only required if you chose "user in your domain" in step 3. With our agency email we use our own key. |

### Grant instructions

**Required permission**

1. Highest role: Administrator (shown as Owner in older docs). A site is owned by whoever verified it; additional users can be Administrator, Read/Write, or Read-only.
2. We need Administrator to submit URLs and sitemaps, read the full API and manage users. Read/Write is partial.

**Add our agency email (verify the UI labels, they change often)** _(variant: agency_email)_

1. Sign in at bing.com/webmasters. If the site is not listed, click Add a site, then Import from Google Search Console (fastest) or verify with the DNS TXT/CNAME or meta tag (see step 10).
2. Select your site, then Settings (left menu or top bar) > Users.
3. Click Add user, enter {{AGENCY_EMAIL}}, set the role to Administrator, click Add.
4. We accept via email within 1 business day.

- [Bing Webmaster Tools](https://www.bing.com/webmasters)

**Use your domain user and share an API key** _(variant: domain_user)_

1. Add your domain user as Administrator as above, or log in with it and create the key.
2. Settings (gear, top right) > API access > API key > Generate API key. Paste it into the secure field.

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `bing_site_listed` | Site listed | Bing Webmaster API GetUserSites must include bing_site_url and IsVerified=true. Failed: site not in list. |
| `bing_role_admin` | Administrator role | GetSiteRoles for the site must list our identity with Role=Administrator. Partial: "Bing access is Read/Write, not Administrator" or "Read-only". |
| `bing_api_quota` | API / URL submission works | GetUrlSubmissionQuota returns daily and monthly quota >0. Partial: quota 0 (new site, quota grows after verification) or API key rejected. |


## 9. Google Analytics 4

Group: access · Icon: BarChart3 · Required · 4 live test(s)

**Why we need it:** GA4 lets us connect AI visibility to business results: sessions referred from ChatGPT, Perplexity, Gemini and others, and the key event (demo request, sign-up) that those sessions produce.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `ga4_property_id` | GA4 property ID | text (required) | Digits only. Admin > Property settings > Property ID. |
| `ga4_key_event` | Key event to monitor | text (required) | The event name exactly as it appears in GA4 > Admin > Events. Should be marked as a key event. |
| `ga4_secondary_event` | Secondary event (optional) | text |  |

### Grant instructions

**Required permission**

1. Property-level role: Editor (lets us read reports, create audiences/annotations and verify key events). Viewer/Analyst are partial: we can read reports but cannot mark or confirm key events.
2. Administrator is not needed. Do not give us account-level Administrator.

**Add our agency email** _(variant: agency_email)_

1. Open analytics.google.com and select the right account and property.
2. Click Admin (gear, bottom left) > Property access management (in the Property column).
3. Click + (top right) > Add users. Enter {{AGENCY_EMAIL}}. Untick "Notify new users by email" if you prefer.
4. Select Editor (not Administrator). Click Add.
5. Find the property ID: Admin > Property settings (top right of the page, "Property ID").

- [Google: access and data-restriction management](https://support.google.com/analytics/answer/9305788)

**Add your domain user** _(variant: domain_user)_

1. Same path (Admin > Property access management > + > Add users). Email: the user from step 3. Role: Editor.

**Check your key event**

1. In GA4: Admin > Data display > Events (or Key events). Find the event you want, and switch "Mark as key event" on.
2. Type the event name here exactly (case-sensitive).

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `ga4_property_access` | Property accessible | Analytics Admin API accountSummaries.list (scope analytics.readonly) must contain ga4_property_id. Failed: not shared with us or wrong ID. |
| `ga4_role_editor` | Editor role | accessBindings/list for the property filtered to our identity. Expected predefinedRoles includes roles/editor. Partial: "GA4 access is Viewer/Analyst, not Editor". |
| `ga4_key_event_exists` | Key event exists | Admin API properties.keyEvents.list contains ga4_key_event (and ga4_secondary_event if given). Partial: event exists as a normal event but is not marked as a key event, or the name does not match (case). |
| `ga4_data_flowing` | Data is flowing | Data API runReport last 28 days: sessions > 0 and eventCount for the key event > 0. Partial: sessions exist but the key event has zero count (not tracking yet). |


## 10. Google Cloud (YouTube, Ads)

Group: access · Icon: CloudCog · Required · 5 live test(s)

**Why we need it:** These APIs give us YouTube creators and video mentions, Google Keyword Planner search volumes, and instant indexing requests. They run inside a Google Cloud project you control, with a service account whose key you can revoke any time.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `gcp_project_id` | Google Cloud project ID | text (required) |  |
| `gcp_service_account_key` | Service account key (JSON) | secret (required) | Paste the whole JSON file contents. Stored encrypted; we never show it again. |
| `google_ads_customer_id` | Google Ads customer ID | text | Any Google Ads account (even with no spend) is enough for Keyword Planner. Leave blank if you have none: we will use ours. |

### Grant instructions

**Required permission**

1. In your project: you need Owner or (Project IAM Admin + Service Usage Admin + Service Account Admin + Service Account Key Admin) to do this setup.
2. The service account itself needs no IAM role on the project (API enablement is project-level). Do not grant it Owner/Editor.
3. Enabled APIs: YouTube Data API v3 (youtube.googleapis.com), Google Ads API (googleads.googleapis.com). Optional: Search Console API (searchconsole.googleapis.com), Google Analytics Data and Admin APIs (analyticsdata / analyticsadmin) for step 8.

**1. Create or choose a project**

1. Go to console.cloud.google.com. Click the project picker (top bar) > New project. Name: "ASO Engine". Select your organization. Create.

- [Google Cloud console](https://console.cloud.google.com/)

**2. Enable the two APIs**

1. Left menu (hamburger) > APIs & Services > Library.
2. Search "YouTube Data API v3" > Enable.
3. Search "Google Ads API" > Enable.

- [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
- [Google Ads API](https://console.cloud.google.com/apis/library/googleads.googleapis.com)

**3. Create the service account and a key**

1. Left menu > IAM & Admin > Service Accounts > Create service account. Name: beacon-geo. Skip the optional role and user-access steps. Done.
2. Copy the service account email (looks like beacon-geo@PROJECT.iam.gserviceaccount.com). It is also shown below as {{SERVICE_ACCOUNT_EMAIL}}.
3. Open the account > Keys > Add key > Create new key > JSON > Create. A file downloads. Paste its entire contents into the secure field here, then delete the downloaded file.
4. If "Create key" is blocked, your organization enforces the policy iam.disableServiceAccountKeyCreation. Ask your Cloud admin to allow it for this project, or tell us and we will use Workload Identity Federation instead.

- [Google: service account keys](https://cloud.google.com/iam/docs/keys-create-delete)


**4. Google Ads / Keyword Planner**

1. Keyword Planner needs a Google Ads account (no spend needed). Create one at ads.google.com if you do not have one (choose "Switch to Expert Mode" to skip a campaign).
2. Copy your Customer ID (top right of the Ads UI, format 123-456-7890) into the field above.
3. Link our manager account: Google Ads > Admin (wrench) > Access and security > Managers (or "Account access" > Managers) > Link. Accept the request from manager ID {{ADS_MANAGER_ID}}. Access level: Read-only is enough for Keyword Planner; Standard is only needed if you want us to create campaigns (we will not).
4. Our Google Ads developer token is held by our manager account. You do not need to apply for one.

- [Google Ads: link manager accounts](https://support.google.com/google-ads/answer/7459601)

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `gcp_service_account_valid` | Service account key valid | Exchange the JWT for an access token (oauth2.googleapis.com/token) and check client_email matches the project. Failed: invalid or revoked key, JSON malformed. Partial: key valid but the project differs from gcp_project_id. |
| `gcp_apis_enabled` | Two APIs enabled | serviceusage.services.batchGet for youtube.googleapis.com, googleads.googleapis.com; each must be ENABLED. Partial: lists which are still disabled and gives the one-click enable link. |
| `youtube_api_call` | YouTube Data API call | GET youtube/v3/videoCategories?part=snippet&regionCode=US (1 quota unit). Failed: 403 accessNotConfigured (API disabled) or quotaExceeded. |
| `ads_keyword_ideas` | Keyword Planner call | KeywordPlanIdeaService.generateKeywordIdeas with one seed keyword via our developer token and manager login-customer-id. Partial: customer ID given but the manager link is still pending ("USER_PERMISSION_DENIED"), or account is not yet active. |


## 11. DNS verification (TXT record)

Group: access · Icon: Network · Required · 2 live test(s)

**Why we need it:** A TXT record is the strongest proof that you control the domain. It lets us verify the domain for the other tools (Search Console, Bing, Google Cloud) and proves to our platform that your team authorised this onboarding.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `dns_domain` | Root domain | text (required) | The domain you manage DNS for, without www. |
| `dns_provider` | Where is your DNS hosted? | select (required) |  |

### Grant instructions

**The record to add (the same for every provider)**

1. Type: TXT
2. Name / Host: {{DNS_TXT_NAME}} (e.g. _beacon-verify). Some providers want the full name _beacon-verify.acme.com; if the field auto-appends your domain, enter only _beacon-verify.
3. Value / Content: {{DNS_TXT_VALUE}} (paste exactly, no quotes unless your provider adds them automatically)
4. TTL: Auto or 300 seconds. Do not remove existing TXT records (SPF, DKIM, Google verification).
5. Changes usually appear in 1-10 minutes, but can take up to 48 hours. Click the test when ready.

**Cloudflare** _(variant: cloudflare)_

1. dash.cloudflare.com > select your domain > DNS > Records > Add record.
2. Type TXT, Name _beacon-verify, Content = the value above, TTL Auto. Proxy status does not apply to TXT. Save.

- [Cloudflare: manage DNS records](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/)

**GoDaddy** _(variant: godaddy)_

1. godaddy.com > My Products > next to your domain click DNS (or Manage DNS).
2. Click Add New Record. Type TXT, Name _beacon-verify, Value = the value above, TTL 1 Hour (or lower). Save.

- [GoDaddy: add a TXT record](https://www.godaddy.com/help/add-a-txt-record-19232)

**AWS Route 53** _(variant: route53)_

1. AWS console > Route 53 > Hosted zones > click your domain > Create record.
2. Record name: _beacon-verify, Record type: TXT, Value: the value above wrapped in double quotes, TTL 300. Create records.

- [AWS: creating records](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating.html)

**Namecheap** _(variant: namecheap)_

1. namecheap.com > Domain List > Manage next to the domain > Advanced DNS tab.
2. Add New Record. Type TXT Record, Host _beacon-verify, Value = the value above, TTL Automatic. Click the green check to save.
3. This only works if the domain uses Namecheap BasicDNS/PremiumDNS (Nameservers: Namecheap BasicDNS). Otherwise edit DNS at the provider that hosts your nameservers.

- [Namecheap: add a TXT record](https://www.namecheap.com/support/knowledgebase/article.aspx/317/2237/how-do-i-add-txtspfdkimdmarc-records-for-my-domain/)

**Google Domains / Squarespace Domains** _(variant: google_squarespace)_

1. Google Domains was migrated to Squarespace Domains. Go to account.squarespace.com > Domains > click the domain > DNS > DNS settings.
2. Under Custom records click Add record. Type TXT, Host _beacon-verify, Data = the value above. Save.
3. If your domain is on Google Cloud DNS instead: console.cloud.google.com > Network services > Cloud DNS > zone > Add standard > TXT.

- [Squarespace: DNS records](https://support.squarespace.com/hc/en-us/articles/360002101888-Adding-custom-DNS-records-to-your-Squarespace-managed-domain)

**Other providers** _(variant: other)_

1. Open the DNS or "Advanced DNS" page of the provider that holds your nameservers (look up with: whois acme.com or dnschecker.org).
2. Add the TXT record above. If you do not control DNS, send this page to the person who does; the test works from any browser session.

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `dns_txt_present` | TXT record found | DNS-over-HTTPS TXT lookup of _beacon-verify.<domain> on Cloudflare (1.1.1.1) and Google (8.8.8.8) resolvers; value must exactly equal the issued token. Failed: no record. Partial: record present on one resolver only (propagation in progress) or the value is wrapped in extra quotes/whitespace (we trim and warn). |
| `dns_authoritative_match` | Authoritative nameserver match | Query the domain NS records, then ask each authoritative nameserver directly for the TXT. Partial: TXT present at the authoritative server but not at public resolvers yet (wait), or the record was added at a provider that is not the authoritative one (common with Namecheap/GoDaddy when nameservers point to Cloudflare). |


## 12. GEO / SEO analytics tools

Group: stack · Icon: LineChart · Optional · 2 live test(s)

**Why we need it:** If you already pay for Peec.ai, Ahrefs, Similarweb, Profound, AthenaHQ or Semrush, we can read their data (rankings, traffic estimates, citation data) instead of buying it twice. Choose an API key, or add us as a seat (a user in the tool).

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `analytics_tools` | Tools you use | multiselect |  |
| `analytics_credentials` | Access per tool | repeater | Add one row per tool. |
↳ | `tool` | Tool | select (required) |  |
↳ | `access_type` | Access type | radio (required) |  |
↳ | `api_key` | API key | secret | shown if `access_type` = api_key |
↳ | `tool_name_other` | Tool name (if Other) | text | shown if `tool` = other |
↳ | `project_id` | Project / workspace name | text |  |

### Grant instructions

**Required permission**

1. Always the read-only level. We never need billing access or admin rights. Seat role: Viewer / Read-only / Analyst (where offered). API keys: read-only or default (most are read-only by design).
2. For seats, invite {{AGENCY_EMAIL}} (or the domain user from step 3).

**Peec.ai**

1. app.peec.ai > Settings > Team > Invite {{AGENCY_EMAIL}} with the Viewer role. API access (beta, if enabled for your plan): Settings > API keys > Create key. Confirm the current labels; Peec updates their UI often.

- [Peec.ai](https://peec.ai)

**Ahrefs**

1. app.ahrefs.com > Account settings > API keys > Create API key (API v3, requires Enterprise plan or the API add-on). Otherwise: Account settings > Members > Invite {{AGENCY_EMAIL}} as Member with Read-only access to the project.

- [Ahrefs API v3](https://docs.ahrefs.com/docs/api/reference/introduction)

**Similarweb**

1. pro.similarweb.com > Account > API Management > copy or create the API key (requires the API subscription). Otherwise invite {{AGENCY_EMAIL}} from Account > Users.

- [Similarweb API](https://developers.similarweb.com/)

**Profound**

1. tryprofound.com > Settings > API keys > Create key (enterprise plans). Otherwise Settings > Team members > Invite {{AGENCY_EMAIL}} as a Viewer.

- [Profound](https://www.tryprofound.com)

**AthenaHQ**

1. app.athenahq.ai > Settings > API Keys > Create API key. Otherwise Settings > Members > Invite {{AGENCY_EMAIL}} as a Member (not Admin).

- [AthenaHQ](https://www.athenahq.ai)

**Semrush**

1. semrush.com > profile menu > Subscription info (or Profile) > API (Semrush API units) > copy your API key. Otherwise: Company settings > Users > Invite {{AGENCY_EMAIL}} with the Guest role (or Share a project).
2. API units are consumed by our calls. Tell us if you want a cap.

- [Semrush API](https://developer.semrush.com/api/)

**Other tool**

1. Choose Other, name the tool, and either paste the API key or add us as a viewer. We reply within one business day if we need more.

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `analytics_key_valid` | API keys valid | Per tool, one low-cost authenticated call: Ahrefs GET /v3/subscription-info/limits-and-usage; Semrush GET /users/countapiunits.html; Similarweb GET /v1/user-capabilities; AthenaHQ list API keys / site call via its API; Profound and Peec.ai: documented "me"/projects endpoint (to be confirmed per account). Failed: 401. Partial: key valid but zero API units/credits left or the project not found. |
| `analytics_seat_accepted` | Seat invitation accepted | For seat rows: a human confirms the invite (we cannot call the tools). We check by a scheduled login/API probe and mark the row "pending" until we can see the project. Partial: seat found but role is Admin (we flag as over-permissioned) or has no access to the right project. |


## 13. AWS (S3 + CloudFront) for visual assets

Group: stack · Icon: Database · Optional · 4 live test(s)

**Why we need it:** We generate charts, social images and infographics for your articles. They need a fast, public home on your domain (for example assets.acme.com) so they are served from your brand, cached worldwide and cited by AI engines. We use a least-privilege role limited to one folder of one bucket.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `cloud_provider` | Cloud provider | select (required) |  |
| `aws_account_id` | AWS account ID | text (required) | shown if `cloud_provider` = aws |
| `aws_region` | Bucket region | text (required) | shown if `cloud_provider` = aws |
| `s3_bucket` | S3 bucket name | text (required) | shown if `cloud_provider` = aws |
| `cloudfront_distribution_id` | CloudFront distribution ID | text (required) | shown if `cloud_provider` = aws |
| `cdn_base_url` | Public asset URL | url | The domain that serves the CloudFront distribution. |
| `aws_role_arn` | IAM role ARN | text (required) | shown if `cloud_provider` = aws |
| `aws_access_key_id` | Access key ID (only if you cannot create a role) | text | shown if `cloud_provider` = aws |
| `aws_secret_access_key` | Secret access key | secret | shown if `cloud_provider` = aws |
| `cloud_other_notes` | Your storage details | textarea | shown if `cloud_provider` = gcp/azure; GCP: bucket, project and service account email. Azure: storage account, container, CDN profile and endpoint. |

### Grant instructions

**Required permission (exact)** _(variant: aws)_

1. An IAM role in your account that we assume. Allowed: S3 list/read/write/delete only under the prefix beacon/ in one bucket; CloudFront invalidations on one distribution. Denied by omission: every other service, every other bucket, IAM, billing.
2. No access keys are created in your account. We authenticate with our own AWS principal and a unique ExternalId (confused-deputy protection).
3. Optional: if your policy forbids cross-account roles, create an IAM user with the same permissions policy and give us its access key. Rotate it every 90 days. This is less secure; we prefer the role.

**1. Create the bucket and CloudFront distribution** _(variant: aws)_

1. AWS console > S3 > Create bucket. Name e.g. acme-assets. Keep Block all public access ON (CloudFront reads it, the internet does not). Enable default encryption (SSE-S3).
2. CloudFront > Create distribution. Origin domain: your bucket. Origin access: Origin access control settings (recommended) > Create new OAC. Viewer protocol: Redirect HTTP to HTTPS. Cache policy: CachingOptimized. Optionally add an alternate domain name (assets.acme.com) and an ACM certificate in us-east-1.
3. CloudFront shows a banner "Copy policy". Paste it into S3 > bucket > Permissions > Bucket policy, or use the policy below (replace the three UPPERCASE placeholders).
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontOAC",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::YOUR_BUCKET/*",
    "Condition": { "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/YOUR_DISTRIBUTION_ID" } }
  }]
}
```

5. Add the DNS CNAME for assets.acme.com to the distribution domain (d123.cloudfront.net) at your DNS provider.

- [AWS: restrict access to S3 with OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)

**2. Create the least-privilege IAM role** _(variant: aws)_

1. IAM > Roles > Create role > Custom trust policy. Paste this trust policy (replace nothing: the principal and ExternalId are generated for your account):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "{{AWS_PRINCIPAL_ARN}}" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "sts:ExternalId": "{{AWS_EXTERNAL_ID}}" } }
  }]
}
```

3. Next > skip attaching managed policies > name the role ASO EngineGeoAssets > Create role.
4. Open the role > Permissions > Add permissions > Create inline policy > JSON. Paste the policy below, replacing YOUR_BUCKET, ACCOUNT_ID and YOUR_DISTRIBUTION_ID. Name it ASO EngineGeoAssetsLeastPrivilege > Create policy.
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucketOnlyASO EnginePrefix",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET",
      "Condition": { "StringLike": { "s3:prefix": ["beacon/*"] } }
    },
    {
      "Sid": "ReadWriteDeleteASO EngineObjects",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:AbortMultipartUpload"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET/beacon/*"
    },
    {
      "Sid": "InvalidateOneDistribution",
      "Effect": "Allow",
      "Action": ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation", "cloudfront:ListInvalidations", "cloudfront:GetDistribution"],
      "Resource": "arn:aws:cloudfront::ACCOUNT_ID:distribution/YOUR_DISTRIBUTION_ID"
    }
  ]
}
```

6. Copy the role ARN (top of the role page) into this form, with the bucket, region and distribution ID.
7. Set the role Maximum session duration to 1 hour (default).

- [AWS: cross-account role with ExternalId](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_third-party.html)

**Google Cloud equivalent** _(variant: gcp)_

1. Cloud Storage > Create bucket (uniform access, public access prevention on). Add a Cloud CDN backend bucket behind a global external Application Load Balancer.
2. IAM > Service Accounts > Create beacon-geo-assets. On the bucket: Permissions > Grant access > the service account > role Storage Object Admin with an IAM Condition resource.name.startsWith("projects/_/buckets/BUCKET/objects/beacon/"). For cache invalidation add a custom role with compute.urlMaps.invalidateCache on the one URL map.
3. Create a JSON key and put it in the secure field (or send details in the notes field if you prefer Workload Identity Federation).

**Azure equivalent** _(variant: azure)_

1. Create a storage account and a container "assets". Put Azure Front Door/CDN in front of it.
2. Create an app registration "ASO Engine" (Entra ID > App registrations) with a client secret, or a federated credential.
3. Role assignments: Storage Blob Data Contributor scoped to that one container, and CDN Endpoint Contributor (or Front Door Contributor) scoped to that one profile only.
4. Enter tenant ID, client ID, storage account and endpoint in the notes field; paste the client secret in a secure field (tell us and we add one).

**No cloud account** _(variant: none)_

1. No problem. We host assets on our CDN under an ASO Engine domain (or a subdomain you point to us). Mention it in the review step.

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `aws_assume_role` | Role can be assumed | sts:AssumeRole with our principal and the ExternalId (or sts:GetCallerIdentity if access keys). Failed: AccessDenied. Partial: "ExternalId mismatch" (trust policy contains a different ExternalId) or MaxSessionDuration below 15 minutes. |
| `aws_s3_rw` | S3 read/write under beacon/ | PutObject beacon/_connection-test.txt, GetObject, DeleteObject; then try ListBucket without prefix (must be denied) and PutObject outside beacon/ (must be denied). Partial: write works but delete fails; or the role can write outside beacon/ ("over-permissioned"), which we flag as a security warning. |
| `aws_cloudfront_invalidate` | CloudFront invalidation | GetDistribution (status Deployed) and CreateInvalidation for /beacon/_connection-test.txt. Partial: GetDistribution ok but CreateInvalidation denied (policy missing cloudfront:CreateInvalidation), or distribution is still "InProgress". |
| `aws_public_fetch` | Asset is served publicly | GET {cdn_base_url}/beacon/_connection-test.txt must return 200 with content-type text/plain and a cache header (x-cache). Partial: 403 (OAC/bucket policy missing) or served over HTTP only or the custom domain certificate is invalid. |


## 14. Cloudflare / CDN (AI crawler monitoring)

Group: stack · Icon: ShieldCheck · Optional · 4 live test(s)

**Why we need it:** Your CDN logs every visit from AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended...). We read those logs to show which engines can reach your content, how often, and which pages they never fetch.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `cdn_provider` | CDN / WAF provider | select (required) |  |
| `cf_zone_name` | Zone (domain) | text (required) | shown if `cdn_provider` = cloudflare |
| `cf_account_id` | Account ID | text (required) | shown if `cdn_provider` = cloudflare; dash.cloudflare.com > Account home > the three-dot menu next to your account > Copy account ID. |
| `cf_api_token` | Scoped API token | secret (required) | shown if `cdn_provider` = cloudflare |
| `cdn_other_notes` | Provider details | textarea | shown if `cdn_provider` = fastly/akamai/vercel/other; Fastly: service ID. Akamai: property. Vercel: team slug. We reply with the exact read-only token to create. |

### Grant instructions

**Required permission (exact, read-only)** _(variant: cloudflare)_

1. Create one User API token (or Account-owned token) with these permissions and nothing else:
2. Zone > Zone > Read
3. Zone > Analytics > Read
4. Zone > AI Crawl Control > Read (shown as "AI Crawl Control Read"; AI Crawl Control was formerly "AI Audit")
5. Account > Account Analytics > Read
6. Optional, Enterprise plans only: Zone > Logs > Read (raw logpull, for page-level crawler history).
7. Zone Resources: Include > Specific zone > your domain. Account Resources: Include > your account. Set an expiry of 12 months and (optional) restrict to our IP range, which we show you.
8. No Edit/Write permission is requested. We never change your Cloudflare configuration.

**Create the token** _(variant: cloudflare)_

1. dash.cloudflare.com > My Profile (top right avatar) > API Tokens > Create Token > Create Custom Token > Get started.
2. Token name: ASO Engine crawler monitoring. Add the permission rows listed above using the dropdowns (Zone / Account, then the permission, then Read).
3. Zone Resources > Include > Specific zone > your zone. Account Resources > Include > your account.
4. Continue to summary > Create Token. Copy the token once and paste it in the secure field.
5. AI Crawl Control is available on all plans for viewing, but some metrics need Pro or higher. If the dashboard menu is missing, open your domain > AI Crawl Control (it may sit under Security).

- [Cloudflare: create an API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [Cloudflare: AI Crawl Control](https://developers.cloudflare.com/ai-crawl-control/)

**Fastly** _(variant: fastly)_

1. Account > Personal profile > API tokens > Create token. Scope: Global API access is too broad; choose Read only access (global:read) restricted to your service. Paste details in the notes field and tell us; we confirm real-time log streaming (S3/BigQuery) options.

**Akamai** _(variant: akamai)_

1. Control Center > Account admin > Identity & access > API users > Create API client with read-only DataStream 2 and Reporting API access to the one property. Send details through the notes field.

**Vercel** _(variant: vercel)_

1. Vercel dashboard > Team settings > Tokens > Create token scoped to your team, expiry 12 months. Role needed: Viewer. We read Firewall and Observability data for AI bot traffic.

**Other / none** _(variant: other)_

1. If you have no CDN, we measure AI crawler visits only with a lightweight server-log or analytics script on your site. Tell us what you can install in the notes.

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `cf_token_valid` | Token valid and active | GET /client/v4/user/tokens/verify (or /accounts/{id}/tokens/verify) returns status "active". Failed: invalid/expired. |
| `cf_zone_access` | Zone access | GET /zones?name={zone} returns the zone with status active. Partial: token valid but zone not in its Zone Resources ("scoped to a different zone"), or write permissions found (token over-permissioned: we warn and recommend a read-only token). |
| `cf_analytics` | Analytics readable | GraphQL Analytics API: httpRequestsAdaptiveGroups for the last 24 hours filtered on userAgent containing GPTBot/ClaudeBot/PerplexityBot. Partial: zero requests (no AI crawler traffic yet, or bot rules block them), or adaptive logs not on your plan (limited to 24h–3 days). |
| `cf_ai_crawl_control` | AI Crawl Control readable | Read the zone AI Crawl Control crawler list/metrics endpoint (exact REST path confirmed at build time; API reference: developers.cloudflare.com/ai-crawl-control). Partial: 403 means the "AI Crawl Control Read" permission is missing; feature unavailable means the zone is on a plan without it. |


## 15. Slack / Teams (bot)

Group: stack · Icon: MessageSquare · Optional · 2 live test(s)

**Why we need it:** Our bot posts weekly visibility reports, alerts when you lose a citation or AI crawlers get blocked, and lets your team ask questions in a channel. It can only act in channels you invite it to.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `chat_platform` | Where does your team chat? | radio (required) |  |
| `slack_workspace_url` | Slack workspace URL | url (required) | shown if `chat_platform` = slack |
| `slack_channel` | Channel for reports | text (required) | shown if `chat_platform` = slack |
| `slack_bot_token` | Bot token or incoming webhook URL | secret (required) | shown if `chat_platform` = slack; Create a Slack app in your own workspace and install it (xoxb-... bot token), or add an Incoming Webhook to a channel and paste its URL. We do not run an agency-registered Slack app. |
| `teams_tenant_id` | Microsoft Entra tenant ID | text (required) | shown if `chat_platform` = teams |
| `teams_team_channel` | Team and channel name | text (required) | shown if `chat_platform` = teams |

### Grant instructions

**Required scopes (bot token)** _(variant: slack)_

1. chat:write (post messages in channels the bot is in)
2. chat:write.public (post to public channels without joining)
3. channels:read (see public channel names so you can pick one)
4. channels:join (join the channel you choose)
5. groups:read (see private channels the bot was invited to)
6. users:read (resolve @mentions)
7. im:write (send direct messages, e.g. alerts)
8. commands (slash command /beacon)
9. files:write (upload report images and PDFs)
10. We do not request: channels:history, users:read.email, admin.*. We cannot read your messages.

**Install (Slack admin or Workspace Owner)** _(variant: slack)_

1. Go to api.slack.com/apps > Create New App > From scratch, in your workspace. Add the scopes above (or, for posting only, enable Incoming Webhooks and add one for your channel).
2. Click Install to Workspace. If your workspace requires app approval, a Workspace Admin approves it under Tools & settings > Manage apps > Requests. Copy the Bot User OAuth Token (or webhook URL) into the field above.
3. In the target channel, type /invite @ASO Engine (needed for private channels).
4. Click Test in this wizard to see a "ASO Engine is connected" message appear in your channel.

- [Slack: manage app approvals](https://slack.com/help/articles/222386767-Manage-app-approval-for-your-workspace)

**Microsoft Teams** _(variant: teams)_

1. A Global Administrator or Application Administrator must grant admin consent. Entra admin center (entra.microsoft.com) > Identity > Applications > Enterprise applications > Consent and permissions, or follow the admin-consent link we send.
2. Application permissions requested: ChannelMessage.Send (post to a channel), Channel.ReadBasic.All (list channels), Team.ReadBasic.All (list teams). We do not request read access to messages.
3. Teams admin center (admin.teams.microsoft.com) > Teams apps > Manage apps > upload or allow "ASO Engine", then add it to the team: Teams > the team > Manage team > Apps > Add an app.
4. Enter your tenant ID (Entra admin center > Overview > Tenant ID) and the channel in the form.

- [Microsoft: grant tenant-wide admin consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/grant-admin-consent)

**No chat tool** _(variant: none)_

1. We will email reports to the contacts in the review step.

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `chat_auth` | Bot installed with the right scopes | Slack auth.test and read the x-oauth-scopes response header; all scopes above must be present. Partial: lists missing scopes (e.g. "missing files:write"). Teams: acquire a client-credentials token for tenant and decode the roles claim (ChannelMessage.Send, Channel.ReadBasic.All, Team.ReadBasic.All). |
| `chat_post` | Test message delivered | Slack chat.postMessage to the channel then delete it (or leave "ASO Engine is connected"). Partial: not_in_channel (bot not invited to a private channel) or channel_not_found. Teams: POST /teams/{id}/channels/{id}/messages. |


## 16. YouTube channel (education)

Group: stack · Icon: Video · Optional · 1 live test(s)

**Why we need it:** A separate expert-education channel turns each approved article into a short video whose titles, descriptions, chapters and captions link back to your blog. Uploads run hands-free after a one-time Google consent. The presenter is a branded AI persona, videos are marked as synthetic media and the description says the voice is AI.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `youtube_channel_name` | Channel name | text (required) | A branded name, never a person's name. Not your main brand channel. |
| `youtube_persona_name` | Presenter persona | text (required) | A brand persona, not a real person. No titles or credentials. |
| `youtube_channel_url` | Channel URL (after creating it) | url |  |

### Grant instructions

**One-time manual setup (YouTube cannot create channels through its API)**

1. Use a Google account owned by your company (for example youtube@acme.com). Sign in at youtube.com.
2. Click your avatar > Create a channel, and choose a Brand Account so ownership can move between people.
3. Name it as in the field above. Add the avatar and banner from your brand assets. In About, say the videos use an AI presenter voice and put your blog link first.
4. Verify the channel by phone (required for custom thumbnails). Defaults: category Education, made for kids: No.
5. Open the YouTube tab in ASO Engine and press Connect channel. Pick the Brand Account channel in Google's account picker and accept. We request upload and manage-captions access only; the token is stored in your vault and you can revoke it at myaccount.google.com/permissions.
6. Click Test here to confirm the channel is reachable.

- [YouTube: create a channel with a Brand Account](https://support.google.com/youtube/answer/1646861)

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `youtube_connected` | Channel connected | Exchange the stored refresh token for an access token and call channels.list (1 quota unit). Fail: token revoked or expired (reconnect from the YouTube tab) or the Google account has no channel. |


## 17. Review & submit

Group: stack · Icon: ClipboardCheck · Required · 1 live test(s)

**Why we need it:** One last look. We show every step with a status, so you can see what works, what is partial and what to fix. You can submit with optional steps pending; required steps must be green.

### Fields

| ID | Label | Type | Notes |
|---|---|---|---|
| `billing_contact_email` | Contact for reports and alerts | email (required) |  |
| `final_confirm` | I confirm the information and access granted are accurate and that I am authorised to grant them. | radio (required) |  |

### Grant instructions

**What happens next**

1. We run all live tests one more time and email you a summary.
2. Within one business day a strategist reviews your brand book and starts the first prompt discovery and baseline report.
3. You can revoke any access at any time from the tool where you granted it. Secrets you entered here can be deleted from Settings > Integrations.

### Live tests

| Test ID | What it proves | API call, and what "partial" looks like |
|---|---|---|
| `review_all_required_green` | All required tests pass | Aggregates every required step. Blocked if any required test is failed. Partial/warning tests on required steps (e.g. GSC Full, not Owner) block submission until accepted by a platform admin; optional steps can be skipped. |


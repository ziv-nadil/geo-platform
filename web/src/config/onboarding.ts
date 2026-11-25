/**
 * Beacon GEO — client onboarding wizard config (consumed by the UI).
 * Human-readable twin: docs/product/onboarding-spec.md (generated from this file).
 *
 * Conventions for the UI:
 * - Instruction text may contain these placeholders; substitute them per client before rendering:
 *     {{AGENCY_EMAIL}}          our dedicated agency Google/Microsoft identity (placeholder geo-ops@<yourdomain>)
 *     {{AGENCY_GITHUB_USER}}    our GitHub bot/user login
 *     {{SERVICE_ACCOUNT_EMAIL}} the per-client Google service account (created in step 9)
 *     {{DNS_TXT_NAME}} / {{DNS_TXT_VALUE}}  per-client DNS verification record
 *     {{AWS_PRINCIPAL_ARN}} / {{AWS_EXTERNAL_ID}}  our AWS principal and the per-client ExternalId
 *     {{ADS_MANAGER_ID}}        our Google Ads manager (MCC) customer ID
 * - A step string that contains ``` fences is a preformatted block (JSON/code): render it monospace with a copy button.
 * - A test applies only when ALL its `requires` field ids have a value (fields hidden by showIf do not count).
 * - Fields of type 'secret' go straight to the vault; never echo them back.
 * - Instruction blocks with a `variant` are shown only when the step's selector field equals that variant
 *   (selector = cms_platform, access_method, dns_provider, cdn_provider, cloud_provider, chat_platform).
 *   Blocks without a variant are always shown.
 */

export type FieldType = 'text'|'url'|'textarea'|'select'|'multiselect'|'file'|'secret'|'email'|'table'|'repeater'|'radio';
export interface FieldDef { id: string; label: string; type: FieldType; required?: boolean; placeholder?: string; help?: string; options?: {value:string;label:string}[]; accept?: string; columns?: FieldDef[]; fields?: FieldDef[]; min?: number; max?: number; showIf?: { field: string; equals: string | string[] }; }
export interface InstructionBlock { title: string; steps: string[]; links?: {label:string; href:string}[]; variant?: string /* e.g. CMS or DNS provider value this applies to */ }
export interface TestDef { id: string; label: string; description: string; requires: string[] /* field ids */ }
export interface OnboardingStep { id: string; title: string; short: string; icon: string /* lucide icon name */; group: 'company'|'brand'|'access'|'stack'; why: string; fields: FieldDef[]; instructions: InstructionBlock[]; tests: TestDef[]; optional?: boolean; }

const opt = (...vals: string[]) => vals.map((v) => ({ value: v.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label: v }));

// ---------------------------------------------------------------------------
// Preformatted snippets (rendered inside instruction steps)
// ---------------------------------------------------------------------------
const AWS_TRUST_POLICY = `\`\`\`json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "{{AWS_PRINCIPAL_ARN}}" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "sts:ExternalId": "{{AWS_EXTERNAL_ID}}" } }
  }]
}
\`\`\``;

// Replace YOUR_BUCKET, YOUR_DISTRIBUTION_ID, ACCOUNT_ID before pasting.
const AWS_PERMISSIONS_POLICY = `\`\`\`json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucketOnlyBeaconPrefix",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET",
      "Condition": { "StringLike": { "s3:prefix": ["beacon/*"] } }
    },
    {
      "Sid": "ReadWriteDeleteBeaconObjects",
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
\`\`\``;

const AWS_BUCKET_POLICY_FOR_CF = `\`\`\`json
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
\`\`\``;

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
export const ONBOARDING_STEPS: OnboardingStep[] = [
  // 1 ----------------------------------------------------------------------
  {
    id: 'company',
    title: 'Company info & brand assets',
    short: 'Company',
    icon: 'Building2',
    group: 'company',
    why: 'We use your name, site and social profiles to find where AI engines already mention you, and your logos and design system so every chart, report and generated visual looks like your brand.',
    fields: [
      { id: 'company_name', label: 'Company name', type: 'text', required: true, placeholder: 'Acme Inc.' },
      { id: 'website_url', label: 'Primary website', type: 'url', required: true, placeholder: 'https://www.acme.com', help: 'The canonical domain AI engines should cite.' },
      { id: 'social_linkedin', label: 'LinkedIn company page', type: 'url', placeholder: 'https://www.linkedin.com/company/acme' },
      { id: 'social_x', label: 'X (Twitter)', type: 'url', placeholder: 'https://x.com/acme' },
      { id: 'social_reddit', label: 'Reddit (brand account or subreddit)', type: 'url', placeholder: 'https://www.reddit.com/r/acme' },
      { id: 'social_instagram', label: 'Instagram', type: 'url', placeholder: 'https://www.instagram.com/acme' },
      { id: 'social_facebook', label: 'Facebook', type: 'url', placeholder: 'https://www.facebook.com/acme' },
      { id: 'design_system_html', label: 'Design-system HTML', type: 'file', accept: '.html,.htm', help: 'A single self-contained HTML style guide (max 2 MB) showing colors, type, buttons, cards. Export from Figma/Storybook or ask your designer.' },
      { id: 'logo_light', label: 'Logo for light backgrounds', type: 'file', required: true, accept: '.svg,.png', help: 'SVG preferred. Transparent background, dark-colored logo.' },
      { id: 'logo_dark', label: 'Logo for dark backgrounds', type: 'file', required: true, accept: '.svg,.png', help: 'SVG preferred. Transparent background, light-colored logo.' },
      { id: 'favicon_light', label: 'Favicon for light mode', type: 'file', required: true, accept: '.ico,.png,.svg', help: 'At least 48x48 px. Square.' },
      { id: 'favicon_dark', label: 'Favicon for dark mode', type: 'file', required: true, accept: '.ico,.png,.svg' },
    ],
    instructions: [
      {
        title: 'Where to find your assets',
        steps: [
          'Logos: ask your designer for the "primary logo" in SVG. If you only have a PNG, use one that is at least 1000 px wide with a transparent background.',
          'Provide two versions: one that looks good on white (dark ink) and one that looks good on dark backgrounds (light ink). If your logo is one color, send the same file twice.',
          'Favicons: the small square icon in the browser tab. Open https://www.yourdomain.com/favicon.ico in a browser and save it, or ask your web developer for the light and dark variants.',
          'Design-system HTML: any page that shows your colors, fonts, buttons and spacing. A Storybook "static build", a Figma "Dev Mode" export, or a simple style-guide page all work. A zip is fine if it needs CSS or font files.',
          'Do not upload files containing passwords, customer data or unreleased products.',
        ],
      },
    ],
    tests: [
      { id: 'company_site_reachable', label: 'Website reachable', description: 'HTTP GET on website_url follows redirects and returns 200 with HTML. Partial: redirects to a different domain than entered, returns 403/401 (bot protection blocks us), or lacks a robots.txt we can read.', requires: ['website_url'] },
      { id: 'company_assets_valid', label: 'Brand assets valid', description: 'Server-side checks on the uploaded files: MIME type matches extension, SVG sanitised (no scripts), logos have transparency, favicons are square and at least 48 px, design-system HTML parses and exposes CSS color variables. Partial: any optional asset missing or a light/dark pair is byte-identical (warning, not failure).', requires: ['logo_light', 'logo_dark', 'favicon_light', 'favicon_dark'] },
      { id: 'company_socials_resolve', label: 'Social profiles resolve', description: 'HEAD/GET each provided social URL; expects 200 and the hostname to match the network. Partial: a profile returns 404 or is private; networks that block unauthenticated checks (LinkedIn, Instagram) report "could not verify" instead of failed.', requires: ['website_url'] },
    ],
  },

  // 1b ---------------------------------------------------------------------
  {
    id: 'geo_readiness',
    title: 'GEO readiness',
    short: 'GEO readiness',
    icon: 'ScanSearch',
    group: 'company',
    optional: true,
    why: 'Before we create content, we check whether AI engines can actually reach, read and cite your site: robots.txt, llms.txt, sitemap, speed, server-side rendering, structured data and any firewall that blocks AI crawlers. You get a prioritized fix list with step-by-step instructions for your platform.',
    fields: [],
    instructions: [
      { title: 'How the audit works', steps: ['We request your robots.txt, llms.txt, sitemap and a few pages exactly like AI crawlers do (including with GPTBot, ClaudeBot and PerplexityBot user agents).', 'We score each check from 0 to 100 and list the fixes that matter most first.', 'Fix the top items, then press "Re-run audit" to see your score improve. You can re-run it any time from Site health.'] },
    ],
    tests: [
      { id: 'geo_score', label: 'GEO readiness audit', description: 'Real requests to your site: robots.txt AI bot rules, llms.txt, sitemap freshness, PageSpeed Insights (LCP, CLS, INP, TTFB), server-side rendering, canonical/noindex, structured data, headings, author/date, internal links, HTTPS, hreflang, page weight and WAF/CDN bot blocking. Partial: some categories score below 70. Fail: most categories need work.', requires: ['website_url'] },
    ],
  },

  // 2 ----------------------------------------------------------------------
  {
    id: 'brand_book',
    title: 'Brand book',
    short: 'Brand book',
    icon: 'BookOpen',
    group: 'brand',
    why: 'AI engines describe you using the words found across the web. We use your positioning, customers, competitors and voice to choose the prompts we track and to write content that sounds like you and repeats the same facts everywhere.',
    fields: [
      { id: 'company_description', label: 'Company description', type: 'textarea', required: true, placeholder: 'What you do, for whom, and what makes you different. 3-6 sentences.' },
      { id: 'product_in_focus', label: 'Product in focus', type: 'textarea', required: true, help: 'The product or service we should grow AI visibility for. Name, what it does, pricing model, main use cases.' },
      {
        id: 'icp_profiles', label: 'Ideal customer profiles (3 company profiles)', type: 'repeater', required: true, min: 3, max: 3,
        help: 'Describe three types of companies you sell to. For each, add two buyer personas.',
        fields: [
          { id: 'profile_name', label: 'Company profile name', type: 'text', required: true, placeholder: 'Mid-market B2B SaaS' },
          { id: 'profile_description', label: 'Description (industry, size, region, needs)', type: 'textarea', required: true },
          {
            id: 'personas', label: 'Personas (2 per company profile)', type: 'repeater', required: true, min: 2, max: 2,
            fields: [
              { id: 'persona_title', label: 'Job title', type: 'text', required: true, placeholder: 'VP Marketing' },
              { id: 'persona_goals', label: 'Goals', type: 'textarea', required: true },
              { id: 'persona_pains', label: 'Pains / objections', type: 'textarea', required: true },
              { id: 'persona_questions', label: 'Questions they ask an AI assistant', type: 'textarea', help: 'Example: "What is the best tool for X?" We use these to seed tracked prompts.' },
            ],
          },
        ],
      },
      { id: 'kpi_main_event', label: 'Main conversion event', type: 'text', required: true, placeholder: 'demo_request', help: 'The one event that means success (as named in GA4).' },
      { id: 'kpi_secondary_event', label: 'Secondary event to monitor', type: 'text', placeholder: 'newsletter_signup' },
      {
        id: 'competitors', label: 'Top 5 competitors', type: 'table', required: true, min: 5, max: 5,
        columns: [
          { id: 'competitor_name', label: 'Name', type: 'text', required: true },
          { id: 'competitor_website', label: 'Website', type: 'url', required: true },
          { id: 'competitor_better', label: 'What they do better', type: 'textarea', required: true },
          { id: 'we_better', label: 'What we do better', type: 'textarea', required: true },
        ],
      },
      { id: 'msg_one_liner', label: 'One-liner', type: 'text', required: true, placeholder: 'Max 15 words.' },
      { id: 'msg_main', label: 'Main message', type: 'textarea', required: true },
      { id: 'msg_secondary', label: 'Secondary message', type: 'textarea' },
      { id: 'msg_third', label: 'Third message', type: 'textarea' },
      {
        id: 'msg_numbers', label: 'Numbers we claim', type: 'repeater', help: 'Only claims you can prove. We repeat them consistently so AI engines pick them up.',
        fields: [
          { id: 'number_claim', label: 'Claim', type: 'text', required: true, placeholder: '4,200 customers in 60 countries' },
          { id: 'number_source', label: 'Source / proof URL', type: 'url' },
        ],
      },
      { id: 'voice_say', label: 'Voice: say', type: 'textarea', required: true, placeholder: 'Words, phrases and tone we use (one per line).' },
      { id: 'voice_dont_say', label: 'Voice: do not say', type: 'textarea', required: true, placeholder: 'Words, phrases, claims and competitor mentions to avoid (one per line).' },
    ],
    instructions: [
      {
        title: 'Tips for a good brand book',
        steps: [
          'Reuse what you already have: your homepage hero, About page, sales deck and latest investor or press boilerplate.',
          'ICP: think "who actually buys". Three company types, two decision-makers each. If you only have two company types, split your biggest one by size or industry.',
          'Competitors: choose companies a buyer would compare you with in an AI chat, not just direct rivals. Add their homepage.',
          'Numbers: only include figures you can show on a public page. AI engines cross-check claims.',
          'You can save and come back anytime. This step needs a marketing owner, not IT.',
        ],
      },
    ],
    tests: [
      { id: 'brand_complete', label: 'Brand book complete', description: 'Schema check: 3 ICP profiles with 2 personas each, 5 competitor rows, one-liner and main message present, voice lists non-empty. Partial: lists which sections are incomplete (e.g. "ICP 2 has 1 persona").', requires: ['company_description', 'icp_profiles', 'competitors'] },
      { id: 'brand_competitors_reachable', label: 'Competitor sites reachable', description: 'GET each competitor homepage (200 OK). Partial: unreachable or redirecting to a different domain; we flag the row but do not block.', requires: ['competitors'] },
    ],
  },

  // 3 ----------------------------------------------------------------------
  {
    id: 'access_method',
    title: 'How you grant us access',
    short: 'Access method',
    icon: 'KeyRound',
    group: 'access',
    why: 'Most tools below let you add a person. You choose whether we are added as a guest using our agency email (simplest, fully revocable, nothing for you to store) or whether you create a dedicated user in your own domain.',
    fields: [
      {
        id: 'access_method', label: 'Access method', type: 'radio', required: true,
        options: [
          { value: 'agency_email', label: 'Grant access to our agency email (recommended)' },
          { value: 'domain_user', label: 'Create a user for us in our domain' },
        ],
      },
      { id: 'domain_user_email', label: 'Email of the user you created for us', type: 'email', required: true, placeholder: 'beacon@acme.com', showIf: { field: 'access_method', equals: 'domain_user' } },
      { id: 'domain_user_password', label: 'Password', type: 'secret', required: true, help: 'Stored encrypted in our vault, visible to no one at the agency except the automated workers.', showIf: { field: 'access_method', equals: 'domain_user' } },
      { id: 'domain_user_totp', label: 'Two-factor (TOTP) secret key, if enabled', type: 'secret', help: 'The text key shown under the QR code when you set up an authenticator app. Not the 6-digit code.', showIf: { field: 'access_method', equals: 'domain_user' } },
    ],
    instructions: [
      {
        variant: 'agency_email',
        title: 'Option A: grant our agency email',
        steps: [
          'You will see our email in every following step: {{AGENCY_EMAIL}}.',
          'In each tool, add that address as a user with the exact permission listed in that step.',
          'Google tools (Search Console, GA4, Google Cloud) need a Google account. If {{AGENCY_EMAIL}} is a Google Workspace or Gmail address, no extra action. Other tools accept any email.',
          'To remove us later, delete that user in each tool. Nothing else to clean up.',
        ],
      },
      {
        variant: 'domain_user',
        title: 'Option B: create a user in your domain',
        steps: [
          'Ask your IT admin to create one dedicated user, e.g. beacon@yourcompany.com (Google Workspace Admin Console > Directory > Users > Add new user, or Microsoft 365 admin center > Users > Active users > Add a user).',
          'Give it a license that includes email so verification emails arrive. A shared mailbox is not enough for Google.',
          'Exclude the user from SSO redirects and conditional access that require a managed device, or we cannot log in from our servers.',
          'If two-factor is required, enroll an authenticator app and copy the text setup key (the text shown beside the QR code) into the TOTP field.',
          'Enter the email and password in the secure fields. They go directly to our encrypted vault, not into this form record.',
          'In each following step, grant that user the permissions shown, or assign it the same roles as your other admins.',
        ],
      },
    ],
    tests: [
      { id: 'access_method_recorded', label: 'Access method chosen', description: 'Field present and valid. Later steps adapt their wording to this choice.', requires: ['access_method'] },
      { id: 'access_user_credentials_stored', label: 'Domain user credentials stored', description: 'Vault lookup confirms the secret exists and email domain matches the company website domain. We cannot test login generically; each later step proves access through its own API call. Partial: password stored but no TOTP while the later steps report an MFA challenge.', requires: ['domain_user_email', 'domain_user_password'] },
    ],
  },

  // 4 ----------------------------------------------------------------------
  {
    id: 'github',
    title: 'GitHub (blog repository)',
    short: 'GitHub',
    icon: 'GitBranch',
    group: 'stack',
    why: 'If your blog or docs live in a Git repository (Markdown/MDX, Next.js, Astro, Hugo...), we open pull requests with new and updated articles. You review and merge; we never push to your main branch.',
    fields: [
      { id: 'github_repo', label: 'Repository (owner/name)', type: 'text', required: true, placeholder: 'acme/website' },
      { id: 'github_branch', label: 'Default branch', type: 'text', placeholder: 'main' },
      { id: 'github_content_path', label: 'Blog content folder', type: 'text', placeholder: 'content/blog', help: 'Where articles live. We only write inside this folder.' },
      {
        id: 'github_method', label: 'How to grant access', type: 'radio', required: true,
        options: [
          { value: 'invite', label: 'Invite our GitHub user as collaborator' },
          { value: 'token', label: 'Give us a fine-grained token' },
        ],
      },
      { id: 'github_token', label: 'Fine-grained personal access token', type: 'secret', required: true, showIf: { field: 'github_method', equals: 'token' } },
    ],
    instructions: [
      {
        title: 'Required permission',
        steps: [
          'Collaborator: Write role on that one repository (needed to push a branch and open PRs). Read is only partial.',
          'Token: Repository access = Only select repositories > your blog repo. Repository permissions: Contents = Read and write, Pull requests = Read and write, Metadata = Read-only (auto). Nothing else. Set expiry to 1 year.',
          'GitHub App route (we recommend if you have an org owner): install our app on that single repo with the same three permissions.',
        ],
      },
      {
        variant: 'invite',
        title: 'Invite our user (GitHub UI as of Nov 2026)',
        steps: [
          'Open the repository on github.com.',
          'Click Settings (top tab) > Collaborators and teams (left sidebar, under Access).',
          'Click Add people, search for {{AGENCY_GITHUB_USER}}, choose Write as the role, click Add.',
          'For repositories owned by an organization, an org owner may need to approve outside collaborators. We accept the invitation automatically within 15 minutes.',
        ],
        links: [{ label: 'GitHub docs: inviting collaborators', href: 'https://docs.github.com/en/account-and-profile/how-tos/setting-up-and-managing-your-personal-account-on-github/managing-access-to-your-personal-repositories/inviting-collaborators-to-a-personal-repository' }],
      },
      {
        variant: 'token',
        title: 'Create a fine-grained token',
        steps: [
          'On github.com click your avatar (top right) > Settings > Developer settings (bottom of left sidebar) > Personal access tokens > Fine-grained tokens > Generate new token.',
          'Resource owner: choose your organization (an org owner may have to enable fine-grained tokens first: Organization > Settings > Personal access tokens).',
          'Repository access: Only select repositories, choose the blog repo.',
          'Permissions: Contents = Read and write; Pull requests = Read and write. Metadata Read-only is added automatically.',
          'Click Generate token, copy it once, and paste it into the secure field here.',
        ],
        links: [{ label: 'GitHub docs: fine-grained tokens', href: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens' }],
      },
    ],
    tests: [
      { id: 'github_repo_access', label: 'Repository reachable', description: 'GET /repos/{owner}/{repo}. Checks the response field permissions: push must be true. Partial: "Read only: pull=true, push=false" (invite role is Read or Triage; raise to Write). 404 = invite not accepted or token not scoped to this repo.', requires: ['github_repo'] },
      { id: 'github_pr_probe', label: 'Can open pull requests', description: 'Create branch beacon/connection-test from the default branch via the Git Refs API, commit one file under the content folder, open a draft PR, then close the PR and delete the branch. Partial: branch push works but PR creation fails (token lacks Pull requests: write), or branch protection blocks branch creation by pattern.', requires: ['github_repo', 'github_method'] },
    ],
  },

  // 5 ----------------------------------------------------------------------
  {
    id: 'cms',
    title: 'CMS (publishing)',
    short: 'CMS',
    icon: 'PenSquare',
    group: 'stack',
    why: 'We create articles as drafts inside your CMS so your team can review and publish. We never publish without your approval unless you enable auto-publish later.',
    fields: [
      {
        id: 'cms_platform', label: 'Which CMS do you use?', type: 'select', required: true,
        options: [
          { value: 'wordpress', label: 'WordPress' }, { value: 'webflow', label: 'Webflow' }, { value: 'wix', label: 'Wix' },
          { value: 'sanity', label: 'Sanity' }, { value: 'contentful', label: 'Contentful' }, { value: 'hubspot', label: 'HubSpot' },
          { value: 'framer', label: 'Framer' }, { value: 'shopify', label: 'Shopify' }, { value: 'ghost', label: 'Ghost' }, { value: 'other', label: 'Other' },
        ],
      },
      { id: 'cms_site_url', label: 'Site / admin URL', type: 'url', required: true, placeholder: 'https://www.acme.com', help: 'WordPress/Ghost: your site address. Shopify: your-store.myshopify.com. Others: your live site.' },
      { id: 'cms_username', label: 'Username', type: 'text', placeholder: 'beacon', showIf: { field: 'cms_platform', equals: 'wordpress' }, help: 'The WordPress user that owns the Application Password.' },
      { id: 'cms_project_id', label: 'Project / Space / Site ID', type: 'text', placeholder: 'abc123', showIf: { field: 'cms_platform', equals: ['webflow', 'wix', 'sanity', 'contentful', 'framer'] }, help: 'Webflow Site ID; Wix Site ID; Sanity Project ID; Contentful Space ID; Framer project ID.' },
      { id: 'cms_dataset', label: 'Dataset / collection / environment', type: 'text', placeholder: 'production', showIf: { field: 'cms_platform', equals: ['sanity', 'contentful', 'webflow'] }, help: 'Sanity dataset; Contentful environment; Webflow blog collection ID.' },
      { id: 'cms_api_credential', label: 'API token / key / application password', type: 'secret', required: true, help: 'What to paste depends on your CMS; see the instructions for your CMS.', showIf: { field: 'cms_platform', equals: ['wordpress', 'webflow', 'wix', 'sanity', 'contentful', 'hubspot', 'framer', 'shopify', 'ghost'] } },
      { id: 'cms_other_notes', label: 'Tell us about your CMS', type: 'textarea', required: true, help: 'Name, whether it has a REST/GraphQL API, and how your team publishes today. We will reply within 1 business day with next steps.', showIf: { field: 'cms_platform', equals: 'other' } },
    ],
    instructions: [
      {
        variant: 'wordpress', title: 'WordPress',
        steps: [
          'Log in to wp-admin as an Administrator. Self-hosted WordPress 5.6+ or WordPress.com Business plan required (REST API and Application Passwords).',
          'Users > Add New User. Username: beacon, Email: {{AGENCY_EMAIL}}, Role: Editor (can create and edit posts and media; cannot install plugins). Uncheck "Send the user an email" if you do not want us to receive one.',
          'Open Users > All Users > beacon > Edit. Scroll to Application Passwords, type the name "Beacon GEO", click Add Application Password, and copy the generated password (spaces are fine).',
          'Enter the username and that application password in the form. The site must be served over HTTPS.',
          'If a security plugin or host (Wordfence, Cloudflare WAF, WP Engine) blocks /wp-json/, ask your host to allow our IP range, which we will email you.',
        ],
        links: [{ label: 'WordPress: Application Passwords', href: 'https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/' }],
      },
      {
        variant: 'webflow', title: 'Webflow',
        steps: [
          'You need to be a Workspace Admin or Site Admin.',
          'Open the Webflow Dashboard > the site > Site settings (gear) > Apps & integrations > scroll to API access > Generate API token.',
          'Name it "Beacon GEO". Select scopes: Sites = Read-only, CMS = Read and write, Pages = Read-only. Leave everything else off.',
          'Generate and copy the token into the secure field.',
          'Blog collection ID: Webflow Designer > CMS > Blog Posts collection > Collection settings > copy the ID (or enter the collection name and we will resolve it).',
        ],
        links: [{ label: 'Webflow Data API: site tokens', href: 'https://developers.webflow.com/data/docs/authentication' }],
      },
      {
        variant: 'wix', title: 'Wix',
        steps: [
          'You must be the account owner or co-owner.',
          'Wix account settings: manage.wix.com > profile menu > Account settings > API keys > Generate API Key (steps may show under "Headless" or "API keys manager" depending on your account).',
          'Name: Beacon GEO. Permissions: under Wix Blog choose Read and Manage Blog (posts and categories). Account-level scope = Access to the one site you choose.',
          'Copy the key and your Site ID (the URL segment after /dashboard/ when you are inside the site dashboard).',
          'This requires the Wix Blog app on the site. Tell us if your site has no Wix Blog.',
        ],
        links: [{ label: 'Wix API keys', href: 'https://dev.wix.com/docs/rest/articles/getting-started/api-keys' }],
      },
      {
        variant: 'sanity', title: 'Sanity',
        steps: [
          'Open sanity.io/manage > select your project.',
          'Go to API > Tokens > Add API token.',
          'Name: Beacon GEO. Permissions: Editor (create and edit, cannot change project settings). Viewer is "partial" (read only).',
          'Copy the token once and paste it in the secure field. Enter the Project ID (shown on the project page) and the dataset (usually production).',
          'Tell us your blog document type name (e.g. post) by reply; we map fields automatically if it has title, slug and body.',
        ],
        links: [{ label: 'Sanity: API tokens', href: 'https://www.sanity.io/docs/content-lake/http-auth' }],
      },
      {
        variant: 'contentful', title: 'Contentful',
        steps: [
          'Open app.contentful.com > Settings (top bar) > CMA tokens > Create personal access token. Create it while logged in as a user with at least the Editor role on the space (Space Admin is not needed).',
          'Name it "Beacon GEO", copy the token. Personal tokens act as that user: prefer creating a dedicated user for us (Settings > Users > Invite {{AGENCY_EMAIL}} with the Editor role) and generating the token from that user, then enter it here.',
          'Space ID: Settings > General settings. Environment: usually master.',
        ],
        links: [{ label: 'Contentful: CMA tokens', href: 'https://www.contentful.com/developers/docs/references/authentication/' }],
      },
      {
        variant: 'hubspot', title: 'HubSpot',
        steps: [
          'You need Super Admin or the Marketplace/App permissions.',
          'In HubSpot: Settings (gear) > Integrations > Private Apps > Create private app. (HubSpot may label this "Service keys" or direct you to developer projects on newer accounts. If so, use the same scopes.)',
          'Name: Beacon GEO. Scopes tab: content (Content: read and write blog posts and landing pages). Do not add CRM scopes.',
          'Create the app, then copy the access token into the secure field.',
          'Requires a Marketing Hub (or CMS Hub) subscription with the HubSpot blog enabled.',
        ],
        links: [{ label: 'HubSpot: private apps', href: 'https://developers.hubspot.com/docs/api/private-apps' }],
      },
      {
        variant: 'framer', title: 'Framer',
        steps: [
          'Framer\'s publishing API is new and its UI changes often; confirm with us if a label below is missing.',
          'Open your project > Site Settings (gear top right) > General (or Integrations) > API Keys > Create key. Name "Beacon GEO". Scope: CMS read and write.',
          'Copy the key into the secure field and enter the Framer project ID (the long ID in the project URL).',
          'If you cannot see API Keys: invite {{AGENCY_EMAIL}} as an Editor (Project > Share > Invite) and tell us; we will use the CMS plugin flow and you publish manually.',
        ],
        links: [{ label: 'Framer Server API', href: 'https://www.framer.com/developers/' }],
      },
      {
        variant: 'shopify', title: 'Shopify',
        steps: [
          'Log in as the store owner or staff with "Develop apps" permission.',
          'Dev Dashboard route (Shopify now requires this for new custom apps): dev.shopify.com > Create app > Name "Beacon GEO" > Configuration > Admin API access scopes: read_content, write_content (blog articles and pages). Install it on your store.',
          'Legacy route if your store still shows it: Shopify admin > Settings > Apps and sales channels > Develop apps > Create an app > Configure Admin API scopes: read_content and write_content > Install app > Reveal token once.',
          'Copy the Admin API access token (starts with shpat_) into the secure field. The site URL is your-store.myshopify.com.',
        ],
        links: [{ label: 'Shopify Admin API access scopes', href: 'https://shopify.dev/docs/api/usage/access-scopes' }],
      },
      {
        variant: 'ghost', title: 'Ghost',
        steps: [
          'Log in to Ghost Admin as Owner or Administrator.',
          'Settings (gear bottom left) > Advanced > Integrations > Add custom integration. Name: Beacon GEO > Create.',
          'Copy the Admin API key (format id:secret) into the secure field, and the API URL into the Site URL field.',
          'The integration key can create and edit posts. It cannot access member data unless you add it.',
        ],
        links: [{ label: 'Ghost Admin API', href: 'https://ghost.org/docs/admin-api/' }],
      },
      {
        variant: 'other', title: 'Other CMS',
        steps: [
          'Describe your CMS in the notes field. The fastest paths we support: (1) a REST/GraphQL API token with create and edit rights, (2) a Git-backed repository (use step 4), (3) a user seat with Editor role (use the access method from step 3) where a human-in-the-loop flow is acceptable.',
          'Include links to the CMS API docs if you have them.',
        ],
      },
    ],
    tests: [
      { id: 'cms_auth', label: 'Credential valid', description: 'Authenticated read on the CMS identity or site endpoint (WP GET /wp-json/wp/v2/users/me; Webflow GET /v2/sites; Wix POST /blog/v3/posts/query; Sanity GET /v2021-06-07/projects/{id}; Contentful GET /spaces/{id}; HubSpot GET /cms/v3/blogs/posts?limit=1; Shopify GET /admin/api/2025-10/blogs.json; Ghost GET /ghost/api/admin/site/). Failed: 401/403.', requires: ['cms_platform', 'cms_site_url'] },
      { id: 'cms_draft_write', label: 'Can create a draft', description: 'Creates a draft titled "Beacon connection test", reads it back, then deletes it. Partial: read works but the draft create is denied (token is read-only, e.g. Sanity Viewer, WordPress Contributor, Webflow CMS read-only).', requires: ['cms_platform', 'cms_site_url'] },
    ],
  },

  // 6 ----------------------------------------------------------------------
  {
    id: 'gsc',
    title: 'Google Search Console',
    short: 'Search Console',
    icon: 'Search',
    group: 'access',
    why: 'Search Console shows which queries and pages bring Google traffic, including AI Overviews clicks. Owner is required so we can add our service account (for the Indexing API and URL inspection) and re-verify the property if something breaks.',
    fields: [
      { id: 'gsc_property', label: 'Search Console property', type: 'text', required: true, placeholder: 'sc-domain:acme.com  or  https://www.acme.com/', help: 'Domain property (sc-domain:) is best. Copy it from the property dropdown in Search Console.' },
    ],
    instructions: [
      {
        title: 'Required permission',
        steps: [
          'Permission level: Owner (a "delegated owner" is fine and is what you create for us). Full, Restricted and Associate are not enough.',
          'Why not Full: only Owners can add other users and service accounts, and the Indexing API requires the caller to be an Owner of the property.',
        ],
      },
      {
        variant: 'agency_email', title: 'Add our agency email as Owner',
        steps: [
          'You must already be a verified owner. Open search.google.com/search-console and pick the property in the top-left dropdown.',
          'In the left menu click Settings (gear, near the bottom) > Users and permissions.',
          'Click Add user (top right), enter {{AGENCY_EMAIL}}, set Permission to Owner, click Add.',
          'If you do not see Users and permissions, you are not an owner. Ask whoever verified the property, or verify it yourself with a DNS TXT record (step 10).',
          'Repeat for each property variant you use (domain property covers all of them).',
        ],
        links: [{ label: 'Google: manage owners, users and permissions', href: 'https://support.google.com/webmasters/answer/7687615' }],
      },
      {
        variant: 'domain_user', title: 'Add the user you created as Owner',
        steps: [
          'Same path as above (Settings > Users and permissions > Add user), but use the email of the user you created in step 3. Permission: Owner.',
        ],
      },
    ],
    tests: [
      { id: 'gsc_property_visible', label: 'Property visible to us', description: 'Search Console API sites.list (webmasters.readonly or webmasters scope) with our agency identity must include gsc_property. Failed: property not in list (user not added or wrong property type).', requires: ['gsc_property'] },
      { id: 'gsc_owner_level', label: 'Owner permission level', description: 'Read permissionLevel from sites.list/sites.get. Expected siteOwner. Partial: "siteFullUser" shows as "GSC access is Full, not Owner"; "siteRestrictedUser" shows "Restricted". Also confirms the Indexing API service account (step 9) is listed as Owner when step 9 is done.', requires: ['gsc_property'] },
      { id: 'gsc_data_flowing', label: 'Search data available', description: 'searchanalytics.query for the last 7 days (dimension: query, rowLimit 5). Partial: 0 rows (property is new, less than 2 days old, or has no impressions), or the property was verified less than 48 hours ago.', requires: ['gsc_property'] },
    ],
  },

  // 7 ----------------------------------------------------------------------
  {
    id: 'bing',
    title: 'Bing Webmaster Tools',
    short: 'Bing Webmaster',
    icon: 'Globe',
    group: 'access',
    why: 'Bing powers parts of ChatGPT search and Copilot. Bing Webmaster data and IndexNow submissions affect how fast your new content becomes visible there.',
    fields: [
      { id: 'bing_site_url', label: 'Site URL in Bing Webmaster Tools', type: 'url', required: true, placeholder: 'https://www.acme.com/' },
      { id: 'bing_api_key', label: 'Bing Webmaster API key', type: 'secret', help: 'Only required if you chose "user in your domain" in step 3. With our agency email we use our own key.' },
    ],
    instructions: [
      {
        title: 'Required permission',
        steps: [
          'Highest role: Administrator (shown as Owner in older docs). A site is owned by whoever verified it; additional users can be Administrator, Read/Write, or Read-only.',
          'We need Administrator to submit URLs and sitemaps, read the full API and manage users. Read/Write is partial.',
        ],
      },
      {
        variant: 'agency_email', title: 'Add our agency email (verify the UI labels, they change often)',
        steps: [
          'Sign in at bing.com/webmasters. If the site is not listed, click Add a site, then Import from Google Search Console (fastest) or verify with the DNS TXT/CNAME or meta tag (see step 10).',
          'Select your site, then Settings (left menu or top bar) > Users.',
          'Click Add user, enter {{AGENCY_EMAIL}}, set the role to Administrator, click Add.',
          'We accept via email within 1 business day.',
        ],
        links: [{ label: 'Bing Webmaster Tools', href: 'https://www.bing.com/webmasters' }],
      },
      {
        variant: 'domain_user', title: 'Use your domain user and share an API key',
        steps: [
          'Add your domain user as Administrator as above, or log in with it and create the key.',
          'Settings (gear, top right) > API access > API key > Generate API key. Paste it into the secure field.',
        ],
      },
    ],
    tests: [
      { id: 'bing_site_listed', label: 'Site listed', description: 'Bing Webmaster API GetUserSites must include bing_site_url and IsVerified=true. Failed: site not in list.', requires: ['bing_site_url'] },
      { id: 'bing_role_admin', label: 'Administrator role', description: 'GetSiteRoles for the site must list our identity with Role=Administrator. Partial: "Bing access is Read/Write, not Administrator" or "Read-only".', requires: ['bing_site_url'] },
      { id: 'bing_api_quota', label: 'API / URL submission works', description: 'GetUrlSubmissionQuota returns daily and monthly quota >0. Partial: quota 0 (new site, quota grows after verification) or API key rejected.', requires: ['bing_site_url'] },
    ],
  },

  // 8 ----------------------------------------------------------------------
  {
    id: 'ga4',
    title: 'Google Analytics 4',
    short: 'GA4',
    icon: 'BarChart3',
    group: 'access',
    why: 'GA4 lets us connect AI visibility to business results: sessions referred from ChatGPT, Perplexity, Gemini and others, and the key event (demo request, sign-up) that those sessions produce.',
    fields: [
      { id: 'ga4_property_id', label: 'GA4 property ID', type: 'text', required: true, placeholder: '123456789', help: 'Digits only. Admin > Property settings > Property ID.' },
      { id: 'ga4_key_event', label: 'Key event to monitor', type: 'text', required: true, placeholder: 'generate_lead', help: 'The event name exactly as it appears in GA4 > Admin > Events. Should be marked as a key event.' },
      { id: 'ga4_secondary_event', label: 'Secondary event (optional)', type: 'text', placeholder: 'sign_up' },
    ],
    instructions: [
      {
        title: 'Required permission',
        steps: [
          'Property-level role: Editor (lets us read reports, create audiences/annotations and verify key events). Viewer/Analyst are partial: we can read reports but cannot mark or confirm key events.',
          'Administrator is not needed. Do not give us account-level Administrator.',
        ],
      },
      {
        variant: 'agency_email', title: 'Add our agency email',
        steps: [
          'Open analytics.google.com and select the right account and property.',
          'Click Admin (gear, bottom left) > Property access management (in the Property column).',
          'Click + (top right) > Add users. Enter {{AGENCY_EMAIL}}. Untick "Notify new users by email" if you prefer.',
          'Select Editor (not Administrator). Click Add.',
          'Find the property ID: Admin > Property settings (top right of the page, "Property ID").',
        ],
        links: [{ label: 'Google: access and data-restriction management', href: 'https://support.google.com/analytics/answer/9305788' }],
      },
      {
        variant: 'domain_user', title: 'Add your domain user',
        steps: ['Same path (Admin > Property access management > + > Add users). Email: the user from step 3. Role: Editor.'],
      },
      {
        title: 'Check your key event',
        steps: [
          'In GA4: Admin > Data display > Events (or Key events). Find the event you want, and switch "Mark as key event" on.',
          'Type the event name here exactly (case-sensitive).',
        ],
      },
    ],
    tests: [
      { id: 'ga4_property_access', label: 'Property accessible', description: 'Analytics Admin API accountSummaries.list (scope analytics.readonly) must contain ga4_property_id. Failed: not shared with us or wrong ID.', requires: ['ga4_property_id'] },
      { id: 'ga4_role_editor', label: 'Editor role', description: 'accessBindings/list for the property filtered to our identity. Expected predefinedRoles includes roles/editor. Partial: "GA4 access is Viewer/Analyst, not Editor".', requires: ['ga4_property_id'] },
      { id: 'ga4_key_event_exists', label: 'Key event exists', description: 'Admin API properties.keyEvents.list contains ga4_key_event (and ga4_secondary_event if given). Partial: event exists as a normal event but is not marked as a key event, or the name does not match (case).', requires: ['ga4_property_id', 'ga4_key_event'] },
      { id: 'ga4_data_flowing', label: 'Data is flowing', description: 'Data API runReport last 28 days: sessions > 0 and eventCount for the key event > 0. Partial: sessions exist but the key event has zero count (not tracking yet).', requires: ['ga4_property_id', 'ga4_key_event'] },
    ],
  },

  // 9 ----------------------------------------------------------------------
  {
    id: 'google_cloud',
    title: 'Google Cloud (YouTube, Ads, Indexing)',
    short: 'Google Cloud',
    icon: 'CloudCog',
    group: 'access',
    why: 'These APIs give us YouTube creators and video mentions, Google Keyword Planner search volumes, and instant indexing requests. They run inside a Google Cloud project you control, with a service account whose key you can revoke any time.',
    fields: [
      { id: 'gcp_project_id', label: 'Google Cloud project ID', type: 'text', required: true, placeholder: 'acme-beacon-geo' },
      { id: 'gcp_service_account_key', label: 'Service account key (JSON)', type: 'secret', required: true, help: 'Paste the whole JSON file contents. Stored encrypted; we never show it again.' },
      { id: 'google_ads_customer_id', label: 'Google Ads customer ID', type: 'text', placeholder: '123-456-7890', help: 'Any Google Ads account (even with no spend) is enough for Keyword Planner. Leave blank if you have none: we will use ours.' },
    ],
    instructions: [
      {
        title: 'Required permission',
        steps: [
          'In your project: you need Owner or (Project IAM Admin + Service Usage Admin + Service Account Admin + Service Account Key Admin) to do this setup.',
          'The service account itself needs no IAM role on the project (API enablement is project-level). Do not grant it Owner/Editor.',
          'Enabled APIs: YouTube Data API v3 (youtube.googleapis.com), Google Ads API (googleads.googleapis.com), Web Search Indexing API (indexing.googleapis.com). Optional: Search Console API (searchconsole.googleapis.com), Google Analytics Data and Admin APIs (analyticsdata / analyticsadmin) for step 8.',
        ],
      },
      {
        title: '1. Create or choose a project',
        steps: [
          'Go to console.cloud.google.com. Click the project picker (top bar) > New project. Name: "Beacon GEO". Select your organization. Create.',
        ],
        links: [{ label: 'Google Cloud console', href: 'https://console.cloud.google.com/' }],
      },
      {
        title: '2. Enable the three APIs',
        steps: [
          'Left menu (hamburger) > APIs & Services > Library.',
          'Search "YouTube Data API v3" > Enable.',
          'Search "Google Ads API" > Enable.',
          'Search "Web Search Indexing API" (may appear as "Indexing API") > Enable.',
        ],
        links: [
          { label: 'YouTube Data API v3', href: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com' },
          { label: 'Google Ads API', href: 'https://console.cloud.google.com/apis/library/googleads.googleapis.com' },
          { label: 'Indexing API', href: 'https://console.cloud.google.com/apis/library/indexing.googleapis.com' },
        ],
      },
      {
        title: '3. Create the service account and a key',
        steps: [
          'Left menu > IAM & Admin > Service Accounts > Create service account. Name: beacon-geo. Skip the optional role and user-access steps. Done.',
          'Copy the service account email (looks like beacon-geo@PROJECT.iam.gserviceaccount.com). It is also shown below as {{SERVICE_ACCOUNT_EMAIL}}.',
          'Open the account > Keys > Add key > Create new key > JSON > Create. A file downloads. Paste its entire contents into the secure field here, then delete the downloaded file.',
          'If "Create key" is blocked, your organization enforces the policy iam.disableServiceAccountKeyCreation. Ask your Cloud admin to allow it for this project, or tell us and we will use Workload Identity Federation instead.',
        ],
        links: [{ label: 'Google: service account keys', href: 'https://cloud.google.com/iam/docs/keys-create-delete' }],
      },
      {
        title: '4. Let the service account use Search Console (Indexing API)',
        steps: [
          'Search Console > Settings > Users and permissions > Add user. Enter the service account email, Permission: Owner. (The Indexing API only works when the caller is an Owner of the property.)',
          'Note: Google officially supports the Indexing API only for job-posting and livestream pages. We use it for those page types and for non-supported pages on a best-effort basis; Google may ignore other pages.',
        ],
        links: [{ label: 'Google: Indexing API quickstart', href: 'https://developers.google.com/search/apis/indexing-api/v3/quickstart' }],
      },
      {
        title: '5. Google Ads / Keyword Planner',
        steps: [
          'Keyword Planner needs a Google Ads account (no spend needed). Create one at ads.google.com if you do not have one (choose "Switch to Expert Mode" to skip a campaign).',
          'Copy your Customer ID (top right of the Ads UI, format 123-456-7890) into the field above.',
          'Link our manager account: Google Ads > Admin (wrench) > Access and security > Managers (or "Account access" > Managers) > Link. Accept the request from manager ID {{ADS_MANAGER_ID}}. Access level: Read-only is enough for Keyword Planner; Standard is only needed if you want us to create campaigns (we will not).',
          'Our Google Ads developer token is held by our manager account. You do not need to apply for one.',
        ],
        links: [{ label: 'Google Ads: link manager accounts', href: 'https://support.google.com/google-ads/answer/7459601' }],
      },
    ],
    tests: [
      { id: 'gcp_service_account_valid', label: 'Service account key valid', description: 'Exchange the JWT for an access token (oauth2.googleapis.com/token) and check client_email matches the project. Failed: invalid or revoked key, JSON malformed. Partial: key valid but the project differs from gcp_project_id.', requires: ['gcp_project_id', 'gcp_service_account_key'] },
      { id: 'gcp_apis_enabled', label: 'Three APIs enabled', description: 'serviceusage.services.batchGet for youtube.googleapis.com, googleads.googleapis.com, indexing.googleapis.com; each must be ENABLED. Partial: lists which are still disabled and gives the one-click enable link.', requires: ['gcp_project_id', 'gcp_service_account_key'] },
      { id: 'youtube_api_call', label: 'YouTube Data API call', description: 'GET youtube/v3/videoCategories?part=snippet&regionCode=US (1 quota unit). Failed: 403 accessNotConfigured (API disabled) or quotaExceeded.', requires: ['gcp_project_id', 'gcp_service_account_key'] },
      { id: 'ads_keyword_ideas', label: 'Keyword Planner call', description: 'KeywordPlanIdeaService.generateKeywordIdeas with one seed keyword via our developer token and manager login-customer-id. Partial: customer ID given but the manager link is still pending ("USER_PERMISSION_DENIED"), or account is not yet active.', requires: ['gcp_project_id'] },
      { id: 'indexing_api_owner', label: 'Indexing API permission', description: 'urlNotifications.getMetadata for the home page URL with the service account. 200/404 (never notified) = OK. Partial: 403 "Permission denied. Failed to verify the URL ownership" = service account is not an Owner in Search Console (step 6 + instruction 4).', requires: ['gcp_service_account_key', 'gsc_property'] },
    ],
  },

  // 10 ---------------------------------------------------------------------
  {
    id: 'dns',
    title: 'DNS verification (TXT record)',
    short: 'DNS',
    icon: 'Network',
    group: 'access',
    why: 'A TXT record is the strongest proof that you control the domain. It lets us verify the domain for the other tools (Search Console, Bing, Google Cloud) and proves to our platform that your team authorised this onboarding.',
    fields: [
      { id: 'dns_domain', label: 'Root domain', type: 'text', required: true, placeholder: 'acme.com', help: 'The domain you manage DNS for, without www.' },
      {
        id: 'dns_provider', label: 'Where is your DNS hosted?', type: 'select', required: true,
        options: [
          { value: 'cloudflare', label: 'Cloudflare' }, { value: 'godaddy', label: 'GoDaddy' }, { value: 'route53', label: 'AWS Route 53' },
          { value: 'namecheap', label: 'Namecheap' }, { value: 'google_squarespace', label: 'Google Domains / Squarespace Domains' }, { value: 'other', label: 'Other' },
        ],
      },
    ],
    instructions: [
      {
        title: 'The record to add (the same for every provider)',
        steps: [
          'Type: TXT',
          'Name / Host: {{DNS_TXT_NAME}} (e.g. _beacon-verify). Some providers want the full name _beacon-verify.acme.com; if the field auto-appends your domain, enter only _beacon-verify.',
          'Value / Content: {{DNS_TXT_VALUE}} (paste exactly, no quotes unless your provider adds them automatically)',
          'TTL: Auto or 300 seconds. Do not remove existing TXT records (SPF, DKIM, Google verification).',
          'Changes usually appear in 1-10 minutes, but can take up to 48 hours. Click the test when ready.',
        ],
      },
      {
        variant: 'cloudflare', title: 'Cloudflare',
        steps: ['dash.cloudflare.com > select your domain > DNS > Records > Add record.', 'Type TXT, Name _beacon-verify, Content = the value above, TTL Auto. Proxy status does not apply to TXT. Save.'],
        links: [{ label: 'Cloudflare: manage DNS records', href: 'https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/' }],
      },
      {
        variant: 'godaddy', title: 'GoDaddy',
        steps: ['godaddy.com > My Products > next to your domain click DNS (or Manage DNS).', 'Click Add New Record. Type TXT, Name _beacon-verify, Value = the value above, TTL 1 Hour (or lower). Save.'],
        links: [{ label: 'GoDaddy: add a TXT record', href: 'https://www.godaddy.com/help/add-a-txt-record-19232' }],
      },
      {
        variant: 'route53', title: 'AWS Route 53',
        steps: ['AWS console > Route 53 > Hosted zones > click your domain > Create record.', 'Record name: _beacon-verify, Record type: TXT, Value: the value above wrapped in double quotes, TTL 300. Create records.'],
        links: [{ label: 'AWS: creating records', href: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating.html' }],
      },
      {
        variant: 'namecheap', title: 'Namecheap',
        steps: ['namecheap.com > Domain List > Manage next to the domain > Advanced DNS tab.', 'Add New Record. Type TXT Record, Host _beacon-verify, Value = the value above, TTL Automatic. Click the green check to save.', 'This only works if the domain uses Namecheap BasicDNS/PremiumDNS (Nameservers: Namecheap BasicDNS). Otherwise edit DNS at the provider that hosts your nameservers.'],
        links: [{ label: 'Namecheap: add a TXT record', href: 'https://www.namecheap.com/support/knowledgebase/article.aspx/317/2237/how-do-i-add-txtspfdkimdmarc-records-for-my-domain/' }],
      },
      {
        variant: 'google_squarespace', title: 'Google Domains / Squarespace Domains',
        steps: ['Google Domains was migrated to Squarespace Domains. Go to account.squarespace.com > Domains > click the domain > DNS > DNS settings.', 'Under Custom records click Add record. Type TXT, Host _beacon-verify, Data = the value above. Save.', 'If your domain is on Google Cloud DNS instead: console.cloud.google.com > Network services > Cloud DNS > zone > Add standard > TXT.'],
        links: [{ label: 'Squarespace: DNS records', href: 'https://support.squarespace.com/hc/en-us/articles/360002101888-Adding-custom-DNS-records-to-your-Squarespace-managed-domain' }],
      },
      {
        variant: 'other', title: 'Other providers',
        steps: ['Open the DNS or "Advanced DNS" page of the provider that holds your nameservers (look up with: whois acme.com or dnschecker.org).', 'Add the TXT record above. If you do not control DNS, send this page to the person who does; the test works from any browser session.'],
      },
    ],
    tests: [
      { id: 'dns_txt_present', label: 'TXT record found', description: 'DNS-over-HTTPS TXT lookup of _beacon-verify.<domain> on Cloudflare (1.1.1.1) and Google (8.8.8.8) resolvers; value must exactly equal the issued token. Failed: no record. Partial: record present on one resolver only (propagation in progress) or the value is wrapped in extra quotes/whitespace (we trim and warn).', requires: ['dns_domain', 'dns_provider'] },
      { id: 'dns_authoritative_match', label: 'Authoritative nameserver match', description: 'Query the domain NS records, then ask each authoritative nameserver directly for the TXT. Partial: TXT present at the authoritative server but not at public resolvers yet (wait), or the record was added at a provider that is not the authoritative one (common with Namecheap/GoDaddy when nameservers point to Cloudflare).', requires: ['dns_domain', 'dns_provider'] },
    ],
  },

  // 11 ---------------------------------------------------------------------
  {
    id: 'analytics_tools',
    title: 'GEO / SEO analytics tools',
    short: 'Analytics tools',
    icon: 'LineChart',
    group: 'stack',
    optional: true,
    why: 'If you already pay for Peec.ai, Ahrefs, Similarweb, Profound, AthenaHQ or Semrush, we can read their data (rankings, traffic estimates, citation data) instead of buying it twice. Choose an API key, or add us as a seat (a user in the tool).',
    fields: [
      {
        id: 'analytics_tools', label: 'Tools you use', type: 'multiselect',
        options: [
          { value: 'peec', label: 'Peec.ai' }, { value: 'ahrefs', label: 'Ahrefs' }, { value: 'similarweb', label: 'Similarweb' }, { value: 'profound', label: 'Profound' },
          { value: 'athenahq', label: 'AthenaHQ' }, { value: 'semrush', label: 'Semrush' }, { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'analytics_credentials', label: 'Access per tool', type: 'repeater',
        help: 'Add one row per tool.',
        fields: [
          { id: 'tool', label: 'Tool', type: 'select', required: true, options: opt('Peec.ai', 'Ahrefs', 'Similarweb', 'Profound', 'AthenaHQ', 'Semrush', 'Other') },
          { id: 'access_type', label: 'Access type', type: 'radio', required: true, options: [{ value: 'api_key', label: 'API key' }, { value: 'seat', label: 'Seat (we are added as a user)' }] },
          { id: 'api_key', label: 'API key', type: 'secret', showIf: { field: 'access_type', equals: 'api_key' } },
          { id: 'tool_name_other', label: 'Tool name (if Other)', type: 'text', showIf: { field: 'tool', equals: 'other' } },
          { id: 'project_id', label: 'Project / workspace name', type: 'text', placeholder: 'Acme (US)' },
        ],
      },
    ],
    instructions: [
      {
        title: 'Required permission',
        steps: [
          'Always the read-only level. We never need billing access or admin rights. Seat role: Viewer / Read-only / Analyst (where offered). API keys: read-only or default (most are read-only by design).',
          'For seats, invite {{AGENCY_EMAIL}} (or the domain user from step 3).',
        ],
      },
      {
        title: 'Peec.ai',
        steps: ['app.peec.ai > Settings > Team > Invite {{AGENCY_EMAIL}} with the Viewer role. API access (beta, if enabled for your plan): Settings > API keys > Create key. Confirm the current labels; Peec updates their UI often.'],
        links: [{ label: 'Peec.ai', href: 'https://peec.ai' }],
      },
      {
        title: 'Ahrefs',
        steps: ['app.ahrefs.com > Account settings > API keys > Create API key (API v3, requires Enterprise plan or the API add-on). Otherwise: Account settings > Members > Invite {{AGENCY_EMAIL}} as Member with Read-only access to the project.'],
        links: [{ label: 'Ahrefs API v3', href: 'https://docs.ahrefs.com/docs/api/reference/introduction' }],
      },
      {
        title: 'Similarweb',
        steps: ['pro.similarweb.com > Account > API Management > copy or create the API key (requires the API subscription). Otherwise invite {{AGENCY_EMAIL}} from Account > Users.'],
        links: [{ label: 'Similarweb API', href: 'https://developers.similarweb.com/' }],
      },
      {
        title: 'Profound',
        steps: ['tryprofound.com > Settings > API keys > Create key (enterprise plans). Otherwise Settings > Team members > Invite {{AGENCY_EMAIL}} as a Viewer.'],
        links: [{ label: 'Profound', href: 'https://www.tryprofound.com' }],
      },
      {
        title: 'AthenaHQ',
        steps: ['app.athenahq.ai > Settings > API Keys > Create API key. Otherwise Settings > Members > Invite {{AGENCY_EMAIL}} as a Member (not Admin).'],
        links: [{ label: 'AthenaHQ', href: 'https://www.athenahq.ai' }],
      },
      {
        title: 'Semrush',
        steps: ['semrush.com > profile menu > Subscription info (or Profile) > API (Semrush API units) > copy your API key. Otherwise: Company settings > Users > Invite {{AGENCY_EMAIL}} with the Guest role (or Share a project).', 'API units are consumed by our calls. Tell us if you want a cap.'],
        links: [{ label: 'Semrush API', href: 'https://developer.semrush.com/api/' }],
      },
      {
        title: 'Other tool',
        steps: ['Choose Other, name the tool, and either paste the API key or add us as a viewer. We reply within one business day if we need more.'],
      },
    ],
    tests: [
      { id: 'analytics_key_valid', label: 'API keys valid', description: 'Per tool, one low-cost authenticated call: Ahrefs GET /v3/subscription-info/limits-and-usage; Semrush GET /users/countapiunits.html; Similarweb GET /v1/user-capabilities; AthenaHQ list API keys / site call via its API; Profound and Peec.ai: documented "me"/projects endpoint (to be confirmed per account). Failed: 401. Partial: key valid but zero API units/credits left or the project not found.', requires: ['analytics_credentials'] },
      { id: 'analytics_seat_accepted', label: 'Seat invitation accepted', description: 'For seat rows: a human confirms the invite (we cannot call the tools). We check by a scheduled login/API probe and mark the row "pending" until we can see the project. Partial: seat found but role is Admin (we flag as over-permissioned) or has no access to the right project.', requires: ['analytics_credentials'] },
    ],
  },

  // 12 ---------------------------------------------------------------------
  {
    id: 'cloud_storage',
    title: 'AWS (S3 + CloudFront) for visual assets',
    short: 'AWS / cloud',
    icon: 'Database',
    group: 'stack',
    optional: true,
    why: 'We generate charts, social images and infographics for your articles. They need a fast, public home on your domain (for example assets.acme.com) so they are served from your brand, cached worldwide and cited by AI engines. We use a least-privilege role limited to one folder of one bucket.',
    fields: [
      {
        id: 'cloud_provider', label: 'Cloud provider', type: 'select', required: true,
        options: [{ value: 'aws', label: 'AWS' }, { value: 'gcp', label: 'Google Cloud' }, { value: 'azure', label: 'Microsoft Azure' }, { value: 'none', label: 'None: host assets for us' }],
      },
      { id: 'aws_account_id', label: 'AWS account ID', type: 'text', required: true, placeholder: '123456789012', showIf: { field: 'cloud_provider', equals: 'aws' } },
      { id: 'aws_region', label: 'Bucket region', type: 'text', required: true, placeholder: 'us-east-1', showIf: { field: 'cloud_provider', equals: 'aws' } },
      { id: 's3_bucket', label: 'S3 bucket name', type: 'text', required: true, placeholder: 'acme-assets', showIf: { field: 'cloud_provider', equals: 'aws' } },
      { id: 'cloudfront_distribution_id', label: 'CloudFront distribution ID', type: 'text', required: true, placeholder: 'E1ABCDEFG2HIJK', showIf: { field: 'cloud_provider', equals: 'aws' } },
      { id: 'cdn_base_url', label: 'Public asset URL', type: 'url', placeholder: 'https://assets.acme.com', help: 'The domain that serves the CloudFront distribution.' },
      { id: 'aws_role_arn', label: 'IAM role ARN', type: 'text', required: true, placeholder: 'arn:aws:iam::123456789012:role/BeaconGeoAssets', showIf: { field: 'cloud_provider', equals: 'aws' } },
      { id: 'aws_access_key_id', label: 'Access key ID (only if you cannot create a role)', type: 'text', showIf: { field: 'cloud_provider', equals: 'aws' } },
      { id: 'aws_secret_access_key', label: 'Secret access key', type: 'secret', showIf: { field: 'cloud_provider', equals: 'aws' } },
      { id: 'cloud_other_notes', label: 'Your storage details', type: 'textarea', help: 'GCP: bucket, project and service account email. Azure: storage account, container, CDN profile and endpoint.', showIf: { field: 'cloud_provider', equals: ['gcp', 'azure'] } },
    ],
    instructions: [
      {
        variant: 'aws', title: 'Required permission (exact)',
        steps: [
          'An IAM role in your account that we assume. Allowed: S3 list/read/write/delete only under the prefix beacon/ in one bucket; CloudFront invalidations on one distribution. Denied by omission: every other service, every other bucket, IAM, billing.',
          'No access keys are created in your account. We authenticate with our own AWS principal and a unique ExternalId (confused-deputy protection).',
          'Optional: if your policy forbids cross-account roles, create an IAM user with the same permissions policy and give us its access key. Rotate it every 90 days. This is less secure; we prefer the role.',
        ],
      },
      {
        variant: 'aws', title: '1. Create the bucket and CloudFront distribution',
        steps: [
          'AWS console > S3 > Create bucket. Name e.g. acme-assets. Keep Block all public access ON (CloudFront reads it, the internet does not). Enable default encryption (SSE-S3).',
          'CloudFront > Create distribution. Origin domain: your bucket. Origin access: Origin access control settings (recommended) > Create new OAC. Viewer protocol: Redirect HTTP to HTTPS. Cache policy: CachingOptimized. Optionally add an alternate domain name (assets.acme.com) and an ACM certificate in us-east-1.',
          'CloudFront shows a banner "Copy policy". Paste it into S3 > bucket > Permissions > Bucket policy, or use the policy below (replace the three UPPERCASE placeholders).',
          AWS_BUCKET_POLICY_FOR_CF,
          'Add the DNS CNAME for assets.acme.com to the distribution domain (d123.cloudfront.net) at your DNS provider.',
        ],
        links: [{ label: 'AWS: restrict access to S3 with OAC', href: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html' }],
      },
      {
        variant: 'aws', title: '2. Create the least-privilege IAM role',
        steps: [
          'IAM > Roles > Create role > Custom trust policy. Paste this trust policy (replace nothing: the principal and ExternalId are generated for your account):',
          AWS_TRUST_POLICY,
          'Next > skip attaching managed policies > name the role BeaconGeoAssets > Create role.',
          'Open the role > Permissions > Add permissions > Create inline policy > JSON. Paste the policy below, replacing YOUR_BUCKET, ACCOUNT_ID and YOUR_DISTRIBUTION_ID. Name it BeaconGeoAssetsLeastPrivilege > Create policy.',
          AWS_PERMISSIONS_POLICY,
          'Copy the role ARN (top of the role page) into this form, with the bucket, region and distribution ID.',
          'Set the role Maximum session duration to 1 hour (default).',
        ],
        links: [{ label: 'AWS: cross-account role with ExternalId', href: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_third-party.html' }],
      },
      {
        variant: 'gcp', title: 'Google Cloud equivalent',
        steps: [
          'Cloud Storage > Create bucket (uniform access, public access prevention on). Add a Cloud CDN backend bucket behind a global external Application Load Balancer.',
          'IAM > Service Accounts > Create beacon-geo-assets. On the bucket: Permissions > Grant access > the service account > role Storage Object Admin with an IAM Condition resource.name.startsWith("projects/_/buckets/BUCKET/objects/beacon/"). For cache invalidation add a custom role with compute.urlMaps.invalidateCache on the one URL map.',
          'Create a JSON key and put it in the secure field (or send details in the notes field if you prefer Workload Identity Federation).',
        ],
      },
      {
        variant: 'azure', title: 'Azure equivalent',
        steps: [
          'Create a storage account and a container "assets". Put Azure Front Door/CDN in front of it.',
          'Create an app registration "Beacon GEO" (Entra ID > App registrations) with a client secret, or a federated credential.',
          'Role assignments: Storage Blob Data Contributor scoped to that one container, and CDN Endpoint Contributor (or Front Door Contributor) scoped to that one profile only.',
          'Enter tenant ID, client ID, storage account and endpoint in the notes field; paste the client secret in a secure field (tell us and we add one).',
        ],
      },
      {
        variant: 'none', title: 'No cloud account',
        steps: ['No problem. We host assets on our CDN under a Beacon domain (or a subdomain you point to us). Mention it in the review step.'],
      },
    ],
    tests: [
      { id: 'aws_assume_role', label: 'Role can be assumed', description: 'sts:AssumeRole with our principal and the ExternalId (or sts:GetCallerIdentity if access keys). Failed: AccessDenied. Partial: "ExternalId mismatch" (trust policy contains a different ExternalId) or MaxSessionDuration below 15 minutes.', requires: ['aws_account_id', 'aws_role_arn'] },
      { id: 'aws_s3_rw', label: 'S3 read/write under beacon/', description: 'PutObject beacon/_connection-test.txt, GetObject, DeleteObject; then try ListBucket without prefix (must be denied) and PutObject outside beacon/ (must be denied). Partial: write works but delete fails; or the role can write outside beacon/ ("over-permissioned"), which we flag as a security warning.', requires: ['s3_bucket', 'aws_role_arn'] },
      { id: 'aws_cloudfront_invalidate', label: 'CloudFront invalidation', description: 'GetDistribution (status Deployed) and CreateInvalidation for /beacon/_connection-test.txt. Partial: GetDistribution ok but CreateInvalidation denied (policy missing cloudfront:CreateInvalidation), or distribution is still "InProgress".', requires: ['cloudfront_distribution_id', 'aws_role_arn'] },
      { id: 'aws_public_fetch', label: 'Asset is served publicly', description: 'GET {cdn_base_url}/beacon/_connection-test.txt must return 200 with content-type text/plain and a cache header (x-cache). Partial: 403 (OAC/bucket policy missing) or served over HTTP only or the custom domain certificate is invalid.', requires: ['cdn_base_url', 's3_bucket'] },
    ],
  },

  // 13 ---------------------------------------------------------------------
  {
    id: 'cdn_crawlers',
    title: 'Cloudflare / CDN (AI crawler monitoring)',
    short: 'Cloudflare',
    icon: 'ShieldCheck',
    group: 'stack',
    optional: true,
    why: 'Your CDN logs every visit from AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended...). We read those logs to show which engines can reach your content, how often, and which pages they never fetch.',
    fields: [
      {
        id: 'cdn_provider', label: 'CDN / WAF provider', type: 'select', required: true,
        options: [{ value: 'cloudflare', label: 'Cloudflare' }, { value: 'fastly', label: 'Fastly' }, { value: 'akamai', label: 'Akamai' }, { value: 'vercel', label: 'Vercel' }, { value: 'other', label: 'Other / none' }],
      },
      { id: 'cf_zone_name', label: 'Zone (domain)', type: 'text', required: true, placeholder: 'acme.com', showIf: { field: 'cdn_provider', equals: 'cloudflare' } },
      { id: 'cf_account_id', label: 'Account ID', type: 'text', required: true, help: 'dash.cloudflare.com > Account home > the three-dot menu next to your account > Copy account ID.', showIf: { field: 'cdn_provider', equals: 'cloudflare' } },
      { id: 'cf_api_token', label: 'Scoped API token', type: 'secret', required: true, showIf: { field: 'cdn_provider', equals: 'cloudflare' } },
      { id: 'cdn_other_notes', label: 'Provider details', type: 'textarea', help: 'Fastly: service ID. Akamai: property. Vercel: team slug. We reply with the exact read-only token to create.', showIf: { field: 'cdn_provider', equals: ['fastly', 'akamai', 'vercel', 'other'] } },
    ],
    instructions: [
      {
        variant: 'cloudflare', title: 'Required permission (exact, read-only)',
        steps: [
          'Create one User API token (or Account-owned token) with these permissions and nothing else:',
          'Zone > Zone > Read',
          'Zone > Analytics > Read',
          'Zone > AI Crawl Control > Read (shown as "AI Crawl Control Read"; AI Crawl Control was formerly "AI Audit")',
          'Account > Account Analytics > Read',
          'Optional, Enterprise plans only: Zone > Logs > Read (raw logpull, for page-level crawler history).',
          'Zone Resources: Include > Specific zone > your domain. Account Resources: Include > your account. Set an expiry of 12 months and (optional) restrict to our IP range, which we show you.',
          'No Edit/Write permission is requested. We never change your Cloudflare configuration.',
        ],
      },
      {
        variant: 'cloudflare', title: 'Create the token',
        steps: [
          'dash.cloudflare.com > My Profile (top right avatar) > API Tokens > Create Token > Create Custom Token > Get started.',
          'Token name: Beacon GEO crawler monitoring. Add the permission rows listed above using the dropdowns (Zone / Account, then the permission, then Read).',
          'Zone Resources > Include > Specific zone > your zone. Account Resources > Include > your account.',
          'Continue to summary > Create Token. Copy the token once and paste it in the secure field.',
          'AI Crawl Control is available on all plans for viewing, but some metrics need Pro or higher. If the dashboard menu is missing, open your domain > AI Crawl Control (it may sit under Security).',
        ],
        links: [{ label: 'Cloudflare: create an API token', href: 'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/' }, { label: 'Cloudflare: AI Crawl Control', href: 'https://developers.cloudflare.com/ai-crawl-control/' }],
      },
      {
        variant: 'fastly', title: 'Fastly',
        steps: ['Account > Personal profile > API tokens > Create token. Scope: Global API access is too broad; choose Read only access (global:read) restricted to your service. Paste details in the notes field and tell us; we confirm real-time log streaming (S3/BigQuery) options.'],
      },
      {
        variant: 'akamai', title: 'Akamai',
        steps: ['Control Center > Account admin > Identity & access > API users > Create API client with read-only DataStream 2 and Reporting API access to the one property. Send details through the notes field.'],
      },
      {
        variant: 'vercel', title: 'Vercel',
        steps: ['Vercel dashboard > Team settings > Tokens > Create token scoped to your team, expiry 12 months. Role needed: Viewer. We read Firewall and Observability data for AI bot traffic.'],
      },
      {
        variant: 'other', title: 'Other / none',
        steps: ['If you have no CDN, we measure AI crawler visits only with a lightweight server-log or analytics script on your site. Tell us what you can install in the notes.'],
      },
    ],
    tests: [
      { id: 'cf_token_valid', label: 'Token valid and active', description: 'GET /client/v4/user/tokens/verify (or /accounts/{id}/tokens/verify) returns status "active". Failed: invalid/expired.', requires: ['cf_api_token'] },
      { id: 'cf_zone_access', label: 'Zone access', description: 'GET /zones?name={zone} returns the zone with status active. Partial: token valid but zone not in its Zone Resources ("scoped to a different zone"), or write permissions found (token over-permissioned: we warn and recommend a read-only token).', requires: ['cf_api_token', 'cf_zone_name'] },
      { id: 'cf_analytics', label: 'Analytics readable', description: 'GraphQL Analytics API: httpRequestsAdaptiveGroups for the last 24 hours filtered on userAgent containing GPTBot/ClaudeBot/PerplexityBot. Partial: zero requests (no AI crawler traffic yet, or bot rules block them), or adaptive logs not on your plan (limited to 24h–3 days).', requires: ['cf_api_token', 'cf_zone_name'] },
      { id: 'cf_ai_crawl_control', label: 'AI Crawl Control readable', description: 'Read the zone AI Crawl Control crawler list/metrics endpoint (exact REST path confirmed at build time; API reference: developers.cloudflare.com/ai-crawl-control). Partial: 403 means the "AI Crawl Control Read" permission is missing; feature unavailable means the zone is on a plan without it.', requires: ['cf_api_token', 'cf_zone_name'] },
    ],
  },

  // 14 ---------------------------------------------------------------------
  {
    id: 'chat',
    title: 'Slack / Teams (bot)',
    short: 'Slack',
    icon: 'MessageSquare',
    group: 'stack',
    optional: true,
    why: 'Our bot posts weekly visibility reports, alerts when you lose a citation or AI crawlers get blocked, and lets your team ask questions in a channel. It can only act in channels you invite it to.',
    fields: [
      {
        id: 'chat_platform', label: 'Where does your team chat?', type: 'radio', required: true,
        options: [{ value: 'slack', label: 'Slack' }, { value: 'teams', label: 'Microsoft Teams' }, { value: 'none', label: 'Neither' }],
      },
      { id: 'slack_workspace_url', label: 'Slack workspace URL', type: 'url', required: true, placeholder: 'https://acme.slack.com', showIf: { field: 'chat_platform', equals: 'slack' } },
      { id: 'slack_channel', label: 'Channel for reports', type: 'text', required: true, placeholder: '#geo-reports', showIf: { field: 'chat_platform', equals: 'slack' } },
      { id: 'slack_bot_token', label: 'Bot token (only if you cannot use "Add to Slack")', type: 'secret', help: 'xoxb-... from our manifest app installed in your workspace.', showIf: { field: 'chat_platform', equals: 'slack' } },
      { id: 'teams_tenant_id', label: 'Microsoft Entra tenant ID', type: 'text', required: true, showIf: { field: 'chat_platform', equals: 'teams' } },
      { id: 'teams_team_channel', label: 'Team and channel name', type: 'text', required: true, placeholder: 'Marketing > GEO', showIf: { field: 'chat_platform', equals: 'teams' } },
    ],
    instructions: [
      {
        variant: 'slack', title: 'Required scopes (bot token)',
        steps: [
          'chat:write (post messages in channels the bot is in)',
          'chat:write.public (post to public channels without joining)',
          'channels:read (see public channel names so you can pick one)',
          'channels:join (join the channel you choose)',
          'groups:read (see private channels the bot was invited to)',
          'users:read (resolve @mentions)',
          'im:write (send direct messages, e.g. alerts)',
          'commands (slash command /beacon)',
          'files:write (upload report images and PDFs)',
          'We do not request: channels:history, users:read.email, admin.*. We cannot read your messages.',
        ],
      },
      {
        variant: 'slack', title: 'Install (Slack admin or Workspace Owner)',
        steps: [
          'Click "Add to Slack" in this page. A Slack consent screen opens listing exactly the scopes above.',
          'If your workspace requires app approval: Slack shows "Request to install". A Workspace Admin then opens Slack > your workspace name > Tools & settings > Manage apps > Requests (or api.slack.com/apps > Manage distribution), and approves "Beacon GEO".',
          'In the target channel, type /invite @Beacon GEO (needed for private channels).',
          'Click Test in this wizard to see a "Beacon is connected" message appear in your channel.',
        ],
        links: [{ label: 'Slack: manage app approvals', href: 'https://slack.com/help/articles/222386767-Manage-app-approval-for-your-workspace' }],
      },
      {
        variant: 'teams', title: 'Microsoft Teams',
        steps: [
          'A Global Administrator or Application Administrator must grant admin consent. Entra admin center (entra.microsoft.com) > Identity > Applications > Enterprise applications > Consent and permissions, or follow the admin-consent link we send.',
          'Application permissions requested: ChannelMessage.Send (post to a channel), Channel.ReadBasic.All (list channels), Team.ReadBasic.All (list teams). We do not request read access to messages.',
          'Teams admin center (admin.teams.microsoft.com) > Teams apps > Manage apps > upload or allow "Beacon GEO", then add it to the team: Teams > the team > Manage team > Apps > Add an app.',
          'Enter your tenant ID (Entra admin center > Overview > Tenant ID) and the channel in the form.',
        ],
        links: [{ label: 'Microsoft: grant tenant-wide admin consent', href: 'https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/grant-admin-consent' }],
      },
      { variant: 'none', title: 'No chat tool', steps: ['We will email reports to the contacts in the review step.'] },
    ],
    tests: [
      { id: 'chat_auth', label: 'Bot installed with the right scopes', description: 'Slack auth.test and read the x-oauth-scopes response header; all scopes above must be present. Partial: lists missing scopes (e.g. "missing files:write"). Teams: acquire a client-credentials token for tenant and decode the roles claim (ChannelMessage.Send, Channel.ReadBasic.All, Team.ReadBasic.All).', requires: ['chat_platform'] },
      { id: 'chat_post', label: 'Test message delivered', description: 'Slack chat.postMessage to the channel then delete it (or leave "Beacon is connected"). Partial: not_in_channel (bot not invited to a private channel) or channel_not_found. Teams: POST /teams/{id}/channels/{id}/messages.', requires: ['chat_platform'] },
    ],
  },

  // 15 ---------------------------------------------------------------------
  {
    id: 'review',
    title: 'Review & submit',
    short: 'Review',
    icon: 'ClipboardCheck',
    group: 'stack',
    why: 'One last look. We show every step with a status, so you can see what works, what is partial and what to fix. You can submit with optional steps pending; required steps must be green.',
    fields: [
      { id: 'billing_contact_email', label: 'Contact for reports and alerts', type: 'email', required: true },
      {
        id: 'final_confirm', label: 'I confirm the information and access granted are accurate and that I am authorised to grant them.', type: 'radio', required: true,
        options: [{ value: 'yes', label: 'Yes, I confirm' }],
      },
    ],
    instructions: [
      {
        title: 'What happens next',
        steps: [
          'We run all live tests one more time and email you a summary.',
          'Within one business day a strategist reviews your brand book and starts the first prompt discovery and baseline report.',
          'You can revoke any access at any time from the tool where you granted it. Secrets you entered here can be deleted from Settings > Integrations.',
        ],
      },
    ],
    tests: [
      { id: 'review_all_required_green', label: 'All required tests pass', description: 'Aggregates every required step. Blocked if any required test is failed. Partial/warning tests on required steps (e.g. GSC Full, not Owner) block submission until accepted by a platform admin; optional steps can be skipped.', requires: ['final_confirm'] },
    ],
  },
];

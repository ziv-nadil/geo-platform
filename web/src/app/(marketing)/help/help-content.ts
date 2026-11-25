import { ONBOARDING_STEPS, type OnboardingStep } from "@/config/onboarding";

export type FaqItem = { q: string; a: string };

export const FAQ: FaqItem[] = [
  { q: "Which AI engines do you track?", a: "ChatGPT, Perplexity, Gemini, Claude and Google AI Overviews. Your plan sets how many engines you can track at once." },
  { q: "How often are answers collected?", a: "Tracked prompts run on a daily schedule. Scores are recalculated from the most recent 30 days of runs, so one unusual day does not swing the picture." },
  { q: "Do you publish content for us?", a: "No. Articles are created as drafts in your CMS or as pull requests in your repository. Your team reviews and publishes them. Auto-publish is off unless you turn it on yourself." },
  { q: "Do you ever push to our main branch?", a: "No. Repository changes go through pull requests on a branch, so you review and merge them." },
  { q: "How do you store passwords and API keys?", a: "Secrets go straight to an encrypted per-client vault. The browser encrypts them before they are sent, and they are never shown back in the interface." },
  { q: "Can I revoke access?", a: "Yes. If you added our agency email as a guest, remove that user from each tool at any time. If you created a dedicated user, delete or disable it. Each tool's own settings page is the place to do this." },
  { q: "Do I have to finish every step?", a: "Required steps must pass before you can submit. Optional steps can stay pending, and you can come back to them later from the review page." },
  { q: "What does a partial test result mean?", a: "The connection works, but something needs attention. For example, the account can read a site but not publish to it, or a property is new and has no data yet. The test message says what to change." },
  { q: "Does the Slack bot read every channel?", a: "No. The bot only acts in channels you invite it to, and it posts reports and alerts there." },
  { q: "How do I change or cancel my plan?", a: "Plans and billing are managed from Settings in your workspace. Billing runs through Stripe, and you can switch between monthly and annual billing there." },
  { q: "Can I manage several brands?", a: "Yes. Each brand or client is its own workspace. Agency plans are built for managing many client accounts from one console." },
];

export function getStep(slug: string): OnboardingStep | undefined {
  return ONBOARDING_STEPS.find((s) => s.id === slug);
}

export const STEP_SLUGS = ONBOARDING_STEPS.map((s) => s.id);

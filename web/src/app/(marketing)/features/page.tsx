import type { Metadata } from "next";
import { Bot, ClipboardCheck, Link2, MessageSquareQuote, PenLine, Radar, Swords, Wrench, Users, Globe } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Features",
  description: "Track ChatGPT, Claude, Geminiand Google AI Overviews, see the sources behind every answer, and turn gaps into content.",
};

const SECTIONS = [
  {
    icon: Radar,
    title: "Answer monitoring",
    lead: "Know what AI engines say about your category, every day.",
    points: [
      "Tracked prompts built from your buyers' questions and personas",
      "Five engines: ChatGPT, Claude, Geminiand Google AI Overviews",
      "Each answer records which brands appear, in what order, and the sentiment of each mention",
    ],
  },
  {
    icon: Swords,
    title: "Competitive share of voice",
    lead: "See who wins the answers you should win.",
    points: [
      "Share of voice and average position against your top competitors",
      "Head-to-head win rate for every pair of brands named in the same answer",
      "Filter by engine, topic and time range",
    ],
  },
  {
    icon: Link2,
    title: "Source and citation intelligence",
    lead: "Find the pages that shape what engines recommend.",
    points: [
      "Every cited domain, classified as your site, a competitor, editorial, forum, review or reference",
      "Citation share for your own domains over time",
      "Source tags so your team can label the sites that matter",
    ],
  },
  {
    icon: PenLine,
    title: "Content gaps to listicles",
    lead: "Turn what engines cannot find about you into content.",
    points: [
      "Gap score ranks prompts where competitors appear and you do not",
      "Briefed listicles and comparisons written in your brand voice",
      "Drafts land in your CMS for review; nothing publishes without approval",
    ],
  },
  {
    icon: Wrench,
    title: "Site health and crawler analytics",
    lead: "Make sure AI engines can read and reach your pages.",
    points: [
      "AI-readability checks and an llms.txt status check",
      "Crawler hits by bot (GPTBot, ClaudeBot, PerplexityBot and more), counted only when verified",
      "Prioritized fixes weighted by issue severity",
    ],
  },
  {
    icon: ClipboardCheck,
    title: "Guided onboarding with live tests",
    lead: "Connect everything once, and know it works.",
    points: [
      "Step-by-step instructions for each integration, with the reason it is needed",
      "Live tests that say exactly what is missing, not just pass or fail",
      "Secrets stored in a per-client vault and never shown back",
    ],
  },
];

const EXTRAS = [
  { icon: Users, title: "Creators", body: "Find YouTube creators whose videos match your topics and that engines already cite." },
  { icon: Globe, title: "Multi-brand", body: "Separate workspaces for each client or product, with roles for owners, admins, members and viewers." },
  { icon: MessageSquareQuote, title: "Weekly reports", body: "A summary of visibility, citations and gaps delivered to email or your Slack channel." },
  { icon: Bot, title: "Agency console", body: "One place to see every client account, with invisible staff access that is fully audited." },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-12">
        <p className="text-xs font-semibold tracking-wide text-accent-ink uppercase">Features</p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-ink md:text-4xl">Everything it takes to win the answer.</h1>
        <p className="mt-4 max-w-2xl text-md leading-relaxed text-ink-2">
          GEO Engine watches the AI engines your buyers use, shows you why they choose who they choose, and gives you the work list to change it.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-6 md:grid-cols-2">
          {SECTIONS.map((s) => (
            <article key={s.title} className="rounded-md border border-line bg-surface p-6">
              <s.icon className="size-5 text-accent" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-semibold text-ink">{s.title}</h2>
              <p className="mt-1 text-sm font-medium text-ink-2">{s.lead}</p>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-ink-3">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-xl font-semibold text-ink">Also included</h2>
          <ul className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {EXTRAS.map((e) => (
              <li key={e.title}>
                <e.icon className="size-5 text-accent" aria-hidden="true" />
                <h3 className="mt-3 font-semibold text-ink">{e.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-3">{e.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 text-center">
        <h2 className="text-xl font-semibold text-ink">See it on your own brand.</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-3">Setup takes one guided session. Your first answers arrive once the live tests pass.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/signup" size="lg">Get started</ButtonLink>
          <ButtonLink href="/pricing" size="lg" variant="secondary">See pricing</ButtonLink>
        </div>
      </section>
    </>
  );
}

import { ArrowRight, Bot, ClipboardCheck, Link2, MessageSquareQuote, Swords, Wrench, Radar, ListOrdered, SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ENGINES } from "@/lib/ui/engines";

const STEPS = [
  { icon: Radar, title: "We monitor the answers", body: "Beacon asks ChatGPT, Perplexity, Gemini, Claude and Google AI Overviews the questions your buyers ask, every day, and records every brand they name and every source they cite." },
  { icon: SearchX, title: "We find the content gaps", body: "Where competitors win an answer and you are absent, we score the gap by how much the prompt matters and how authoritative the cited sources are." },
  { icon: ListOrdered, title: "We turn gaps into listicles", body: "Each gap becomes a briefed listicle or comparison in your brand voice, with the facts AI engines already trust, ready for your CMS as a draft." },
];

const FEATURES = [
  { icon: MessageSquareQuote, title: "Every prompt, every engine", body: "Your tracked prompts run on the engines that matter to your buyers, and each answer is saved with who gets named, in what order, and why." },
  { icon: Swords, title: "Share of voice vs competitors", body: "See which brands engines recommend instead of you, head to head, by engine and topic." },
  { icon: Link2, title: "The sources behind the answers", body: "Every citation, by domain and page type, so you know which reviews, forums and articles to win." },
  { icon: Wrench, title: "Fix what blocks you", body: "Site health checks for AI readability, crawler analytics by bot, and drafts written in your brand voice." },
  { icon: ClipboardCheck, title: "Onboarding that tests itself", body: "Each integration explains what we need, how to grant it, and runs a live test that says exactly what is missing." },
  { icon: Bot, title: "Built for agencies", body: "One console for all your client accounts, with per-client vaults for secrets and invisible staff access." },
];

export default function Home() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-16 pb-20 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1 text-xs font-medium text-ink-2">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" /> Generative Engine Optimization
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-5xl">Be the answer AI engines give.</h1>
          <p className="mt-5 max-w-xl text-md leading-relaxed text-ink-2">
            Beacon GEO measures how often ChatGPT, Perplexity, Gemini, Claude and Google AI Overviews recommend your brand, shows the sources behind every answer, and tells you what to change.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/signup" size="lg">
              Start onboarding <ArrowRight />
            </ButtonLink>
            <ButtonLink href="/features" size="lg" variant="secondary">
              See features
            </ButtonLink>
          </div>
        </div>
        <figure className="rounded-lg border border-line bg-canvas p-5" aria-label="Example of an AI answer with brand mentions highlighted">
          <figcaption className="mb-3 flex items-center justify-between text-xs text-ink-3">
            <span>“Best product analytics tool for a B2B SaaS startup?”</span>
            <span className="rounded-xs bg-surface px-1.5 py-0.5 font-medium text-ink-2">ChatGPT</span>
          </figcaption>
          <div className="space-y-2 rounded-md border border-line bg-surface p-4 text-sm leading-relaxed text-ink-2">
            <p>Here are the options most often recommended:</p>
            <p>
              1. <mark className="mention-competitor">A competitor</mark> is a popular choice with many integrations.<sup className="ml-0.5 font-mono text-2xs text-accent">[1]</sup>
            </p>
            <p>
              2. <mark className="mention-brand">Your brand</mark> is praised for setup speed and transparent pricing.<sup className="ml-0.5 font-mono text-2xs text-accent">[2]</sup>
            </p>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              ["Position", "#2"],
              ["Sentiment", "Positive"],
              ["Your citations", "1 of 4"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-sm border border-line bg-surface px-2 py-2">
                <dt className="text-2xs text-ink-4">{k}</dt>
                <dd className="text-sm font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </figure>
      </section>

      <section className="border-y border-line bg-canvas" aria-label="Engines we monitor">
        <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-6 text-sm text-ink-2">
          {ENGINES.slice(0, 5).map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: e.color }} aria-hidden="true" />
              {e.name}
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="max-w-xl text-xl font-semibold text-ink">From absent to cited, in three steps.</h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-md border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft font-mono text-xs font-semibold text-accent-ink">{i + 1}</span>
                <s.icon className="size-5 text-accent" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-md font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-3">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-line bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="max-w-xl text-xl font-semibold text-ink">Everything you need to grow AI visibility, in one clean workspace.</h2>
          <ul className="mt-10 grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex flex-col gap-2">
                <f.icon className="size-5 text-accent" aria-hidden="true" />
                <h3 className="font-sans text-md font-semibold text-ink">{f.title}</h3>
                <p className="text-sm leading-relaxed text-ink-3">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg border border-line bg-surface p-8 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-semibold text-ink">Start with your onboarding, then watch the answers move.</h2>
            <p className="mt-2 max-w-xl text-sm text-ink-3">Connect your site and tools in guided steps. Every step runs a live test, so you know what works before the first report.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <ButtonLink href="/signup">Get started <ArrowRight /></ButtonLink>
            <ButtonLink href="/pricing" variant="secondary">View pricing</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}

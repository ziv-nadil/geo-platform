import { ArrowRight, Bot, ClipboardCheck, Link2, MessageSquareQuote, Swords, Wrench } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ENGINES } from "@/lib/ui/engines";

const FEATURES = [
  { icon: MessageSquareQuote, title: "Every prompt, every engine", body: "We ask ChatGPT, Perplexity, Gemini, Claude and Google AI Overviews your buyers' questions every day and record who gets named, in what order, and why." },
  { icon: Swords, title: "Share of voice vs competitors", body: "See which brands engines recommend instead of you, head to head, by engine and topic." },
  { icon: Link2, title: "The sources behind the answers", body: "Every citation, by domain and page type, so you know which reviews, forums and articles to win." },
  { icon: Wrench, title: "Fix what blocks you", body: "Site health checks for AI readability, crawler analytics by bot, and drafts written in your brand voice." },
  { icon: ClipboardCheck, title: "Onboarding that tests itself", body: "Each integration explains what we need, how to grant it, and runs a live test that says exactly what is missing." },
  { icon: Bot, title: "Built for agencies", body: "One console for all your client accounts, with per-client vaults for secrets and invisible staff access." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-sm px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink">
            Sign in
          </Link>
          <ButtonLink href="/signup" size="sm">
            Get started
          </ButtonLink>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-16 pb-20 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1 text-xs font-medium text-ink-2">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" /> Generative Engine Optimization
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Be the answer AI engines give.</h1>
          <p className="mt-5 max-w-xl text-md leading-relaxed text-ink-2">
            Beacon GEO measures how often ChatGPT, Perplexity, Gemini, Claude and Google AI Overviews recommend your brand, shows the sources behind every answer, and tells you what to change.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/signup" size="lg">
              Start onboarding <ArrowRight />
            </ButtonLink>
            <ButtonLink href="/login" size="lg" variant="secondary">
              Sign in
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

      <section className="border-y border-line bg-canvas">
        <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-6 text-sm text-ink-2" aria-label="Engines we monitor">
          {ENGINES.slice(0, 5).map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: e.color }} aria-hidden="true" />
              {e.name}
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
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
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-ink-4">
          <span>Beacon GEO</span>
          <span>Light, fast, and honest about what it measures.</span>
        </div>
      </footer>
    </div>
  );
}

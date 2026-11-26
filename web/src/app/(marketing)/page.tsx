import { ArrowRight, Bot, ClipboardCheck, Link2, MessageSquareQuote, Swords, Wrench, Radar, ListOrdered, SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ArtBanner } from "@/components/marketing/art";
import { ENGINES } from "@/lib/ui/engines";

const STEPS = [
  { icon: Radar, title: "We monitor the answers", body: "GEO Engine asks ChatGPT, Claude, Gemini and Google AI Overviews the questions your buyers ask, every day, and records every brand they name and every source they cite." },
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
      <section className="relative overflow-hidden border-b border-line">
        <div className="hairline-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000,transparent)]" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-6 pt-20 text-center">
          <p className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-2xs font-medium uppercase tracking-[0.12em] text-ink-2 shadow-xs">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" /> Generative Engine Optimization
          </p>
          <h1 className="mx-auto max-w-3xl text-balance text-3xl font-semibold tracking-[-0.045em] text-ink md:text-[64px] md:leading-[1.02]">Be the answer AI engines give.</h1>
          <p className="mx-auto mt-6 max-w-xl text-md leading-relaxed text-ink-3">
            GEO Engine measures how often ChatGPT, Claude, Gemini and Google AI Overviews recommend your brand, shows the sources behind every answer, and tells you what to change.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/login" size="lg">
              Start onboarding <ArrowRight />
            </ButtonLink>
            <ButtonLink href="/features" size="lg" variant="secondary">
              See features
            </ButtonLink>
          </div>
          <figure className="relative mx-auto mt-16 max-w-5xl" aria-label="GEO Engine overview dashboard">
            <div className="overflow-hidden rounded-t-lg border border-b-0 border-line-strong bg-surface shadow-shot">
              <div className="flex h-9 items-center gap-1.5 border-b border-line bg-subtle px-3" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-line-strong" />
                <span className="size-2.5 rounded-full bg-line-strong" />
                <span className="size-2.5 rounded-full bg-line-strong" />
                <span className="ml-3 rounded-xs bg-surface px-3 py-0.5 font-mono text-2xs text-ink-4">app.beacongeo.com/overview</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/shots/overview.png" alt="Overview: visibility score, share of voice, citation share and visibility by engine" width={1440} height={900} className="block w-full" />
            </div>
          </figure>
        </div>
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
        <h2 className="max-w-xl text-xl font-semibold tracking-[-0.03em] text-ink">From absent to cited, in three steps.</h2>
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
        <p className="font-mono text-2xs font-medium uppercase tracking-[0.12em] text-ink-4">The product</p>
        <h2 className="mt-2 max-w-xl text-xl font-semibold tracking-[-0.03em] text-ink">Every number traces back to a real answer.</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {[
            ["/shots/competitors.png", "Competitors", "Head-to-head win rates and share of voice, by engine."],
            ["/shots/content.png", "Content", "Gaps turned into briefed, on-brand listicles ready for review."],
          ].map(([src, title, body]) => (
            <figure key={src} className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`${title} screen`} width={1440} height={900} loading="lazy" className="block w-full border-b border-line" />
              <figcaption className="p-5">
                <h3 className="text-md font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-sm text-ink-3">{body}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <ArtBanner>
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="max-w-lg text-xl font-semibold tracking-[-0.03em]">Start with your onboarding, then watch the answers move.</h2>
              <p className="mt-2 max-w-xl text-sm text-white/70">Connect your site and tools in guided steps. Every step runs a live test, so you know what works before the first report.</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <ButtonLink href="/login" className="bg-white !text-ink hover:bg-white/90">Get started <ArrowRight /></ButtonLink>
              <ButtonLink href="/pricing" variant="ghost" className="!text-white hover:bg-white/10">View pricing</ButtonLink>
            </div>
          </div>
        </ArtBanner>
      </section>
    </>
  );
}

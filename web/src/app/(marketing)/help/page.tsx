import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ONBOARDING_STEPS } from "@/config/onboarding";
import { FAQ } from "./help-content";

export const metadata: Metadata = {
  title: "Help center",
  description: "Guides for each onboarding step, metric definitions and answers to common questions.",
};

export default function HelpIndex() {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-accent-ink uppercase">Help center</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink md:text-3xl">How to connect ASO Engine</h1>
      <p className="mt-3 max-w-2xl text-md leading-relaxed text-ink-2">
        Each onboarding step below explains why we need it, what to provide and how to grant access. Every step ends with a live test.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-ink">Onboarding guides</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {ONBOARDING_STEPS.map((s, i) => (
          <li key={s.id}>
            <Link href={`/help/${s.id}`} className="group flex h-full items-start gap-3 rounded-md border border-line bg-surface p-4 hover:border-line-strong">
              <span className="mt-0.5 font-mono text-xs text-ink-4">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink group-hover:text-accent-ink">{s.title}</span>
                <span className="mt-1 block text-sm text-ink-3">{s.why.split(". ")[0]}.</span>
              </span>
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-ink-4 group-hover:text-accent" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link href="/help/metrics" className="rounded-md border border-line bg-canvas p-4 hover:border-line-strong">
          <span className="block font-medium text-ink">Metric definitions</span>
          <span className="mt-1 block text-sm text-ink-3">What each number means and how it is calculated.</span>
        </Link>
        <Link href="#faq" className="rounded-md border border-line bg-canvas p-4 hover:border-line-strong">
          <span className="block font-medium text-ink">Frequently asked questions</span>
          <span className="mt-1 block text-sm text-ink-3">Engines, data, security, access and billing.</span>
        </Link>
      </div>

      <section id="faq" className="mt-16 scroll-mt-24">
        <h2 className="text-lg font-semibold text-ink">Frequently asked questions</h2>
        <dl className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
          {FAQ.map((f) => (
            <div key={f.q} className="p-5">
              <dt className="font-medium text-ink">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-3">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

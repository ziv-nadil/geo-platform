import Link from "next/link";
import type { ReactNode } from "react";
import { ONBOARDING_STEPS } from "@/config/onboarding";

export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Help center" className="text-sm md:sticky md:top-24 md:self-start">
        <Link href="/help" className="block font-semibold text-ink">Help center</Link>
        <p className="mt-5 text-2xs font-semibold tracking-wide text-ink-4 uppercase">Onboarding</p>
        <ul className="mt-2 space-y-0.5">
          {ONBOARDING_STEPS.map((s, i) => (
            <li key={s.id}>
              <Link href={`/help/${s.id}`} className="block rounded-xs px-2 py-1.5 text-ink-2 hover:bg-subtle hover:text-ink">
                <span className="mr-1.5 font-mono text-2xs text-ink-4">{i + 1}.</span>
                {s.short}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-2xs font-semibold tracking-wide text-ink-4 uppercase">Reference</p>
        <ul className="mt-2 space-y-0.5">
          <li><Link href="/help/metrics" className="block rounded-xs px-2 py-1.5 text-ink-2 hover:bg-subtle hover:text-ink">Metric definitions</Link></li>
          <li><Link href="/help#faq" className="block rounded-xs px-2 py-1.5 text-ink-2 hover:bg-subtle hover:text-ink">FAQ</Link></li>
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Help center" },
];

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/" aria-label="ASO Engine home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-sm px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-sm px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink">
              Sign in
            </Link>
            <ButtonLink href="/login" size="sm">
              Get started
            </ButtonLink>
          </div>
        </div>
        <nav aria-label="Main mobile" className="flex gap-1 overflow-x-auto border-t border-line px-6 py-2 md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0 rounded-sm px-3 py-1.5 text-sm font-medium text-ink-2 hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-[1fr_auto]">
          <div>
            <Logo />
            <p className="mt-3 max-w-sm text-sm text-ink-3">Measure and grow how AI engines talk about your brand.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2 sm:justify-end">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-ink">
                {n.label}
              </Link>
            ))}
            <Link href="/login" className="hover:text-ink">Sign in</Link>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-8 text-xs text-ink-4">© ASO Engine</div>
      </footer>
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,560px)]">
      <aside className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <Link href="/" aria-label="ASO Engine home" className="[&_span]:!text-white">
          <Logo />
        </Link>
        <div className="max-w-md">
          <p className="font-display text-2xl leading-snug font-semibold">“We went from absent to the second brand ChatGPT names for our category in six weeks.”</p>
          <p className="mt-4 text-sm text-white/60">What our clients aim for. Track every engine, see every source, fix what holds you back.</p>
        </div>
        <ul className="grid grid-cols-4 gap-2 text-2xs text-white/60">
          {["ChatGPT", "Claude", "Gemini", "AI Overviews"].map((e) => (
            <li key={e} className="rounded-sm border border-white/15 px-2 py-1 text-center">{e}</li>
          ))}
        </ul>
      </aside>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

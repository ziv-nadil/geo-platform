
/** Abstract signal-field art: concentric hairline arcs and a data grid. Pure SVG, no assets. */
export function SignalArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 400" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="sa-glow" cx="78%" cy="40%" r="55%">
          <stop offset="0" stopColor="#6c67f2" stopOpacity="0.55" />
          <stop offset="1" stopColor="#6c67f2" stopOpacity="0" />
        </radialGradient>
        <pattern id="sa-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#fff" strokeOpacity="0.07" />
        </pattern>
      </defs>
      <rect width="800" height="400" fill="#0b0c0f" />
      <rect width="800" height="400" fill="url(#sa-grid)" />
      <rect width="800" height="400" fill="url(#sa-glow)" />
      {[60, 110, 165, 225, 290, 360].map((r) => (
        <circle key={r} cx="620" cy="160" r={r} fill="none" stroke="#fff" strokeOpacity={0.5 - r / 900} />
      ))}
      <circle cx="620" cy="160" r="5" fill="#a5a2ff" />
    </svg>
  );
}

/** Dark banner with generated SignalArt (no stock photos; Bria covers imagery). */
export function ArtBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate overflow-hidden rounded-lg border border-line bg-ink text-white shadow-shot">
      <SignalArt className="absolute inset-0 -z-10 size-full" />
      <div className="relative p-8 md:p-12">{children}</div>
    </div>
  );
}

import { getUnsplashPhoto } from "@/lib/unsplash";

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

/** Dark banner: an Unsplash photo when UNSPLASH_ACCESS_KEY is set, otherwise SignalArt. */
export async function ArtBanner({ query = "abstract architecture minimal", children }: { query?: string; children: React.ReactNode }) {
  const photo = await getUnsplashPhoto(query);
  return (
    <div className="relative isolate overflow-hidden rounded-lg border border-line bg-ink text-white shadow-shot">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.src} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-50" />
      ) : (
        <SignalArt className="absolute inset-0 -z-10 size-full" />
      )}
      <div className="relative p-8 md:p-12">{children}</div>
      {photo ? (
        <a href={photo.creditUrl} className="absolute right-3 bottom-2 text-2xs text-white/60 hover:text-white">
          Photo: {photo.credit} / Unsplash
        </a>
      ) : null}
    </div>
  );
}

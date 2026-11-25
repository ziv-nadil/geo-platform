import "server-only";

export type UnsplashPhoto = { src: string; alt: string; credit: string; creditUrl: string };

/**
 * Editorial photo from Unsplash, only when UNSPLASH_ACCESS_KEY is set. Without a key (or on any
 * failure) returns null and callers render abstract CSS/SVG art. Images are hotlinked from
 * images.unsplash.com as the Unsplash API guidelines require, never without a key.
 */
export async function getUnsplashPhoto(query: string): Promise<UnsplashPhoto | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.unsplash.com/photos/random?orientation=landscape&content_filter=high&query=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" }, next: { revalidate: 60 * 60 * 24 } },
    );
    if (!res.ok) return null;
    const p = await res.json();
    const utm = "utm_source=beacon_geo&utm_medium=referral";
    return {
      src: `${p.urls.raw}&w=1600&q=80&fm=jpg&fit=crop`,
      alt: p.alt_description ?? query,
      credit: p.user?.name ?? "Unsplash",
      creditUrl: `${p.user?.links?.html ?? "https://unsplash.com"}?${utm}`,
    };
  } catch {
    return null;
  }
}

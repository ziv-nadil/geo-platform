/**
 * Chart colors. Recharts writes SVG presentation attributes, where CSS variables are
 * unreliable, so the values are duplicated here as hex. Keep in sync with globals.css.
 * Palettes validated with the dataviz skill's validate_palette.js (light surface).
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"] as const;

/** The client's own brand in competitive charts. */
export const BRAND_SERIES = "#4a45e0";

/** Competitor slots that pass all checks next to BRAND_SERIES, in fixed order. */
export const COMPETITOR_SERIES = ["#eb6834", "#0b9a94", "#e87ba4", "#eda100", "#5b616c"] as const;

export const CHART_INK = {
  grid: "#e6e6ea",
  axis: "#4f535d",
  muted: "#8b8e98",
  surface: "#ffffff",
} as const;

export const STATUS_COLORS = {
  good: "#0f7b3d",
  warn: "#f0a91b",
  bad: "#c2312f",
  neutral: "#8b8e98",
} as const;

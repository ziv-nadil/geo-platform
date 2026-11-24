/**
 * Chart colors. Recharts writes SVG presentation attributes, where CSS variables are
 * unreliable, so the values are duplicated here as hex. Keep in sync with globals.css.
 * Palettes validated with the dataviz skill's validate_palette.js (light surface).
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"] as const;

/** The client's own brand in competitive charts. */
export const BRAND_SERIES = "#008c99";

/** Competitor slots that pass all checks next to BRAND_SERIES, in fixed order. */
export const COMPETITOR_SERIES = ["#eb6834", "#2a78d6", "#e87ba4", "#6250d6", "#eda100"] as const;

export const CHART_INK = {
  grid: "#e3e6ea",
  axis: "#5f6874",
  muted: "#8a929c",
  surface: "#ffffff",
} as const;

export const STATUS_COLORS = {
  good: "#0f7b3d",
  warn: "#f0a91b",
  bad: "#c2312f",
  neutral: "#8a929c",
} as const;

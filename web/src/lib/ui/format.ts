const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US");
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function fmtNumber(n: number): string {
  return Math.abs(n) >= 10_000 ? compact.format(n) : whole.format(Math.round(n));
}

export function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function fmtUsd(n: number): string {
  return usd.format(n);
}

export function fmtDelta(n: number, unit: "pt" | "%" | "" = "pt", digits = 1): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "±";
  return `${sign}${Math.abs(n).toFixed(digits)}${unit ? (unit === "pt" ? " pt" : unit) : ""}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format an ISO date (YYYY-MM-DD or full ISO) as "Nov 24" without timezone drift. */
export function fmtDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function fmtDateTime(iso: string): string {
  const time = iso.length > 10 ? iso.slice(11, 16) : "";
  return `${fmtDate(iso)}${time ? ` · ${time} UTC` : ""}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

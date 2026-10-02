const TZ = "Asia/Kuala_Lumpur";

/** Today's date in Malaysia as YYYY-MM-DD (servers usually run in UTC). */
export function todayMY(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: d.length === 10 ? undefined : TZ,
  });
}

/** Every YYYY-MM-DD from `from` to `to` inclusive, capped at `max` days. */
export function dateRange(from: string, to: string, max = 31): string[] {
  const out: string[] = [];
  const d = new Date(from + "T00:00:00Z");
  while (out.length < max) {
    const s = d.toISOString().slice(0, 10);
    if (s > to) break;
    out.push(s);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString("en-MY", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function fmtQty(n: number): string {
  return Number(n).toLocaleString("en-MY", { maximumFractionDigits: 2 });
}

/**
 * Turns messy Malaysian phone numbers into WhatsApp format (60123456789).
 * "012-345 6789", "+6012 3456789", "12-3456789" → "60123456789".
 * If several numbers are listed ("012-3456789 / 03-12345678") the first is used.
 * Returns null when nothing usable is found.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(/[\/,;]|\bor\b/i)[0];
  let d = first.replace(/\D/g, "");
  if (d.startsWith("0")) d = "6" + d;
  else if (d.startsWith("1")) d = "60" + d;
  return /^60\d{8,10}$/.test(d) ? d : null;
}

/** Mobile numbers (601x...) can receive WhatsApp; landlines (603...) cannot. */
export function isMobile(normalized: string | null): boolean {
  return !!normalized && /^601\d{8,9}$/.test(normalized);
}

export function mapsLinks(address: string) {
  const q = encodeURIComponent(address);
  return {
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
  };
}

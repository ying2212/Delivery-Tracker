/**
 * Driver commission rules — change the numbers here.
 * - Each DO is worth points: FAR_POINTS when the store → customer driving
 *   distance is over FAR_KM, else NEAR_POINTS (or what the office keyed in).
 * - The first POINTS_TARGET points in a day earn nothing; every point after
 *   that earns RM_PER_POINT (e.g. 11 pts = RM 5, 12 pts = RM 10).
 */
export const POINTS_TARGET = 10;
export const RM_PER_POINT = 5;
export const FAR_KM = 20;
export const FAR_POINTS = 3;
export const NEAR_POINTS = 2;

export const pointsForKm = (km: number) => (km > FAR_KM ? FAR_POINTS : NEAR_POINTS);

/** RM earned for one day's points. */
export const commissionForDay = (points: number) => Math.max(0, points - POINTS_TARGET) * RM_PER_POINT;

/** Groups delivered DOs by Malaysian calendar day of delivery. */
export function dayTotals(rows: { delivered_at: string | null; points: number | null }[]) {
  const days = new Map<string, { delivered: number; points: number; missingPoints: number }>();
  for (const r of rows) {
    if (!r.delivered_at) continue;
    const day = new Date(r.delivered_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
    const t = days.get(day) ?? { delivered: 0, points: 0, missingPoints: 0 };
    t.delivered += 1;
    if (r.points == null) t.missingPoints += 1;
    else t.points += r.points;
    days.set(day, t);
  }
  return days;
}

/** Totals over several days: commission is worked out per day, then added up. */
export function sumDays(days: Map<string, { delivered: number; points: number; missingPoints: number }>) {
  let delivered = 0, points = 0, missingPoints = 0, rm = 0;
  for (const d of days.values()) {
    delivered += d.delivered;
    points += d.points;
    missingPoints += d.missingPoints;
    rm += commissionForDay(d.points);
  }
  return { delivered, points, missingPoints, rm };
}
